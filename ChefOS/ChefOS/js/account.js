        // --- ChefOS v2.0: АККАУНТЫ ---
        // Один логин = одна изолированная кухня. Экран входа/регистрации показывается
        // до PIN-экрана. Владелец аккаунта входит в приложение сразу с правами шефа,
        // PIN-экран и ролевая система остаются в коде для будущих сотрудников кухни.
        //
        // localStorage:
        //   chefos_token    — Bearer-токен сессии
        //   chefos_account  — {userId, login}
        //   chefos_api_base — переопределение адреса API (по умолчанию same-origin на http(s))
        // Данные кухни: STORAGE_KEY = storageKeyForUser(userId) — изоляция на устройстве.

        const ACCOUNT_TOKEN_KEY = 'chefos_token';
        const ACCOUNT_USER_KEY = 'chefos_account';
        const ACCOUNT_API_KEY = 'chefos_api_base';
        let accountMode = 'login'; // 'login' | 'register'

        function accountApiBase() {
            try {
                const override = localStorage.getItem(ACCOUNT_API_KEY);
                if (override && String(override).trim()) return String(override).trim().replace(/\/+$/, '');
            } catch (e) {}
            if (typeof location !== 'undefined' && /^https?:/.test(location.protocol || '')) return ''; // same origin
            return '';
        }
        function accountToken() {
            try { return localStorage.getItem(ACCOUNT_TOKEN_KEY) || ''; } catch (e) { return ''; }
        }
        function accountUser() {
            try { const u = JSON.parse(localStorage.getItem(ACCOUNT_USER_KEY) || 'null'); return (u && u.userId) ? u : null; }
            catch (e) { return null; }
        }
        function accountSaveSession(token, user) {
            try {
                localStorage.setItem(ACCOUNT_TOKEN_KEY, token);
                localStorage.setItem(ACCOUNT_USER_KEY, JSON.stringify(user));
            } catch (e) {}
        }
        function accountClearSession() {
            try { localStorage.removeItem(ACCOUNT_TOKEN_KEY); localStorage.removeItem(ACCOUNT_USER_KEY); }
            catch (e) {}
        }
        function accountApplyStorageKey(userId) {
            STORAGE_KEY = userId ? storageKeyForUser(userId) : 'chefos_state_v1';
        }
        // Одноразовая миграция: существующая локальная кухня (legacy-ключ) переезжает
        // в персональный ключ пользователя при первом входе.
        function accountMigrateLegacyStorage(userId) {
            try {
                const nsKey = storageKeyForUser(userId);
                if (!localStorage.getItem(nsKey)) {
                    const legacy = localStorage.getItem('chefos_state_v1');
                    if (legacy) localStorage.setItem(nsKey, legacy);
                }
            } catch (e) {}
        }

        async function accountApi(path, opts, timeoutMs) {
            const ms = timeoutMs || 10000;
            let ctrl = null, timer = null;
            try {
                if (typeof AbortController !== 'undefined') {
                    ctrl = new AbortController();
                    timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, ms);
                }
            } catch (e) {}
            const base = accountApiBase();
            if (!base && !(typeof location !== 'undefined' && /^https?:/.test(location.protocol || ''))) {
                throw new Error('no_api_base');
            }
            const headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
            const token = accountToken();
            if (token && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + token;
            try {
                const res = await fetch(base + path, Object.assign({}, opts || {}, { headers }, ctrl ? { signal: ctrl.signal } : {}));
                let data = null;
                try { data = await res.json(); } catch (e) {}
                return { status: res.status, ok: res.ok, data: data || {} };
            } finally { if (timer) clearTimeout(timer); }
        }

        // ---------- UI экрана ----------
        function accountShow() {
            const s = document.getElementById('account-screen');
            if (!s) return;
            s.classList.remove('hidden');
            s.classList.add('flex');
            setTimeout(() => s.classList.remove('opacity-0'), 10);
            accountSetLoading(false);
            accountSetError('');
            if (typeof applyTranslations === 'function') { try { applyTranslations(); } catch (e) {} }
        }
        function accountHide() {
            const s = document.getElementById('account-screen');
            if (!s) return;
            s.classList.add('opacity-0');
            setTimeout(() => { s.classList.add('hidden'); s.classList.remove('flex'); }, 400);
        }
        function accountSetLoading(on) {
            const l = document.getElementById('account-loading');
            const f = document.getElementById('account-form');
            if (l) l.classList.toggle('hidden', !on);
            if (f) f.classList.toggle('hidden', on);
        }
        function accountSetError(key) {
            const el = document.getElementById('account-error');
            if (!el) return;
            if (!key) { el.textContent = ''; el.classList.add('hidden'); return; }
            el.textContent = t(key);
            el.classList.remove('hidden');
        }
        function accountSwitchTab(mode) {
            accountMode = mode;
            const tl = document.getElementById('account-tab-login'), tr = document.getElementById('account-tab-register');
            const on = 'flex-1 h-10 rounded-xl text-sm font-medium transition-colors bg-blue-500 text-white';
            const off = 'flex-1 h-10 rounded-xl text-sm font-medium transition-colors bg-white/5 text-gray-400 hover:bg-white/10';
            if (tl) tl.className = mode === 'login' ? on : off;
            if (tr) tr.className = mode === 'register' ? on : off;
            const btn = document.getElementById('account-submit-btn-text');
            if (btn) btn.setAttribute('data-i18n', mode === 'login' ? 'acc_go_login' : 'acc_go_register');
            const pw2 = document.getElementById('account-password2');
            if (pw2) pw2.classList.toggle('hidden', mode !== 'register');
            accountSetError('');
            if (typeof applyTranslations === 'function') { try { applyTranslations(); } catch (e) {} }
        }
        function accountToggleServer() {
            const box = document.getElementById('account-server-box');
            if (box) box.classList.toggle('hidden');
        }

        async function accountSubmit() {
            const login = (document.getElementById('account-login').value || '').trim().toLowerCase();
            const password = document.getElementById('account-password').value || '';
            try {
                const srv = document.getElementById('account-server').value || '';
                localStorage.setItem(ACCOUNT_API_KEY, String(srv).trim());
            } catch (e) {}
            accountSetError('');
            if (accountMode === 'register') {
                const password2 = document.getElementById('account-password2').value || '';
                if (password !== password2) { accountSetError('acc_err_mismatch'); accountSetLoading(false); return; }
            }
            accountSetLoading(true);
            try {
                let r;
                if (accountMode === 'register') r = await accountApi('/api/register', { method: 'POST', body: JSON.stringify({ login, password }) });
                else r = await accountApi('/api/login', { method: 'POST', body: JSON.stringify({ login, password }) });
                if (r.status === 401 || (r.data && r.data.error === 'bad_credentials')) { accountSetError('acc_err_bad'); return; }
                if (r.status === 409 || (r.data && r.data.error === 'login_taken')) { accountSetError('acc_err_taken'); return; }
                if (r.status === 400 || (r.data && r.data.error === 'validation')) { accountSetError('acc_err_validation'); return; }
                if (!r.ok || !r.data || r.data.ok !== true) { accountSetError('acc_err_network'); return; }
                let token = r.data.token, user = r.data.userId ? { userId: r.data.userId, login: login } : null;
                if (accountMode === 'register') {
                    // После регистрации сразу входим
                    const lr = await accountApi('/api/login', { method: 'POST', body: JSON.stringify({ login, password }) });
                    if (!lr.ok || !lr.data.token) { accountSetError('acc_err_network'); return; }
                    token = lr.data.token;
                    user = { userId: lr.data.userId, login: lr.data.login || login };
                }
                accountSaveSession(token, user);
                accountEnterApp(user);
            } catch (e) {
                accountSetError(e && e.message === 'no_api_base' ? 'acc_err_server' : 'acc_err_network');
            } finally {
                accountSetLoading(false);
            }
        }
        function accountEnterApp(user) {
            accountApplyStorageKey(user.userId);
            accountMigrateLegacyStorage(user.userId);
            try { if (typeof loadState === 'function') loadState(); } catch (e) {}
            try { if (typeof renderLocationSelector === 'function') renderLocationSelector(); } catch (e) {}
            // Привязка аккаунта к сотруднику: расписание подсвечивает «свои» смены
            // в зависимости от того, кто зашёл. 1) сотрудник с именем = логину;
            // 2) если такого нет — единственный сотрудник с ролью шефа.
            try {
                let meId = null;
                const alogin = user && user.login ? String(user.login).toLowerCase() : '';
                if (typeof teamDB !== 'undefined' && teamDB && teamDB.length) {
                    const byName = alogin ? teamDB.find(e => (e.name || '').toLowerCase() === alogin) : null;
                    if (byName) meId = byName.id;
                    else {
                        const chefs = teamDB.filter(e => e.accessRole === 'chef');
                        if (chefs.length === 1) meId = chefs[0].id;
                    }
                }
                currentEmployeeId = meId;
            } catch (e) {}
            try { if (typeof syncResetHashBaseline === 'function') syncResetHashBaseline(); } catch (e) {}
            accountHide();
            // PIN-экран не показываем: владелец входит сразу шефом
            const pin = document.getElementById('pin-screen');
            if (pin && !pin.classList.contains('hidden')) { pin.classList.add('hidden'); pin.classList.add('opacity-0'); }
            try { if (typeof accountRefreshSettingsUI === 'function') accountRefreshSettingsUI(); } catch (e) {}
            loginAs('chef');
            // Тихий первый синк: подтянуть данные аккаунта с сервера
            try { if (typeof syncNow === 'function') setTimeout(() => syncNow(false), 1500); } catch (e) {}
        }
        async function accountLogout() {
            try { await accountApi('/api/logout', { method: 'POST' }); } catch (e) {}
            accountClearSession();
            accountApplyStorageKey(null);
            try { if (typeof logout === 'function') logout(); } catch (e) {} // сброс роли (покажет PIN-экран)
            const pin = document.getElementById('pin-screen');
            if (pin) { pin.classList.add('hidden'); pin.classList.add('opacity-0'); }
            accountSwitchTab('login');
            accountShow();
        }
        // ---------- boot ----------
        // Вызывается из main.js ДО loadState(): выбирает ключ хранилища по saved userId.
        function accountBootStorage() {
            const u = accountUser();
            accountApplyStorageKey(u ? u.userId : null);
        }
        // Вызывается из main.js ПОСЛЕ инициализации: автологин по токену или экран входа.
        async function accountBoot() {
            const u = accountUser();
            const token = accountToken();
            if (!u || !token) { accountShow(); return; }
            accountShow();
            accountSetLoading(true);
            try {
                const r = await accountApi('/api/pull', { method: 'GET' });
                if (r.status === 401) { // токен протух (рестарт сервера) — просим войти заново
                    accountClearSession();
                    accountApplyStorageKey(null);
                    accountSetLoading(false);
                    accountSetError('');
                    return;
                }
                if (!r.ok) throw new Error('pull failed');
                accountEnterApp(u);
            } catch (e) {
                // Сервер недоступен: пускаем в локальные данные, синк добьёт позже
                if (e && e.message === 'no_api_base') { accountSetLoading(false); return; }
                accountEnterApp(u);
            }
        }
        // ---------- секция аккаунта в настройках ----------
        function accountInjectSettingsUI() {
            if (typeof document === 'undefined') return;
            if (document.getElementById('account-section')) return;
            const anchor = document.getElementById('pin-change-section');
            if (!anchor || !anchor.parentNode) return;
            const div = document.createElement('div');
            div.id = 'account-section';
            div.className = 'pt-6 border-t border-white/5';
            div.innerHTML =
                '<label class="block text-sm text-gray-400 mb-3" data-i18n="acc_section">Аккаунт</label>' +
                '<div class="flex items-center justify-between mb-3 px-1">' +
                    '<span class="text-xs text-gray-500" data-i18n="acc_logged_as">Вы вошли как</span>' +
                    '<span class="text-sm text-white font-medium" id="account-settings-name">—</span>' +
                '</div>' +
                '<button id="account-logout-btn" class="w-full h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm transition-colors" data-i18n="acc_logout_btn">Выйти из аккаунта</button>';
            anchor.parentNode.insertBefore(div, anchor.nextSibling);
            document.getElementById('account-logout-btn').addEventListener('click', accountLogout);
            if (typeof applyTranslations === 'function') { try { applyTranslations(); } catch (e) {} }
        }
        function accountRefreshSettingsUI() {
            if (typeof document === 'undefined') return;
            const el = document.getElementById('account-settings-name');
            if (el) { const u = accountUser(); el.textContent = u ? u.login : '—'; }
        }
        (function accountSettingsInit() {
            if (typeof document === 'undefined' || typeof window === 'undefined') return;
            const boot = () => { accountInjectSettingsUI(); accountRefreshSettingsUI(); };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
            else boot();
        })();
        // Кнопка Enter в полях
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            const s = document.getElementById('account-screen');
            if (s && !s.classList.contains('hidden') && !document.getElementById('account-form').classList.contains('hidden')) {
                const ae = document.activeElement;
                if (ae && (ae.id === 'account-login' || ae.id === 'account-password' || ae.id === 'account-password2' || ae.id === 'account-server')) accountSubmit();
            }
        });
