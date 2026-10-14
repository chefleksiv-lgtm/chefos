// ChefOS v2.0 — сервер аккаунтов и синхронизации (offline-first).
// ТОЛЬКО built-in модули Node (http, https, fs, path, crypto). Ноль зависимостей.
//
// Модель: один логин = одна изолированная кухня. Никаких общих секретов.
//
//   GET  /api/ping                          (без авторизации, health-check)
//   POST /api/register {login, password}    -> 201 {ok:true, userId} | 409 {error:'login_taken'} | 400 validation
//   POST /api/login {login, password}       -> 200 {ok:true, token, login, userId} | 401 {error:'bad_credentials'}
//   POST /api/logout                        (Bearer) -> 200 {ok:true}
//   GET  /api/pull                          (Bearer) -> {state, keyTs} — данные ТОЛЬКО этого пользователя
//   POST /api/push {deviceId, state, keyTs} (Bearer) -> {state, keyTs} — merge per-collection LWW внутри аккаунта
//   POST /api/square-import {date}              (Bearer) -> {ok, items:[{name,qty}], orders} — продажи дня из Square (нужны SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID)
//   GET  /api/me                                (Bearer) -> {ok, userId, login}
//   GET  /api/preorders                         (Bearer) -> {ok, orders:[...]}
//   POST /api/preorders/status {id, status}     (Bearer) -> {ok}
//   GET  /api/public/menu?u=&loc=                        -> {ok, locationName, items:[{id,name,price}]} (публично)
//   POST /api/public/order {u,loc,items,name,...}        -> {ok, id} (публично, rate-limit)
//   GET  /...                               -> статика фронта (FRONT_DIR)
//
// Авторизация: заголовок Authorization: Bearer <token>. Токены — crypto.randomBytes,
// хранятся в памяти сервера (после рестарта нужно войти заново).
// Пароли: pbkdf2-sha256, 120000 итераций, соль 16 байт.
//
// Хранилище — интерфейс StorageBackend (все методы async):
//   loadUsers()                  -> { login: {userId, login, salt, hash, createdAt} }
//   saveUsers(users)
//   loadUserStore(userId)        -> {state, keyTs} | null
//   saveUserStore(userId, {state, keyTs})
// FileBackend (default): $SYNC_DATA_DIR/users.json + $SYNC_DATA_DIR/users/<userId>.json
// TursoBackend: env TURSO_URL + TURSO_AUTH_TOKEN (Hrana HTTP API через built-in https).
// Выбор бэкенда — по наличию env.
//
// CORS: Access-Control-Allow-Origin: * (фронт могут открывать и с file://).

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = (process.env.PORT !== undefined && process.env.PORT !== '') ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = process.env.SYNC_DATA_DIR || path.join(__dirname, 'data');
const FRONT_DIR = process.env.FRONT_DIR || path.join(__dirname, '..', 'ChefOS', 'ChefOS');
const BODY_LIMIT = 25 * 1024 * 1024; // 25 MB

// ============================================================================
// StorageBackend
// ============================================================================

class FileBackend {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.usersFile = path.join(dataDir, 'users.json');
        this.usersDir = path.join(dataDir, 'users');
        this.sessionsFile = path.join(dataDir, 'sessions.json');
    }
    _readJson(file, fallback) {
        try {
            const raw = fs.readFileSync(file, 'utf8');
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) { return fallback; }
    }
    _writeJsonAtomic(file, obj) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + '.tmp-' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(obj));
        fs.renameSync(tmp, file);
    }
    async loadUsers() { return this._readJson(this.usersFile, {}); }
    async saveUsers(users) { this._writeJsonAtomic(this.usersFile, users || {}); }
    // --- предзаказы (v2.7) ---
    async addPreorder(po) {
        await this._ready;
        await this._pipeline([{
            sql: 'INSERT INTO preorders (id, user_id, location_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            args: [hranaValue(po.id), hranaValue(po.userId), hranaValue(po.locationId || ''), hranaValue(JSON.stringify(po.payload)), hranaValue('new'), hranaValue(Date.now())]
        }]);
    }
    async listPreorders(userId) {
        await this._ready;
        const [r] = await this._pipeline([{
            sql: 'SELECT id, location_id, payload, status, created_at FROM preorders WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
            args: [hranaValue(userId)]
        }]);
        const result = r && r.response && r.response.result;
        const rows = (result && result.rows) || [];
        return rows.map(row => {
            let payload = {};
            try { payload = JSON.parse(hranaCell(row[2]) || '{}'); } catch (e) {}
            return { id: hranaCell(row[0]), location_id: hranaCell(row[1]), payload, status: hranaCell(row[3]), created_at: Number(hranaCell(row[4])) };
        });
    }
    async setPreorderStatus(userId, id, status) {
        await this._ready;
        const ok = ['new', 'accepted', 'done', 'cancelled'].includes(status);
        if (!ok) return false;
        await this._pipeline([{
            sql: 'UPDATE preorders SET status = ? WHERE id = ? AND user_id = ?',
            args: [hranaValue(status), hranaValue(id), hranaValue(userId)]
        }]);
        return true;
    }
    async loadSessions() { return this._readJson(this.sessionsFile, {}); }
    async saveSession(token, sess) {
        const all = this._readJson(this.sessionsFile, {});
        all[token] = sess;
        this._writeJsonAtomic(this.sessionsFile, all);
    }
    async deleteSession(token) {
        const all = this._readJson(this.sessionsFile, {});
        if (all[token]) { delete all[token]; this._writeJsonAtomic(this.sessionsFile, all); }
    }
    async loadUserStore(userId) {
        const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safe) return null;
        const data = this._readJson(path.join(this.usersDir, safe + '.json'), null);
        if (!data) return null;
        return { state: data.state || {}, keyTs: data.keyTs || {} };
    }
    async saveUserStore(userId, store) {
        const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safe) throw new Error('bad userId');
        this._writeJsonAtomic(path.join(this.usersDir, safe + '.json'),
            { state: (store && store.state) || {}, keyTs: (store && store.keyTs) || {} });
    }
    // --- предзаказы (v2.7, файловый бэкенд) ---
    _preordersFile(userId) {
        const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
        return path.join(this.usersDir, 'preorders_' + safe + '.json');
    }
    async addPreorder(po) {
        const f = this._preordersFile(po.userId);
        const arr = this._readJson(f, []);
        arr.unshift({ id: po.id, location_id: po.locationId || '', payload: po.payload, status: 'new', created_at: Date.now() });
        this._writeJsonAtomic(f, arr.slice(0, 500));
    }
    async listPreorders(userId) {
        return this._readJson(this._preordersFile(userId), []);
    }
    async setPreorderStatus(userId, id, status) {
        if (!['new', 'accepted', 'done', 'cancelled'].includes(status)) return false;
        const f = this._preordersFile(userId);
        const arr = this._readJson(f, []);
        const o = arr.find(x => x.id === id);
        if (!o) return false;
        o.status = status;
        this._writeJsonAtomic(f, arr);
        return true;
    }
}

// --- Turso через Hrana HTTP API (built-in https, ноль зависимостей) ---
function hranaValue(v) {
    if (v === null || v === undefined) return { type: 'null' };
    if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
    if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
    return { type: 'text', value: String(v) };
}
function hranaCell(cell) {
    if (!cell || cell.type === 'null') return null;
    if (cell.type === 'integer') return parseInt(cell.value, 10);
    if (cell.type === 'float') return Number(cell.value);
    return cell.value;
}
class TursoBackend {
    constructor(url, authToken) {
        // TURSO_URL вида libsql://xyz.turso.io -> https://xyz.turso.io
        const normalized = String(url).replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
        this.baseUrl = new URL(normalized);
        this.authToken = authToken;
        this._ready = this._init();
        this._ready.catch(() => {}); // ошибку инициализации увидят вызовы (await this._ready -> 500), процесс не падает
    }
    _pipeline(statements) {
        const self = this;
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({ requests: statements.map(s => ({ type: 'execute', stmt: s })) });
            const req = https.request({
                hostname: self.baseUrl.hostname,
                port: self.baseUrl.port || 443,
                path: '/v2/pipeline',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + self.authToken,
                    'Content-Length': Buffer.byteLength(body)
                }
            }, res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => {
                    let parsed;
                    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
                    catch (e) { reject(new Error('turso: bad response JSON')); return; }
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error('turso: HTTP ' + res.statusCode + ' ' + JSON.stringify(parsed).slice(0, 200)));
                        return;
                    }
                    resolve(parsed.results || []);
                });
            });
            req.on('error', reject);
            req.setTimeout(15000, () => { req.destroy(new Error('turso: request timeout')); });
            req.end(body);
        });
    }
    async _init() {
        await this._pipeline([
            { sql: 'CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL)' },
            { sql: 'CREATE TABLE IF NOT EXISTS stores (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL)' },
            { sql: 'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, login TEXT NOT NULL, created_at INTEGER NOT NULL)' },
            { sql: 'CREATE TABLE IF NOT EXISTS preorders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, location_id TEXT, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'new\', created_at INTEGER NOT NULL)' },
            { sql: 'CREATE INDEX IF NOT EXISTS idx_preorders_user ON preorders (user_id, status, created_at)' }
        ]);
    }
    async loadUsers() {
        await this._ready;
        const [r] = await this._pipeline([
            { sql: 'SELECT user_id, login, salt, hash, created_at FROM users' }
        ]);
        const out = {};
        const result = r && r.response && r.response.result;
        if (result && Array.isArray(result.rows)) {
            for (const row of result.rows) {
                const [userId, login, salt, hash, createdAt] = row.map(hranaCell);
                if (login) out[login] = { userId, login, salt, hash, createdAt };
            }
        }
        return out;
    }
    async saveUsers(users) {
        await this._ready;
        const stmts = Object.values(users || {}).map(u => ({
            sql: 'INSERT INTO users (user_id, login, salt, hash, created_at) VALUES (?, ?, ?, ?, ?) ' +
                 'ON CONFLICT(login) DO UPDATE SET user_id=excluded.user_id, salt=excluded.salt, hash=excluded.hash',
            args: [hranaValue(u.userId), hranaValue(u.login), hranaValue(u.salt), hranaValue(u.hash), hranaValue(u.createdAt)]
        }));
        if (stmts.length) await this._pipeline(stmts);
    }
    async loadUserStore(userId) {
        await this._ready;
        const [r] = await this._pipeline([
            { sql: 'SELECT payload FROM stores WHERE user_id = ?', args: [hranaValue(userId)] }
        ]);
        const result = r && r.response && r.response.result;
        const row = result && result.rows && result.rows[0];
        if (!row) return null;
        try {
            const parsed = JSON.parse(hranaCell(row[0]) || '{}');
            return { state: parsed.state || {}, keyTs: parsed.keyTs || {} };
        } catch (e) { return null; }
    }
    async saveUserStore(userId, store) {
        await this._ready;
        const payload = JSON.stringify({ state: (store && store.state) || {}, keyTs: (store && store.keyTs) || {} });
        await this._pipeline([{
            sql: 'INSERT INTO stores (user_id, payload) VALUES (?, ?) ' +
                 'ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload',
            args: [hranaValue(userId), hranaValue(payload)]
        }]);
    }
    async loadSessions() {
        await this._ready;
        const [r] = await this._pipeline([
            { sql: 'SELECT token, user_id, login, created_at FROM sessions' }
        ]);
        const out = {};
        const result = r && r.response && r.response.result;
        if (result && Array.isArray(result.rows)) {
            for (const row of result.rows) {
                const [token, userId, login, createdAt] = row.map(hranaCell);
                if (token) out[token] = { userId, login, createdAt };
            }
        }
        return out;
    }
    async saveSession(token, sess) {
        await this._ready;
        await this._pipeline([{
            sql: 'INSERT INTO sessions (token, user_id, login, created_at) VALUES (?, ?, ?, ?) ' +
                 'ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id, login=excluded.login',
            args: [hranaValue(token), hranaValue(sess.userId), hranaValue(sess.login), hranaValue(sess.createdAt)]
        }]);
    }
    async deleteSession(token) {
        await this._ready;
        await this._pipeline([
            { sql: 'DELETE FROM sessions WHERE token = ?', args: [hranaValue(token)] }
        ]);
    }
}

function selectBackend() {
    const tursoUrl = process.env.TURSO_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;
    if (tursoUrl && tursoToken) {
        console.log('[chefos] storage backend: turso');
        return new TursoBackend(tursoUrl, tursoToken);
    }
    console.log('[chefos] storage backend: file (' + DATA_DIR + ')');
    return new FileBackend(DATA_DIR);
}
const backend = selectBackend();

// ============================================================================
// Аккаунты: хэши, токены, валидация
// ============================================================================

const PBKDF2_ITER = 120000;
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITER, 32, 'sha256').toString('hex');
}
function newSalt() { return crypto.randomBytes(16).toString('hex'); }
function newUserId() { return 'u_' + crypto.randomBytes(12).toString('hex'); }
function newToken() { return crypto.randomBytes(32).toString('hex'); }

const LOGIN_RE = /^[a-z0-9_]{3,32}$/;
function validateLogin(login) {
    return typeof login === 'string' && LOGIN_RE.test(login.trim().toLowerCase());
}
function validatePassword(password) {
    return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

// токен -> { userId, login, createdAt } (персистентно в бэкенде; переживает рестарт)
const tokens = new Map();
async function issueToken(user) {
    const token = newToken();
    const sess = { userId: user.userId, login: user.login, createdAt: Date.now() };
    tokens.set(token, sess);
    try { await backend.saveSession(token, sess); } catch (e) { console.error('[chefos] saveSession failed:', e.message); }
    return token;
}
async function revokeToken(token) {
    tokens.delete(token);
    try { await backend.deleteSession(token); } catch (e) { /* ignore */ }
}
async function restoreSessions() {
    try {
        const saved = await backend.loadSessions();
        let n = 0;
        for (const [token, sess] of Object.entries(saved || {})) {
            if (token && sess && sess.userId) { tokens.set(token, sess); n++; }
        }
        if (n) console.log('[chefos] restored ' + n + ' session(s)');
    } catch (e) { console.error('[chefos] restoreSessions failed:', e.message); }
}
// --- rate limit в памяти: защита логина/регистрации от брутфорса ---
const _rlBuckets = new Map();
function rateLimit(key, max, windowMs) {
    const now = Date.now();
    let b = _rlBuckets.get(key);
    if (!b || now - b.start > windowMs) { b = { n: 0, start: now }; _rlBuckets.set(key, b); }
    b.n++;
    if (_rlBuckets.size > 5000) {
        for (const [k, v] of _rlBuckets) if (now - v.start > windowMs) _rlBuckets.delete(k);
    }
    return b.n <= max;
}
function clientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}
const TOKEN_TTL = 180 * 24 * 3600 * 1000; // токены живут 180 дней
function authUser(req) {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/.exec(String(h).trim());
    if (!m) return null;
    const sess = tokens.get(m[1]);
    if (!sess) return null;
    if (Date.now() - (sess.createdAt || 0) > TOKEN_TTL) {
        tokens.delete(m[1]);
        revokeToken(m[1]).catch(() => {});
        return null;
    }
    return sess;
}

// ============================================================================
// Merge: per-collection last-write-wins (внутри одного аккаунта)
// ============================================================================

function unionKeyTs(a, b) {
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) out[k] = Math.max((a && a[k]) || 0, (b && b[k]) || 0);
    return out;
}
function mergeUserStore(store, incomingState, incomingTs) {
    store = store || { state: {}, keyTs: {} };
    incomingState = (incomingState && typeof incomingState === 'object') ? incomingState : {};
    incomingTs = (incomingTs && typeof incomingTs === 'object') ? incomingTs : {};
    const state = {};
    const keyTs = {};
    const keys = new Set([...Object.keys(store.state || {}), ...Object.keys(incomingState)]);
    keys.delete('syncMeta');
    keys.delete('syncLog');
    for (const key of keys) {
        const lts = (store.keyTs && store.keyTs[key]) || 0;
        const rts = incomingTs[key] || 0;
        if (rts > lts) { state[key] = incomingState[key]; keyTs[key] = rts; }
        else { state[key] = store.state[key]; keyTs[key] = lts; }
    }
    // syncLog: union без дублей, кап 200
    const seen = new Set();
    const log = [];
    [(store.state || {}).syncLog, incomingState.syncLog].forEach(arr => {
        (arr || []).forEach(entry => {
            let sig;
            try { sig = JSON.stringify(entry); } catch (x) { sig = 'rnd' + Math.random(); }
            if (!seen.has(sig)) { seen.add(sig); log.push(entry); }
        });
    });
    log.sort((a, b) => (((a && a.ts) || 0) - ((b && b.ts) || 0)));
    state.syncLog = log.slice(-200);
    keyTs.syncLog = 0;
    // syncMeta: не перезаписываем чужими целиком — только union keyTs
    const base = (store.state && store.state.syncMeta) || incomingState.syncMeta || {};
    const sm = Object.assign({}, base);
    sm.keyTs = unionKeyTs(base.keyTs, incomingState.syncMeta && incomingState.syncMeta.keyTs);
    for (const k of Object.keys(keyTs)) sm.keyTs[k] = Math.max(sm.keyTs[k] || 0, keyTs[k] || 0);
    state.syncMeta = sm;
    keyTs.syncMeta = 0;
    return { state, keyTs };
}

// ============================================================================
// HTTP helpers
// ============================================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }, CORS));
    res.end(body);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', c => {
            size += c.length;
            if (size > BODY_LIMIT) { reject(new Error('body too large')); req.destroy(); }
            else chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
async function readJsonBody(req, res) {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (e) { send(res, 400, { ok: false, error: 'invalid_json' }); return null; }
    return (body && typeof body === 'object') ? body : null;
}
function requireAuth(req, res) {
    const user = authUser(req);
    if (!user) { send(res, 401, { ok: false, error: 'unauthorized' }); return null; }
    return user;
}

// ============================================================================
// Статика фронта
// ============================================================================

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8'
};
function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
    const file = path.join(FRONT_DIR, safe);
    if (!file.startsWith(path.normalize(FRONT_DIR) + path.sep) && file !== path.normalize(FRONT_DIR)) {
        send(res, 403, { ok: false, error: 'forbidden' });
        return;
    }
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { send(res, 404, { ok: false, error: 'not found' }); return; }
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }, CORS));
        fs.createReadStream(file).pipe(res);
    });
}

// ============================================================================
// Сервер
// ============================================================================

const server = http.createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, CORS);
            res.end();
            return;
        }
        const url = new URL(req.url, 'http://localhost');
        const p = url.pathname;
        if (p !== '/api/ping') console.log('[chefos]', new Date().toISOString(), req.method, p);

        // --- ping ---
        if (req.method === 'GET' && p === '/api/ping') {
            send(res, 200, { ok: true, time: Date.now(), version: '2.0.0' });
            return;
        }

        // --- register ---
        if (req.method === 'POST' && p === '/api/register') {
            if (!rateLimit('reg:' + clientIp(req), 10, 3600 * 1000)) { send(res, 429, { ok: false, error: 'rate_limited' }); return; }
            const body = await readJsonBody(req, res);
            if (!body) return;
            const login = String(body.login || '').trim().toLowerCase();
            if (!validateLogin(login) || !validatePassword(body.password)) {
                send(res, 400, { ok: false, error: 'validation' });
                return;
            }
            const users = await backend.loadUsers();
            if (users[login]) { send(res, 409, { ok: false, error: 'login_taken' }); return; }
            const salt = newSalt();
            const user = { userId: newUserId(), login, salt, hash: hashPassword(body.password, salt), createdAt: Date.now() };
            users[login] = user;
            await backend.saveUsers(users);
            console.log('[chefos] registered', login);
            send(res, 201, { ok: true, userId: user.userId });
            return;
        }

        // --- login ---
        if (req.method === 'POST' && p === '/api/login') {
            if (!rateLimit('login:' + clientIp(req), 20, 10 * 60 * 1000)) { send(res, 429, { ok: false, error: 'rate_limited' }); return; }
            const body = await readJsonBody(req, res);
            if (!body) return;
            const login = String(body.login || '').trim().toLowerCase();
            const users = await backend.loadUsers();
            const user = users[login];
            let okPw = false;
            if (user && typeof body.password === 'string') {
                try {
                    const h = hashPassword(body.password, user.salt);
                    okPw = h.length === user.hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(user.hash));
                } catch (e) { okPw = false; }
            }
            if (!user || !okPw) { send(res, 401, { ok: false, error: 'bad_credentials' }); return; }
            const token = await issueToken(user);
            send(res, 200, { ok: true, token, login: user.login, userId: user.userId });
            return;
        }

        // --- logout ---
        if (req.method === 'POST' && p === '/api/logout') {
            const h = req.headers['authorization'] || '';
            const m = /^Bearer\s+(.+)$/.exec(String(h).trim());
            if (m) await revokeToken(m[1]);
            send(res, 200, { ok: true });
            return;
        }

        // --- pull (per-user) ---
        if (req.method === 'GET' && p === '/api/pull') {
            const user = requireAuth(req, res);
            if (!user) return;
            const store = (await backend.loadUserStore(user.userId)) || { state: {}, keyTs: {} };
            send(res, 200, { state: store.state, keyTs: store.keyTs });
            return;
        }

        // --- push (per-user, LWW merge) ---
        if (req.method === 'POST' && p === '/api/push') {
            const user = requireAuth(req, res);
            if (!user) return;
            const body = await readJsonBody(req, res);
            if (!body) return;
            const store = (await backend.loadUserStore(user.userId)) || { state: {}, keyTs: {} };
            const merged = mergeUserStore(store, body.state, body.keyTs);
            await backend.saveUserStore(user.userId, merged);
            console.log('[chefos] push', user.login, 'device', body.deviceId || '?', '-> keys:', Object.keys(merged.state).length);
            send(res, 200, { state: merged.state, keyTs: merged.keyTs });
            return;
        }

        // --- square-import (v2.7): продажи дня из Square ---
        if (req.method === 'POST' && p === '/api/square-import') {
            const user = requireAuth(req, res);
            if (!user) return;
            if (!rateLimit('sq:' + user.userId, 10, 3600 * 1000)) { send(res, 429, { ok: false, error: 'rate_limited' }); return; }
            const token = process.env.SQUARE_ACCESS_TOKEN || '';
            const locationId = process.env.SQUARE_LOCATION_ID || '';
            if (!token || !locationId) { send(res, 503, { ok: false, error: 'no_square' }); return; }
            const body = await readJsonBody(req, res);
            if (!body) return;
            const date = String(body.date || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { send(res, 400, { ok: false, error: 'validation' }); return; }
            try {
                // Широкое окно (UTC), точный отбор — по календарному дню America/Toronto
                const startAt = new Date(date + 'T00:00:00Z'); startAt.setUTCHours(startAt.getUTCHours() - 6);
                const endAt = new Date(date + 'T00:00:00Z'); endAt.setUTCHours(endAt.getUTCHours() + 30);
                const torDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });
                const agg = {}; let orders = 0; let cursor = null;
                for (let page = 0; page < 10; page++) {
                    const rq = { location_ids: [locationId], limit: 500, query: { filter: { date_time_filter: { created_at: { start_at: startAt.toISOString(), end_at: endAt.toISOString() } } } } };
                    if (cursor) rq.cursor = cursor;
                    const r = await fetch('https://connect.squareup.com/v2/orders/search', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
                        body: JSON.stringify(rq)
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) { send(res, 502, { ok: false, error: 'square_upstream', detail: String((j.errors && j.errors[0] && (j.errors[0].detail || j.errors[0].code)) || ('http_' + r.status)).slice(0, 160) }); return; }
                    (j.orders || []).forEach(o => {
                        if (o.state === 'CANCELED' || o.state === 'DRAFT') return;
                        let dayMatch = false;
                        try { dayMatch = torDay.format(new Date(o.created_at)) === date; } catch (e) {}
                        if (!dayMatch) return;
                        orders++;
                        (o.line_items || []).forEach(li => {
                            const nm = String(li.name || '').trim();
                            const q = parseInt(li.quantity) || 0;
                            if (!nm || q <= 0) return;
                            agg[nm] = (agg[nm] || 0) + q;
                        });
                    });
                    cursor = j.cursor || null;
                    if (!cursor) break;
                }
                const items = Object.keys(agg).sort().map(name => ({ name, qty: agg[name] }));
                send(res, 200, { ok: true, items, orders });
            } catch (e) { send(res, 502, { ok: false, error: 'square_failed' }); }
            return;
        }

        // --- предзаказы: публичная витрина + API (v2.7) ---
        // Меню локации для страницы предзаказа (публично)
        async function publicLocationMenu(u, loc) {
            const uid = String(u || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
            const lid = String(loc || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
            if (!uid || !lid) return null;
            const store = await backend.loadUserStore(uid);
            const state = (store && store.state) || {};
            const locs = state.locationsDB || [];
            const locRec = locs.find(l => String(l.id) === lid);
            if (!locRec) return null;
            const ld = (state.locationData && state.locationData[lid]) || {};
            const menu = Array.isArray(ld.menuDB) ? ld.menuDB : [];
            const items = menu
                .filter(d => d && d.name && (d.menuPrice || 0) > 0 && d.status !== 'stop')
                .map(d => ({ id: String(d.id), name: String(d.name).slice(0, 80), price: Math.round(d.menuPrice * 100) / 100, low: d.status === 'low' }));
            return { locationName: String(locRec.name || '').slice(0, 60), items };
        }
        if (req.method === 'GET' && p === '/api/me') {
            const user = requireAuth(req, res);
            if (!user) return;
            send(res, 200, { ok: true, userId: user.userId, login: user.login });
            return;
        }
        if (req.method === 'GET' && p === '/api/public/menu') {
            if (!rateLimit('pubmenu:' + clientIp(req), 60, 3600 * 1000)) { send(res, 429, { ok: false, error: 'rate_limited' }); return; }
            const m = await publicLocationMenu(url.searchParams.get('u'), url.searchParams.get('loc'));
            if (!m) { send(res, 404, { ok: false, error: 'not_found' }); return; }
            send(res, 200, { ok: true, locationName: m.locationName, items: m.items });
            return;
        }
        if (req.method === 'POST' && p === '/api/public/order') {
            if (!rateLimit('puborder:' + clientIp(req), 20, 3600 * 1000)) { send(res, 429, { ok: false, error: 'rate_limited' }); return; }
            const body = await readJsonBody(req, res);
            if (!body) return;
            const m = await publicLocationMenu(body.u, body.loc);
            if (!m) { send(res, 404, { ok: false, error: 'not_found' }); return; }
            const byId = {};
            m.items.forEach(it => { byId[it.id] = it; });
            const lines = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
            const items = [];
            let total = 0;
            for (const ln of lines) {
                const d = byId[String(ln.id)];
                const q = Math.max(0, Math.min(20, parseInt(ln.qty) || 0));
                if (!d || q <= 0) continue;
                items.push({ id: d.id, name: d.name, qty: q, price: d.price });
                total = Math.round((total + d.price * q) * 100) / 100;
            }
            if (!items.length) { send(res, 400, { ok: false, error: 'empty_order' }); return; }
            const name = String(body.name || '').trim().slice(0, 60);
            if (!name) { send(res, 400, { ok: false, error: 'need_name' }); return; }
            const uid = String(body.u || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
            const lid = String(body.loc || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
            const po = {
                id: 'po_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                userId: uid, locationId: lid,
                payload: {
                    items, total, name,
                    phone: String(body.phone || '').trim().slice(0, 30),
                    pickupTime: String(body.pickupTime || '').trim().slice(0, 20),
                    note: String(body.note || '').trim().slice(0, 200),
                    locationName: m.locationName
                }
            };
            await backend.addPreorder(po);
            console.log('[chefos] preorder', po.id, uid, items.length + ' lines');
            send(res, 200, { ok: true, id: po.id, total });
            return;
        }
        if (req.method === 'GET' && p === '/api/preorders') {
            const user = requireAuth(req, res);
            if (!user) return;
            const orders = await backend.listPreorders(user.userId);
            send(res, 200, { ok: true, orders });
            return;
        }
        if (req.method === 'POST' && p === '/api/preorders/status') {
            const user = requireAuth(req, res);
            if (!user) return;
            const body = await readJsonBody(req, res);
            if (!body) return;
            const ok = await backend.setPreorderStatus(user.userId, String(body.id || ''), String(body.status || ''));
            send(res, ok ? 200 : 400, { ok });
            return;
        }

        // --- статика фронта ---
        if (req.method === 'GET' || req.method === 'HEAD') {
            if (!p.startsWith('/api/')) { serveStatic(req, res, p); return; }
        }
        send(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
        console.error('[chefos] request failed:', e);
        try { send(res, 500, { ok: false, error: 'internal_error' }); } catch (x) {}
    }
});

server.listen(PORT, () => {
    const addr = server.address();
    console.log('[chefos] ChefOS v2.0 listening on port ' + (addr && addr.port) + ', front dir: ' + FRONT_DIR);
});
restoreSessions();
