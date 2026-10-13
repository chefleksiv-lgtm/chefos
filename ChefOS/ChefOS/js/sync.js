// --- ChefOS v1.8: СИНХРОНИЗАЦИЯ МЕЖДУ УСТРОЙСТВАМИ (offline-first) ---
// localStorage остаётся главным хранилищем. Этот модуль добавляет:
//  1) детект изменений коллекций (хэши в обёртке над saveState) -> syncMeta.keyTs
//  2) push/pull к серверу server/server.js (общий секрет, таймаут, офлайн-режим)
//  3) merge per-collection last-write-wins, журнал расхождений в syncLog
//  4) UI в настройках (только шеф): вкл/выкл, URL, секрет, статус, экспорт/импорт JSON
//
// Подключать ПОСЛЕ js/settings.js (нужны openSettingsModal, saveState, showNotification, t).
// Все функции/переменные — глобальные, модулей нет. В Node (тесты) браузерный init пропускается.

// ---------- i18n (ключи добавляем из своего файла, i18n.js не трогаем) ----------
if (typeof i18n !== 'undefined') {
    Object.assign(i18n, {
        'sync_title':            { ru: 'Синхронизация между устройствами', en: 'Sync between devices' },
        'sync_enable':           { ru: 'Включить синхронизацию', en: 'Enable sync' },
        'sync_url_ph':           { ru: 'URL сервера (пусто = тот же, что и приложение)', en: 'Server URL (empty = same as the app)' },
        'sync_now':              { ru: 'Синхронизировать сейчас', en: 'Sync now' },
        'sync_running':          { ru: 'Синхронизация…', en: 'Syncing…' },
        'sync_done':             { ru: 'Синхронизация завершена', en: 'Sync complete' },
        'sync_failed':           { ru: 'Не удалось синхронизироваться — работаю офлайн', en: 'Sync failed — working offline' },
        'sync_disabled':         { ru: 'Синхронизация выключена', en: 'Sync is disabled' },
        'sync_not_configured':   { ru: 'Войдите в аккаунт, чтобы синхронизироваться', en: 'Sign in to sync' },
        'sync_account':          { ru: 'Аккаунт', en: 'Account' },
        'sync_never':            { ru: 'ещё не было', en: 'never' },
        'sync_last':             { ru: 'Последний синк', en: 'Last sync' },
        'sync_error':            { ru: 'Ошибка', en: 'Error' },
        'sync_export':           { ru: 'Экспорт JSON', en: 'Export JSON' },
        'sync_import':           { ru: 'Импорт JSON', en: 'Import JSON' },
        'sync_imported':         { ru: 'Данные импортированы', en: 'Data imported' },
        'sync_import_failed':    { ru: 'Не удалось прочитать файл', en: 'Could not read the file' },
        'sync_note':             { ru: 'Local-first: без сервера приложение работает как раньше. Данные принадлежат вашему аккаунту.', en: 'Local-first: without a server the app works as before. Your data belongs to your account.' }
    });
}

// ---------- хэш (FNV-1a, 32 бит) ----------
function syncFnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}
function syncHashOf(value) {
    try { return syncFnv1a(JSON.stringify(value === undefined ? null : value)); }
    catch (e) { return 'err'; }
}

// ---------- ключи ----------
function syncAllKeys() { return (typeof PERSISTED_KEYS !== 'undefined') ? PERSISTED_KEYS : []; }
// syncMeta и syncLog не участвуют в детекте изменений: syncMeta хранит сами метки,
// syncLog объединяется union'ом при merge.
function syncTrackedKeys() { return syncAllKeys().filter(k => k !== 'syncMeta' && k !== 'syncLog'); }
function syncReadKey(key) { try { return eval(key); } catch (e) { return undefined; } }
function syncIsPlainObject(v) {
    if (typeof isPlainObject === 'function') return isPlainObject(v);
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function syncEscapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- журнал ----------
function logSync(action, key, detail, device) {
    try {
        if (typeof syncLog === 'undefined') return;
        let dev = device;
        if (!dev) { try { dev = (typeof syncMeta !== 'undefined' && syncMeta.deviceId) || 'local'; } catch (e) { dev = 'local'; } }
        syncLog.push({ ts: Date.now(), device: dev, action: action, key: key, detail: detail || '' });
        while (syncLog.length > 200) syncLog.shift();
        if (typeof markDirty === 'function') markDirty();
    } catch (e) { /* офлайн-безопасность */ }
}

// ---------- детект изменений: обёртка над saveState() ----------
// Кэш хэшей: первое увиденное значение ключа = baseline (метка НЕ ставится),
// дальше любое расхождение = syncMeta.keyTs[key] = Date.now().
let _syncKeyHashes = {};
function syncComputeHash(key) { return syncHashOf(syncReadKey(key)); }
function syncResetHashBaseline() {
    _syncKeyHashes = {};
    for (const k of syncTrackedKeys()) _syncKeyHashes[k] = syncComputeHash(k);
}
function syncNoteChangedKeys() {
    if (typeof syncMeta === 'undefined') return;
    const now = Date.now();
    let changed = false;
    for (const k of syncTrackedKeys()) {
        const h = syncComputeHash(k);
        if (!(_syncKeyHashes.hasOwnProperty(k))) { _syncKeyHashes[k] = h; continue; } // baseline
        if (_syncKeyHashes[k] !== h) {
            _syncKeyHashes[k] = h;
            syncMeta.keyTs[k] = now;
            changed = true;
        }
    }
    // syncMeta поменялся уже ПОСЛЕ записи blob'а — допишем тихо, без рекурсии в saveState.
    if (changed && typeof localStorage !== 'undefined' && typeof STORAGE_KEY !== 'undefined') {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const blob = JSON.parse(raw);
                blob.syncMeta = syncMeta;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
            }
        } catch (e) { /* ignore */ }
    }
}
if (typeof saveState === 'function' && !saveState._syncWrapped) {
    const _origSaveState = saveState;
    saveState = function () {
        const ok = _origSaveState.apply(this, arguments);
        try { syncNoteChangedKeys(); } catch (e) { console.error('[sync] hash check failed:', e); }
        return ok;
    };
    saveState._syncWrapped = true;
}

// ---------- deviceId ----------
function syncEnsureDeviceId() {
    if (typeof syncMeta === 'undefined') return '';
    if (!syncMeta.deviceId) {
        let id = '';
        try { if (typeof crypto !== 'undefined' && crypto.randomUUID) id = crypto.randomUUID(); } catch (e) {}
        if (!id) id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        syncMeta.deviceId = id;
        if (typeof markDirty === 'function') markDirty();
    }
    return syncMeta.deviceId;
}

// ---------- merge: ЧИСТАЯ функция (для тестов) ----------
// last-write-wins ПО КОЛЛЕКЦИЯМ (ключи PERSISTED_KEYS): у кого больше ts — тот победил.
// Равные ts — без изменений (берём local). Проигравшая сторона, у которой были свои
// правки (ts > 0 и значения различаются), фиксируется как конфликт + запись в журнал.
// syncMeta не затирается целиком: локальные настройки сохраняются, keyTs объединяется по max.
// syncLog объединяется union'ом без дублей (кап 200).
// Возвращает { state, ts, conflicts[] }.
function mergeCollections(localState, localTs, remoteState, remoteTs, logFn) {
    const log = (typeof logFn === 'function') ? logFn : function (a, k, d) { logSync(a, k, d); };
    const state = {};
    const ts = {};
    const conflicts = [];
    const keys = syncTrackedKeys();
    const ltsMap = localTs || {};
    const rtsMap = remoteTs || {};
    for (const key of keys) {
        const lts = ltsMap[key] || 0;
        const rts = rtsMap[key] || 0;
        let val, wts, winner;
        if (rts > lts) {
            val = remoteState ? remoteState[key] : undefined;
            wts = rts; winner = 'remote';
        } else {
            val = localState ? localState[key] : undefined;
            wts = lts; winner = 'local';
        }
        if (lts !== rts && Math.min(lts, rts) > 0) {
            const loserVal = winner === 'remote' ? (localState && localState[key]) : (remoteState && remoteState[key]);
            if (syncHashOf(val) !== syncHashOf(loserVal)) {
                conflicts.push({ key: key, winner: winner, localTs: lts, remoteTs: rts });
                log('conflict', key, 'LWW: ' + winner + ' wins (local ts=' + lts + ', remote ts=' + rts + ')');
            }
        }
        state[key] = val;
        ts[key] = wts;
    }
    // syncMeta: копия локального + union keyTs
    const lsm = (localState && localState.syncMeta) || {};
    const mergedMeta = {};
    try { Object.assign(mergedMeta, JSON.parse(JSON.stringify(lsm))); } catch (e) { Object.assign(mergedMeta, lsm); }
    mergedMeta.keyTs = {};
    for (const key of keys) mergedMeta.keyTs[key] = ts[key];
    state.syncMeta = mergedMeta;
    ts.syncMeta = 0;
    // syncLog: union без дублей, сортировка по ts, кап 200
    const seen = {};
    const mergedLog = [];
    [localState && localState.syncLog, remoteState && remoteState.syncLog].forEach(arr => {
        (arr || []).forEach(entry => {
            let sig;
            try { sig = JSON.stringify(entry); } catch (ex) { sig = 'rnd' + Math.random(); }
            if (!seen[sig]) { seen[sig] = 1; mergedLog.push(entry); }
        });
    });
    mergedLog.sort((a, b) => (((a && a.ts) || 0) - ((b && b.ts) || 0)));
    state.syncLog = mergedLog.slice(-200);
    ts.syncLog = 0;
    return { state: state, ts: ts, conflicts: conflicts };
}

// ---------- сбор и применение состояния (как loadState, без ломания const-ссылок) ----------
function syncCollectState() {
    const state = {};
    for (const key of syncAllKeys()) state[key] = syncReadKey(key);
    return state;
}
function syncApplyState(state) {
    if (!state || typeof state !== 'object') return 0;
    let applied = 0;
    for (const key of syncAllKeys()) {
        if (state[key] === undefined) continue;
        const incoming = state[key];
        let current;
        try { current = eval(key); } catch (e) { continue; }
        if (incoming === current) { applied++; continue; } // та же ссылка — нечего делать
        try {
            if (Array.isArray(current) && Array.isArray(incoming)) {
                current.length = 0;
                current.push(...incoming);
            } else if (syncIsPlainObject(current) && syncIsPlainObject(incoming)) {
                for (const k of Object.keys(current)) delete current[k];
                Object.assign(current, incoming);
            } else {
                eval(key + ' = incoming');
            }
            applied++;
        } catch (e) { console.error('[sync] apply failed for key', key, e); }
    }
    // Применённое извне — не локальные правки: сбрасываем хэш-базу тихо.
    syncResetHashBaseline();
    return applied;
}

// ---------- сеть (v2.0: авторизация Bearer-токеном аккаунта, общий секрет убран) ----------
function syncAuthToken() {
    try { if (typeof accountToken === 'function') return accountToken() || ''; } catch (e) {}
    return '';
}
function syncFetch(url, opts, timeoutMs) {
    const ms = timeoutMs || 8000;
    let ctrl = null, timer = null;
    try {
        if (typeof AbortController !== 'undefined') {
            ctrl = new AbortController();
            timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, ms);
        }
    } catch (e) {}
    const p = fetch(url, Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {}));
    const done = r => { if (timer) clearTimeout(timer); return r; };
    return p.then(done, err => { if (timer) clearTimeout(timer); throw err; });
}
function syncBaseUrl() {
    const override = String((typeof syncMeta !== 'undefined' && syncMeta.serverUrl) || '').replace(/\/+$/, '');
    if (override) return override;
    try { if (typeof accountApiBase === 'function') return accountApiBase(); } catch (e) {}
    return '';
}
async function syncPull() {
    const res = await syncFetch(syncBaseUrl() + '/api/pull', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + syncAuthToken() }
    });
    if (res.status === 401) {
        // Токен протух — разлогиниваем на экран аккаунта
        try { if (typeof accountLogout === 'function') accountLogout(); } catch (e) {}
        throw new Error('pull HTTP 401');
    }
    if (!res.ok) throw new Error('pull HTTP ' + res.status);
    const data = await res.json();
    return { state: (data && data.state) || {}, keyTs: (data && data.keyTs) || {} };
}
async function syncPush(state, keyTs) {
    const res = await syncFetch(syncBaseUrl() + '/api/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + syncAuthToken()
        },
        body: JSON.stringify({ deviceId: (typeof syncMeta !== 'undefined' && syncMeta.deviceId) || '', state: state, keyTs: keyTs })
    });
    if (!res.ok) throw new Error('push HTTP ' + res.status);
    return res.json();
}

// ---------- syncNow: pull -> merge -> apply -> push ----------
let _syncInProgress = false;
async function syncNow(manual) {
    if (_syncInProgress) return;
    if (typeof syncMeta === 'undefined') return;
    if (!syncMeta.enabled) { if (manual && typeof showNotification === 'function') showNotification(t('sync_disabled')); return; }
    if (!syncAuthToken()) {
        if (manual && typeof showNotification === 'function') showNotification(t('sync_not_configured'));
        return;
    }
    syncEnsureDeviceId();
    _syncInProgress = true;
    try {
        const remote = await syncPull();
        const merged = mergeCollections(syncCollectState(), syncMeta.keyTs || {}, remote.state, remote.keyTs || {});
        const applied = syncApplyState(merged.state);
        const pushed = await syncPush(syncCollectState(), (syncReadKey('syncMeta') && syncReadKey('syncMeta').keyTs) || {});
        if (pushed && pushed.state) syncApplyState(pushed.state); // сервер мог смержить чужой пуш
        syncMeta.lastSync = Date.now();
        syncMeta.lastError = null;
        logSync('sync', 'all', 'device ' + syncMeta.deviceId + ', applied ' + applied + ' keys, conflicts ' + merged.conflicts.length);
        if (typeof markDirty === 'function') markDirty();
        if (typeof saveState === 'function') saveState();
        if (manual && typeof showNotification === 'function') showNotification(t('sync_done'));
    } catch (e) {
        syncMeta.lastError = String((e && e.message) || e);
        try { if (typeof markDirty === 'function') markDirty(); if (typeof saveState === 'function') saveState(); } catch (se) {}
        if (manual && typeof showNotification === 'function') showNotification(t('sync_failed'));
        console.error('[sync] syncNow failed:', e);
    } finally {
        _syncInProgress = false;
        syncRefreshSettingsUI();
    }
}
function syncNowManual() {
    syncSetStatus(t('sync_running'));
    syncNow(true);
}
function syncSetStatus(text) {
    if (typeof document === 'undefined') return;
    const st = document.getElementById('sync-status');
    if (st) st.innerHTML = '<span class="text-gray-400">' + syncEscapeHtml(text) + '</span>';
}

// ---------- экспорт / импорт JSON (fallback без сервера) ----------
function syncExportJSON() {
    if (typeof document === 'undefined') return;
    const blob = {
        exportedAt: new Date().toISOString(),
        deviceId: (typeof syncMeta !== 'undefined' && syncMeta.deviceId) || '',
        keyTs: (typeof syncMeta !== 'undefined' && syncMeta.keyTs) || {},
        state: syncCollectState()
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(blob)], { type: 'application/json' }));
    a.download = 'chefos-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 5000);
    if (typeof showNotification === 'function') showNotification(t('sync_export'));
}
function syncImportJSON(ev) {
    const f = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const state = (data && data.state) || data;
            const n = syncApplyState(state);
            if (data && data.keyTs && typeof data.keyTs === 'object' && typeof syncMeta !== 'undefined') {
                for (const k of Object.keys(data.keyTs)) syncMeta.keyTs[k] = data.keyTs[k];
            }
            if (typeof markDirty === 'function') markDirty();
            if (typeof saveState === 'function') saveState();
            if (typeof showNotification === 'function') showNotification(t('sync_imported') + ' (' + n + ')');
        } catch (e) {
            if (typeof showNotification === 'function') showNotification(t('sync_import_failed'));
        }
        try { ev.target.value = ''; } catch (e) {}
        syncRefreshSettingsUI();
    };
    reader.readAsText(f);
}

// ---------- UI в настройках (инжект из JS, только шеф) ----------
function syncInjectSettingsUI() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sync-section')) return;
    const anchor = document.getElementById('pin-change-section');
    if (!anchor || !anchor.parentNode) return;
    const div = document.createElement('div');
    div.id = 'sync-section';
    div.className = 'pt-6 border-t border-white/5';
    div.style.display = 'none';
    div.innerHTML =
        '<label class="block text-sm text-gray-400 mb-3" data-i18n="sync_title">Синхронизация между устройствами</label>' +
        '<div class="flex items-center justify-between mb-3 px-1">' +
            '<span class="text-xs text-gray-500" data-i18n="sync_account">Аккаунт</span>' +
            '<span class="text-sm text-gray-200" id="sync-account-name">—</span>' +
        '</div>' +
        '<label class="flex items-center gap-3 mb-3 cursor-pointer">' +
            '<input type="checkbox" id="sync-enabled" class="w-5 h-5 accent-orange-500">' +
            '<span class="text-sm text-gray-200" data-i18n="sync_enable">Включить синхронизацию</span>' +
        '</label>' +
        '<input type="text" id="sync-url" data-i18n="sync_url_ph" placeholder="URL сервера…" autocapitalize="off" spellcheck="false" ' +
            'class="w-full h-11 bg-[#2C2C2E] text-white rounded-xl px-4 mb-3 outline-none focus:ring-2 focus:ring-orange-500 text-sm">' +
        '<button id="sync-now-btn" class="w-full h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-all font-medium mb-2" data-i18n="sync_now">Синхронизировать сейчас</button>' +
        '<div id="sync-status" class="text-xs text-gray-500 mb-3"></div>' +
        '<div class="flex gap-2">' +
            '<button id="sync-export-btn" class="flex-1 h-10 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-gray-200 text-sm transition-all" data-i18n="sync_export">Экспорт JSON</button>' +
            '<label for="sync-import-file" class="flex-1 h-10 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-gray-200 text-sm transition-all flex items-center justify-center cursor-pointer" data-i18n="sync_import">Импорт JSON</label>' +
            '<input type="file" id="sync-import-file" accept="application/json,.json" class="hidden">' +
        '</div>' +
        '<p class="text-[11px] text-gray-600 mt-3" data-i18n="sync_note"></p>';
    anchor.parentNode.insertBefore(div, anchor.nextSibling);

    document.getElementById('sync-enabled').addEventListener('change', e => {
        if (typeof syncMeta === 'undefined') return;
        syncMeta.enabled = !!e.target.checked;
        if (syncMeta.enabled) syncEnsureDeviceId();
        if (typeof markDirty === 'function') markDirty();
        if (typeof saveState === 'function') saveState();
        syncRefreshSettingsUI();
    });
    document.getElementById('sync-url').addEventListener('change', e => {
        if (typeof syncMeta === 'undefined') return;
        syncMeta.serverUrl = String(e.target.value || '').trim();
        if (typeof markDirty === 'function') markDirty();
        if (typeof saveState === 'function') saveState();
        syncRefreshSettingsUI();
    });
    document.getElementById('sync-now-btn').addEventListener('click', syncNowManual);
    document.getElementById('sync-export-btn').addEventListener('click', syncExportJSON);
    document.getElementById('sync-import-file').addEventListener('change', syncImportJSON);
    if (typeof applyTranslations === 'function') { try { applyTranslations(); } catch (e) {} }
    syncRefreshSettingsUI();
}
function syncRefreshSettingsUI() {
    if (typeof document === 'undefined' || typeof syncMeta === 'undefined') return;
    if (!document.getElementById('sync-section')) return;
    const chk = document.getElementById('sync-enabled');
    if (chk) chk.checked = !!syncMeta.enabled;
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = v;
    };
    setVal('sync-url', syncMeta.serverUrl || '');
    const accName = document.getElementById('sync-account-name');
    if (accName) {
        let login = '—';
        try { if (typeof accountUser === 'function') { const u = accountUser(); if (u) login = u.login; } } catch (e) {}
        accName.textContent = login;
    }
    const st = document.getElementById('sync-status');
    if (st) {
        let html = '';
        if (syncMeta.lastSync) {
            html += '<span class="text-gray-400">' + syncEscapeHtml(t('sync_last')) + ':</span> ' +
                syncEscapeHtml(new Date(syncMeta.lastSync).toLocaleString()) + '<br>';
        } else {
            html += '<span class="text-gray-500">' + syncEscapeHtml(t('sync_last')) + ': ' + syncEscapeHtml(t('sync_never')) + '</span><br>';
        }
        if (syncMeta.lastError) {
            html += '<span class="text-red-400">' + syncEscapeHtml(t('sync_error')) + ': ' + syncEscapeHtml(syncMeta.lastError) + '</span>';
        } else if (syncMeta.deviceId) {
            html += '<span class="text-gray-600">device ' + syncEscapeHtml(String(syncMeta.deviceId).slice(0, 8)) + '…</span>';
        }
        st.innerHTML = html;
    }
}
function syncOnSettingsOpen() {
    const s = (typeof document !== 'undefined') ? document.getElementById('sync-section') : null;
    if (s) {
        const isChef = (typeof currentAppRole !== 'undefined') && currentAppRole === 'chef';
        s.style.display = isChef ? 'block' : 'none';
    }
    syncRefreshSettingsUI();
}

// ---------- init (только браузер) ----------
function syncOnDomReady() {
    syncInjectSettingsUI();
    if (typeof openSettingsModal === 'function' && !openSettingsModal._syncWrapped) {
        const _origOpenSettings = openSettingsModal;
        openSettingsModal = function () {
            const r = _origOpenSettings.apply(this, arguments);
            try { syncOnSettingsOpen(); } catch (e) {}
            return r;
        };
        openSettingsModal._syncWrapped = true;
    }
    if (typeof window !== 'undefined' && !window._syncAutosyncStarted) {
        window._syncAutosyncStarted = true;
        setInterval(() => {
            try {
                if (typeof syncMeta !== 'undefined' && syncMeta.enabled && syncAuthToken() && !_syncInProgress) {
                    syncNow(false); // автосинк тихий: без уведомлений, ошибка только в статус
                }
            } catch (e) { /* ignore */ }
        }, 60000);
    }
}
(function syncInit() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return; // Node/тесты
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncOnDomReady);
    else syncOnDomReady();
})();

// Отладочный доступ
try {
    if (typeof window !== 'undefined') {
        window.ChefOSSync = { syncNow: syncNow, mergeCollections: mergeCollections, syncApplyState: syncApplyState, logSync: logSync };
    }
} catch (e) {}
