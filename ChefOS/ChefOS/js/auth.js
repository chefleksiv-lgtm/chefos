        // --- AUTH & ROLES (RBAC, v1.9: матрица PERMISSIONS в js/data.js) ---
        // Режимы PIN-экрана: 'role' — классический вход по ролевому PIN;
        // 'employee-select' — выбор себя из списка; 'employee-pin' — ввод личного PIN.
        let pinLoginMode = 'role';
        let pinSelectedEmployeeId = null;

        function addPin(num) {
            if (currentPin.length < 4) {
                currentPin += num;
                updatePinDots();
                if (currentPin.length === 4) checkPin();
            }
        }
        function clearPin() {
            currentPin = '';
            updatePinDots();
            document.getElementById('pin-msg').textContent = pinLoginMode === 'employee-pin' ? t('auth_emp_pin_msg') : t('auth_pin_msg');
            document.getElementById('pin-msg').className = 'text-sm text-gray-400 mb-10';
        }
        function backspacePin() {
            if (currentPin.length > 0) { currentPin = currentPin.slice(0, -1); updatePinDots(); }
        }
        // На компьютере экранную клавиатуру прячем (есть физическая), оставляем только строку PIN-кода.
        // На телефоне/планшете (тач) — показываем цифры.
        function pinHasTouch() { return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); }
        function pinSyncKeypad() {
            const kp = document.getElementById('pin-keypad');
            if (!kp) return;
            const needPin = (pinLoginMode === 'role' || pinLoginMode === 'employee-pin');
            kp.classList.toggle('hidden', !(needPin && pinHasTouch()));
        }
        // Ввод PIN с физической клавиатуры: цифры, Backspace — стереть, Esc — очистить
        document.addEventListener('keydown', function (e) {
            const ae = document.activeElement;
            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
            const screen = document.getElementById('pin-screen');
            if (!screen || screen.classList.contains('hidden')) return;
            if (pinLoginMode !== 'role' && pinLoginMode !== 'employee-pin') return; // выбор сотрудника из списка — цифры не нужны
            if (/^[0-9]$/.test(e.key)) { addPin(e.key); e.preventDefault(); }
            else if (e.key === 'Backspace') { backspacePin(); e.preventDefault(); }
            else if (e.key === 'Escape') { clearPin(); }
        });
        pinSyncKeypad();
        function updatePinDots() {
            for (let i = 1; i <= 4; i++) {
                const dot = document.getElementById(`dot-${i}`);
                if (i <= currentPin.length) dot.classList.add('filled');
                else dot.classList.remove('filled');
            }
        }
        function checkPin() {
            setTimeout(() => {
                // 1) Классические ролевые PIN (1111/2222/3333) — всегда работают, как раньше.
                const role = Object.keys(pinCodes).find(r => pinCodes[r] === currentPin);
                if (role) { loginAs(role); return; }
                // 2) Личный PIN сотрудника (режим 'employee-pin').
                if (pinLoginMode === 'employee-pin' && pinSelectedEmployeeId != null) {
                    const emp = teamDB.find(e => e.id === pinSelectedEmployeeId);
                    if (emp && emp.pin && String(emp.pin) === currentPin) { loginAsEmployee(emp); return; }
                }
                document.getElementById('pin-msg').textContent = t('auth_pin_wrong');
                document.getElementById('pin-msg').className = 'text-sm text-red-500 mb-10 font-medium';
                currentPin = '';
                updatePinDots();
            }, 200);
        }
        // --- Вход сотрудника по личному PIN (v1.9) ---
        function pinShowEmployeeSelect() {
            pinLoginMode = 'employee-select';
            pinSelectedEmployeeId = null;
            currentPin = ''; updatePinDots();
            const sec = document.getElementById('pin-employee-section');
            if (!sec) return;
            pinSyncKeypad();
            document.getElementById('pin-dots').classList.add('hidden');
            document.getElementById('pin-role-btn').classList.remove('hidden');
            document.getElementById('pin-emp-btn').classList.add('hidden');
            sec.classList.remove('hidden');
            const list = document.getElementById('pin-emp-list');
            if (list) {
                const withPin = teamDB.filter(e => e.pin);
                list.innerHTML = withPin.length === 0
                    ? `<p class="text-sm text-gray-500 text-center py-4">${t('auth_emp_none')}</p>`
                    : withPin.map(e => {
                        const initials = (e.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
                        return `<button onclick="pinSelectEmployee(${e.id})" class="group w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] hover:from-teal-500/20 hover:to-teal-500/5 border border-white/10 hover:border-teal-400/40 transition-all duration-200 mb-3 text-left active:scale-[0.99]"><div class="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400/40 to-teal-700/40 border border-teal-400/30 flex items-center justify-center text-teal-200 font-bold text-sm shrink-0 shadow-lg shadow-teal-900/30">${initials}</div><div class="flex-1 min-w-0"><p class="text-[15px] font-semibold text-white truncate">${e.name}</p><p class="text-xs text-gray-400 mt-0.5">${e.role || ''}</p></div><i class="fa-solid fa-chevron-right text-gray-600 group-hover:text-teal-300 group-hover:translate-x-1 transition-all text-sm"></i></button>`;
                    }).join('');
            }
            document.getElementById('pin-msg').textContent = t('auth_emp_select_msg');
            document.getElementById('pin-msg').className = 'text-sm text-gray-400 mb-10';
        }
        function pinSelectEmployee(id) {
            const emp = teamDB.find(e => e.id === id);
            if (!emp || !emp.pin) return;
            pinLoginMode = 'employee-pin';
            pinSelectedEmployeeId = id;
            currentPin = ''; updatePinDots();
            const sec = document.getElementById('pin-employee-section');
            if (sec) sec.classList.add('hidden');
            pinSyncKeypad();
            document.getElementById('pin-dots').classList.remove('hidden');
            document.getElementById('pin-msg').textContent = t('auth_emp_pin_msg');
            document.getElementById('pin-msg').className = 'text-sm text-gray-400 mb-10';
        }
        function pinShowRoleMode() {
            pinLoginMode = 'role';
            pinSelectedEmployeeId = null;
            currentPin = ''; updatePinDots();
            const sec = document.getElementById('pin-employee-section');
            if (sec) sec.classList.add('hidden');
            pinSyncKeypad();
            document.getElementById('pin-dots').classList.remove('hidden');
            document.getElementById('pin-role-btn').classList.add('hidden');
            document.getElementById('pin-emp-btn').classList.remove('hidden');
            clearPin();
        }
        function loginAsEmployee(emp) {
            currentEmployeeId = emp.id;
            loginAs(emp.accessRole || 'cook', emp.name);
        }
        // Подсказка с PIN-кодами отключена по требованию владельца (2026-10-13): коды не показываем на экране.
        function updatePinHint() { /* отключено */ }
        function loginAs(role, empName) {
            currentAppRole = role;
            
            const badge = document.getElementById('role-badge');
            if(role === 'chef') { badge.textContent = 'ШЕФ'; badge.className = 'px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium border border-red-500/20'; }
            else if(role === 'souschef') { badge.textContent = 'СУ-ШЕФ'; badge.className = 'px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-medium border border-amber-500/20'; }
            else if(role === 'cook') { badge.textContent = 'ПОВАР'; badge.className = 'px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium border border-blue-500/20'; }
            else if(role === 'cashier') { badge.textContent = 'КАССА'; badge.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20'; }
            if (empName) badge.textContent += ' · ' + empName;

            applyRolePermissions();
            pinShowRoleMode();
            
            const screen = document.getElementById('pin-screen');
            screen.classList.add('opacity-0');
            setTimeout(() => screen.classList.add('hidden'), 500);
            
            // Initialization
            initDropdowns(); applyTranslations();
        }
        function logout() {
            const screen = document.getElementById('pin-screen');
            screen.classList.remove('hidden');
            setTimeout(() => screen.classList.remove('opacity-0'), 10);
            clearPin();
            currentAppRole = null;
            currentEmployeeId = null;
            pinLoginMode = 'role';
            pinSelectedEmployeeId = null;
        }

        function applyRolePermissions() {
            const P = PERMISSIONS[currentAppRole] || {};
            const tiles = {
                menu: document.getElementById('tile-menu'),
                ttk: document.getElementById('tile-ttk'),
                fc: document.getElementById('tile-fc'),
                analytics: document.getElementById('tile-analytics'),
                inv: document.getElementById('tile-inv'),
                sales: document.getElementById('tile-sales'),
                stocktake: document.getElementById('tile-stocktake'),
                books: document.getElementById('tile-books'),
                team: document.getElementById('tile-team'),
                settings: document.getElementById('tile-settings'),
                widget: document.getElementById('dashboard-widget')
            };
            
            // Hide all tiles by default
            Object.values(tiles).forEach(t => { if(t) t.style.display = 'none'; });
            (P.tiles || []).forEach(key => { const t = tiles[key]; if (t) t.style.display = 'flex'; });
            
            const invTabs = ['invoices', 'suppliers', 'finance'].map(id => document.getElementById(`inv-tab-btn-${id}`));
            const teamTabs = [document.getElementById('team-tab-btn-staff')];
            const teamRequestsTab = document.getElementById('team-tab-btn-requests');
            const addTtkBtn = document.getElementById('ttk-add-btn');
            const addInvBtn = document.getElementById('inv-add-btn');
            const addKitchenBtn = document.getElementById('btn-add-kitchen');
            const bellBtn = document.getElementById('notif-bell-btn');
            
            if (P.invoices) invTabs.forEach(el => { if(el) el.style.display = 'block'; });
            else invTabs.forEach(el => { if(el) el.style.display = 'none'; });
            
            if (P.personnel) teamTabs.forEach(el => { if(el) el.style.display = 'block'; });
            else teamTabs.forEach(el => { if(el) el.style.display = 'none'; });
            
            // Вкладка «Запросы» видна тем, кто участвует в обменах/выходных
            const seesRequests = P.requestSwap || P.approve;
            if (teamRequestsTab) teamRequestsTab.style.display = seesRequests ? 'block' : 'none';
            
            // Кнопки добавления — только шеф (правка ТТК/ингредиентов/цехов)
            const canAdd = P.settings === true; // настройки = полный доступ
            if(addTtkBtn) addTtkBtn.style.display = canAdd ? 'flex' : 'none';
            if(addInvBtn) addInvBtn.style.display = canAdd ? 'flex' : 'none';
            if(addKitchenBtn) addKitchenBtn.style.display = canAdd ? 'flex' : 'none';
            
            // Колокольчик уведомлений — участникам команды (не кассе)
            if (bellBtn) bellBtn.style.display = (seesRequests || P.approve) ? 'flex' : 'none';
            
            // Склад: без прав на накладные — принудительно вкладка «Ингредиенты»
            if (!P.invoices) activeTabs.inventory = 'ingredients';
            // Команда: без прав на персонал — принудительно вкладка «График»
            if (!P.personnel) activeTabs.team = 'schedule';
            
            updateNotifBadge();
        }

