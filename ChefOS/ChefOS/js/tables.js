        // --- ПЛАН ЗАЛА И СТОЛИКИ (v2.3) ---
        // tablesDB: [{id, name, seats, x, y (в % от плана), shape:'round'|'square',
        //   waiterId: id сотрудника из teamDB или null — официант, за которым закреплён столик}]
        // Назначение живёт прямо на столике: tablesDB уже в PERSISTED_KEYS и LOCATION_KEYS,
        // поэтому оно сохраняется и синкается вместе с планом зала, миграция не нужна
        // (у старых столиков waiterId просто нет = «не назначен»).
        // Отдельного списка официантов в приложении нет: должности в teamDB — свободный текст,
        // в начальных данных только кухня. Поэтому в выбор даём сотрудников из teamDB:
        // если есть люди с ролью «Официант»/waiter — только их, иначе — всех сотрудников.
        // tableTabsDB: [{id, tableId, items:{dishId:qty}, sent:{dishId:qty}, ts}]
        let floorEditMode = false;
        let activeTableTabId = null;
        let activeTableId = null;
        let tableDishQuery = '';

        function tableTabFor(tableId) {
            if (!Array.isArray(tableTabsDB)) tableTabsDB = [];
            return tableTabsDB.find(x => x.tableId === tableId) || null;
        }

        // --- Официанты столиков ---
        const WAITER_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#2dd4bf'];
        function waiterCandidates() {
            const all = (typeof teamDB !== 'undefined' && Array.isArray(teamDB)) ? teamDB : [];
            const waiters = all.filter(e => /официант|waiter/i.test(e.role || ''));
            return waiters.length ? waiters : all;
        }
        function waiterById(id) {
            if (id == null || id === '') return null;
            const all = (typeof teamDB !== 'undefined' && Array.isArray(teamDB)) ? teamDB : [];
            return all.find(e => e.id == id) || null;
        }
        function waiterColor(id) {
            let h = 0; const s = String(id);
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return WAITER_COLORS[h % WAITER_COLORS.length];
        }
        function waiterFirstName(e) { return (e.name || '').trim().split(/\s+/)[0] || ''; }
        // i18n.js сейчас не трогаем (там идёт отдельный фикс): берём ключ, если он есть,
        // иначе — русскую подпись. Как только ключи table_waiter/table_no_waiter появятся
        // в i18n.js, подхватятся автоматически.
        function waiterLabel(key, fallback) {
            try {
                const v = (typeof t === 'function') ? t(key) : key;
                return (v && v !== key) ? v : fallback;
            } catch (e) { return fallback; }
        }
        function parseWaiterId(v) {
            if (!v) return null;
            const n = Number(v);
            return isNaN(n) ? v : n;
        }
        function setTableWaiter(tableId, waiterId) {
            const tb = tablesDB.find(v => v.id === tableId);
            if (!tb) return;
            tb.waiterId = waiterId;
            markDirty();
            renderFloorPlan();
        }
        function setTableWaiterFromPicker(value) {
            if (!activeTableId) return;
            setTableWaiter(activeTableId, parseWaiterId(value));
        }

        // Вкладки кассы: блюда / зал
        const TABLE_SIZES = { s: 56, m: 72, l: 92 };
        function tableSizePx(tb) { return TABLE_SIZES[tb.size] || TABLE_SIZES.m; }
        function tableElapsedMin(tab) {
            if (!tab || !tab.ts) return 0;
            return Math.max(0, Math.floor((Date.now() - new Date(tab.ts).getTime()) / 60000));
        }
        function tableTabSum(tab) {
            let total = 0;
            if (tab) for (const id in (tab.items || {})) {
                const d = (typeof menuDB !== 'undefined') ? menuDB.find(x => x.id == id) : null;
                if (d) total += (d.menuPrice || 0) * tab.items[id];
            }
            return Math.round(total * 100) / 100;
        }

        // 2.1.6 (stage 2): статус «забронирован» — только из существующего
        // reservationsDB (статус 'new', привязка r.tableId, дата = сегодня).
        // Новый модуль броней не изобретаем: нет сегодняшней брони — нет индикатора.
        function tableReservedToday(tableId) {
            try {
                if (typeof reservationsDB === 'undefined' || !Array.isArray(reservationsDB)) return false;
                const today = (typeof resvToday === 'function') ? resvToday() : '';
                if (!today) return false;
                return reservationsDB.some(r => r && r.status === 'new' && r.tableId != null && String(r.tableId) === String(tableId) && r.date === today);
            } catch (e) { return false; }
        }

        // 2.1.6 (stage 2): панель официантов без столиков — как UNASSIGNED SERVERS
        // на референсе SevenRooms. Создаётся динамически после #floor-plan
        // (index.html не трогаем), обновляется при каждом renderFloorPlan.
        // Назначение считается по тому же waiterCandidates(), что и выпадающие списки.
        function renderFloorWaitersPanel() {
            const floorPlan = document.getElementById('floor-plan');
            if (!floorPlan) return;
            let panel = document.getElementById('floor-waiters-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'floor-waiters-panel';
                panel.className = 'mt-3 rounded-2xl bg-black/40 border border-white/10 p-3';
                floorPlan.insertAdjacentElement('afterend', panel);
            }
            const cands = waiterCandidates();
            if (!cands.length) { panel.classList.add('hidden'); return; }
            panel.classList.remove('hidden');
            const assignedIds = (Array.isArray(tablesDB) ? tablesDB : []).map(tb => tb.waiterId);
            const unassigned = cands.filter(e => !assignedIds.some(a => a != null && String(a) === String(e.id)));
            const rows = unassigned.length
                ? unassigned.map(e => `<div class="flex items-center gap-2 py-1 min-w-0"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${waiterColor(e.id)}"></span><span class="text-sm text-gray-200 truncate">${escapeHtml(e.name)}</span><span class="text-xs text-gray-500 shrink-0">${waiterLabel('floor_no_tables', 'нет столиков')}</span></div>`).join('')
                : `<div class="text-sm text-gray-500">${waiterLabel('floor_all_waiters_assigned', 'Все официанты закреплены за столиками')}</div>`;
            panel.innerHTML = `<p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">${waiterLabel('floor_unassigned_waiters', 'Официанты без столиков')}</p>${rows}`;
        }

        function renderFloorPlan() {
            const plan = document.getElementById('floor-canvas');
            if (!plan) return;
            if (!Array.isArray(tablesDB)) tablesDB = [];
            const isChef = (typeof currentAppRole !== 'undefined') && currentAppRole === 'chef';
            const editBtn = document.getElementById('floor-edit-btn');
            if (editBtn) editBtn.style.display = isChef ? '' : 'none';
            if (floorEditMode && !isChef) floorEditMode = false;

            plan.innerHTML = tablesDB.map(tb => {
                const tab = tableTabFor(tb.id);
                const occupied = !!tab;
                const reserved = !occupied && tableReservedToday(tb.id);
                const ring = occupied ? 'border-amber-400/90 shadow-amber-500/25' : reserved ? 'border-violet-400/90 shadow-violet-500/25' : 'border-white/15 shadow-black/40';
                const shape = tb.shape === 'square' ? 'rounded-[22%]' : 'rounded-full';
                const itemCount = tab ? Object.values(tab.items || {}).reduce((a, b) => a + b, 0) : 0;
                const px = tableSizePx(tb);
                const tabSum = occupied ? tableTabSum(tab) : 0;
                const elapsed = occupied ? tableElapsedMin(tab) : 0;
                const pillAbove = tb.y > 76;
                const waiter = waiterById(tb.waiterId);
                const waiterLine = waiter ? `<div class="flex items-center justify-center gap-1 mt-0.5 max-w-[88%] min-w-0 pointer-events-none"><span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${waiterColor(waiter.id)}"></span><span class="text-gray-300 text-[8px] font-medium truncate">${escapeHtml(waiterFirstName(waiter))}</span></div>` : '';
                return `<div class="floor-table absolute select-none ${floorEditMode ? 'cursor-move' : 'cursor-pointer active:scale-95'} transition-transform"
                    data-id="${tb.id}" style="left:${tb.x}%; top:${tb.y}%; transform:translate(-50%,-50%); touch-action:none;"
                    ${floorEditMode ? `onpointerdown="tableDragStart(event, ${tb.id})" onclick="openTableEdit(${tb.id})"` : `onclick="openTableTab(${tb.id})"`}>
                    <div class="relative" style="width:${px}px; height:${px}px;">
                        <div class="${shape} w-full h-full bg-gradient-to-b from-[#3A3A3C] to-[#262628] border-2 ${ring} shadow-lg flex flex-col items-center justify-center pointer-events-none">
                            <div class="text-white font-semibold tracking-wide leading-none ${px >= 92 ? 'text-2xl' : px >= 72 ? 'text-xl' : 'text-lg'}">${escapeHtml(tb.name)}</div>
                            <div class="text-gray-500 ${px >= 72 ? 'text-[10px]' : 'text-[9px]'} mt-1 font-medium">${tb.seats} ${t('table_seats_short')}</div>
                            ${waiterLine}
                        </div>
                        ${occupied && !floorEditMode ? `<div class="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-amber-400 text-black text-[11px] font-bold flex items-center justify-center pointer-events-none shadow-md shadow-black/40">${itemCount}</div>` : ''}
                        ${((tab && tab.allergies && tab.allergies.length) || (tb.allergies && tb.allergies.length)) ? `<div class="absolute -bottom-1.5 -left-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center pointer-events-none shadow-md shadow-black/40" title="${t('table_allergies')}">!</div>` : ''}
                    </div>
                    ${occupied && !floorEditMode ? `<div class="absolute ${pillAbove ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none bg-black/70 backdrop-blur-md border border-white/10 rounded-full pl-2.5 pr-2.5 py-1 shadow-lg shadow-black/40 flex items-center gap-1.5">
                        <span class="text-amber-300 text-[11px] font-bold">${currentCurrency}${tabSum}</span>
                        <span class="text-gray-600 text-[10px]">·</span>
                        <span class="text-gray-400 text-[10px] font-medium">${elapsed} ${t('table_min_short')}</span>
                    </div>` : ''}
                </div>`;
            }).join('');

            const hint = document.getElementById('floor-hint');
            if (hint) {
                hint.textContent = tablesDB.length === 0
                    ? (floorEditMode ? t('floor_hint_add') : t('floor_hint_empty'))
                    : (floorEditMode ? t('floor_hint_edit') : t('floor_hint_view'));
            }
            const eb = document.getElementById('floor-edit-btn');
            if (eb) eb.innerHTML = `<i class="fa-solid ${floorEditMode ? 'fa-check' : 'fa-pen'} mr-2"></i><span>${floorEditMode ? t('floor_done') : t('floor_edit')}</span>`;
            renderFloorWaitersPanel();
            renderPosHost();
            posDockZoomControls();
            floorInitGestures();
            applyFloorTransform();
        }

        function toggleFloorEdit() {
            floorEditMode = !floorEditMode;
            floorZoomReset();
            renderFloorPlan();
        }

        // --- Масштабирование плана зала: щипок, колесо, кнопки, панорама ---
        let floorZoom = 1, floorPanX = 0, floorPanY = 0;
        const _floorPtrs = new Map();
        let _floorPinchD = 0, _floorPanOn = false, _floorPanMoved = false;
        function applyFloorTransform() {
            const c = document.getElementById('floor-canvas');
            if (c) c.style.transform = `translate(${floorPanX}px, ${floorPanY}px) scale(${floorZoom})`;
            const rb = document.getElementById('floor-zoom-reset');
            if (rb) rb.classList.toggle('hidden', floorZoom === 1 && floorPanX === 0 && floorPanY === 0);
        }
        function clampFloorPan() {
            const vp = document.getElementById('floor-plan');
            if (!vp) return;
            const r = vp.getBoundingClientRect();
            const limX = Math.max(0, r.width * (floorZoom - 1) / 2) + 24;
            const limY = Math.max(0, r.height * (floorZoom - 1) / 2) + 24;
            floorPanX = Math.min(limX, Math.max(-limX, floorPanX));
            floorPanY = Math.min(limY, Math.max(-limY, floorPanY));
        }
        function floorZoomAt(clientX, clientY, factor) {
            const vp = document.getElementById('floor-plan');
            if (!vp) return;
            const r = vp.getBoundingClientRect();
            const mx = clientX - (r.left + r.width / 2), my = clientY - (r.top + r.height / 2);
            const nz = Math.min(3, Math.max(1, floorZoom * factor));
            if (nz === floorZoom) return;
            const k = nz / floorZoom;
            floorPanX = mx - (mx - floorPanX) * k;
            floorPanY = my - (my - floorPanY) * k;
            floorZoom = nz;
            clampFloorPan();
            applyFloorTransform();
        }
        function floorZoomBy(f) {
            const vp = document.getElementById('floor-plan');
            const r = vp ? vp.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
            floorZoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
        }
        function floorZoomReset() {
            floorZoom = 1; floorPanX = 0; floorPanY = 0;
            _floorPtrs.clear(); _floorPinchD = 0; _floorPanOn = false;
            applyFloorTransform();
        }
        function floorPinchDist() {
            const p = [..._floorPtrs.values()];
            return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        }
        function floorInitGestures() {
            const vp = document.getElementById('floor-plan');
            if (!vp || vp._floorGest) return;
            vp._floorGest = true;
            vp.addEventListener('pointerdown', (e) => {
                if (e.target.closest('button')) return;
                // ВАЖНО: не делаем setPointerCapture здесь — он перетаргетирует click
                // на вьюпорт и ломает тапы по столам/канвасу. Захват не нужен:
                // панорама идёт через pointermove на вьюпорте.
                _floorPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
                _floorPanMoved = false;
                if (_floorPtrs.size === 2) {
                    _floorPinchD = floorPinchDist();
                    _floorPanOn = false;
                } else if (_floorPtrs.size === 1 && !floorEditMode && !e.target.closest('.floor-table')) {
                    _floorPanArmed = true; // панорама разрешена, но стартует только после порога
                    _floorPanOn = false;
                } else {
                    _floorPanArmed = false;
                    _floorPanOn = false;
                }
            });
            vp.addEventListener('pointermove', (e) => {
                if (!_floorPtrs.has(e.pointerId)) return;
                const pt = _floorPtrs.get(e.pointerId);
                const prevX = pt.x, prevY = pt.y;
                pt.x = e.clientX; pt.y = e.clientY;
                if (_floorPtrs.size === 2) {
                    const d = floorPinchDist();
                    if (_floorPinchD > 0 && d > 0 && Math.abs(d - _floorPinchD) > 2) {
                        const p = [..._floorPtrs.values()];
                        floorZoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, d / _floorPinchD);
                        _floorPanMoved = true;
                    }
                    _floorPinchD = d;
                } else if (_floorPtrs.size === 1 && _floorPanArmed) {
                    // порог 10px: микро-движения мыши не считаются панорамой и не глотают клик
                    if (!_floorPanOn && Math.hypot(e.clientX - pt.sx, e.clientY - pt.sy) > 10) _floorPanOn = true;
                    if (_floorPanOn) {
                        floorPanX += e.clientX - prevX;
                        floorPanY += e.clientY - prevY;
                        _floorPanMoved = true;
                        clampFloorPan();
                        applyFloorTransform();
                    }
                }
            });
            const end = (e) => {
                _floorPtrs.delete(e.pointerId);
                if (_floorPtrs.size < 2) _floorPinchD = 0;
                if (_floorPtrs.size === 0) { _floorPanOn = false; _floorPanArmed = false; }
            };
            vp.addEventListener('pointerup', end);
            vp.addEventListener('pointercancel', end);
            // страховка: pointerup мимо вьюпорта (без capture) — чистим зависшие указатели
            if (!vp._floorWinEnd) {
                vp._floorWinEnd = true;
                window.addEventListener('pointerup', end);
                window.addEventListener('pointercancel', end);
            }
            vp.addEventListener('wheel', (e) => {
                // Зум — только с Ctrl/Cmd (как в картах): обычное колесо листает модалку,
                // иначе над планом зала невозможно прокрутить кассу.
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    floorZoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 0.87);
                }
            }, { passive: false });
            // клик по столику после панорамы — не открывать счёт
            vp.addEventListener('click', (e) => {
                if (_floorPanMoved && e.target.closest('.floor-table')) {
                    e.stopPropagation();
                    e.preventDefault();
                    _floorPanMoved = false;
                }
            }, true);
        }

        function floorPlanClick(e) {
            if (!floorEditMode) return;
            if (e.target.closest('.floor-table')) return;
            const plan = document.getElementById('floor-canvas');
            const r = plan.getBoundingClientRect();
            const x = Math.min(94, Math.max(6, ((e.clientX - r.left) / r.width) * 100));
            const y = Math.min(90, Math.max(10, ((e.clientY - r.top) / r.height) * 100));
            openTableEdit(null, x, y);
        }

        // Диалог создания/редактирования столика
        let editingTableId = null, pendingTableXY = null, pendingTableShape = 'round', pendingTableSize = 'm';
        function openTableEdit(id, x, y) {
            if (_suppressTableClick) return;
            editingTableId = id;
            pendingTableXY = (x !== undefined) ? { x, y } : null;
            const tb = id ? tablesDB.find(v => v.id === id) : null;
            pendingTableShape = tb ? tb.shape : 'round';
            pendingTableSize = (tb && tb.size) ? tb.size : 'm';
            let defName = String(tablesDB.length + 1);
            if (!tb) { let n = tablesDB.length + 1; while (tablesDB.some(v => v.name === String(n))) n++; defName = String(n); }
            document.getElementById('table-edit-name').value = tb ? tb.name : defName;
            document.getElementById('table-edit-seats').value = tb ? tb.seats : 2;
            renderTableShapeBtns();
            renderTableSizeBtns();
            document.getElementById('table-edit-delete').style.display = tb ? '' : 'none';
            document.getElementById('table-edit-title').textContent = tb ? t('table_edit_title') : t('table_add_title');
            renderTableWaiterSelect();
            openModal('table-edit-modal');
        }
        // Селект официанта в диалоге столика. Разметку index.html не трогаем:
        // строку доклеиваем в диалог при открытии, перед кнопкой «Сохранить».
        function renderTableWaiterSelect() {
            const modal = document.getElementById('table-edit-modal');
            if (!modal) return;
            let row = document.getElementById('table-edit-waiter-row');
            if (!row) {
                row = document.createElement('div');
                row.id = 'table-edit-waiter-row';
                const saveBtn = modal.querySelector('button[onclick="saveTableEdit()"]');
                if (saveBtn && saveBtn.parentNode) saveBtn.parentNode.insertBefore(row, saveBtn);
                else modal.appendChild(row);
            }
            const tb = editingTableId ? tablesDB.find(v => v.id === editingTableId) : null;
            const cur = tb ? tb.waiterId : null;
            const opts = waiterCandidates().map(e => `<option value="${e.id}" ${cur == e.id ? 'selected' : ''}>${escapeHtml(e.name)}${e.role ? ' — ' + escapeHtml(e.role) : ''}</option>`).join('');
            row.innerHTML = `<label class="text-xs text-gray-400 block mb-1">${waiterLabel('table_waiter', 'Официант')}</label>
                <select id="table-edit-waiter" class="w-full h-11 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-3 outline-none focus:border-emerald-500">
                    <option value="">${waiterLabel('table_no_waiter', 'Не назначен')}</option>${opts}
                </select>`;
        }
        function renderTableShapeBtns() {
            const r = document.getElementById('table-shape-round');
            const s = document.getElementById('table-shape-square');
            const on = ['bg-emerald-500', 'text-white', 'border-emerald-500'];
            const off = ['bg-[#2C2C2E]', 'text-gray-300', 'border-white/10'];
            [[r, pendingTableShape === 'round'], [s, pendingTableShape === 'square']].forEach(([b, active]) => {
                b.classList.remove(...(active ? off : on));
                b.classList.add(...(active ? on : off));
            });
        }
        function setTableShape(shape) { pendingTableShape = shape; renderTableShapeBtns(); }
        function renderTableSizeBtns() {
            const map = { s: 'table-size-s', m: 'table-size-m', l: 'table-size-l' };
            const on = ['bg-emerald-500', 'text-white', 'border-emerald-500'];
            const off = ['bg-[#2C2C2E]', 'text-gray-300', 'border-white/10'];
            for (const k in map) {
                const b = document.getElementById(map[k]);
                if (!b) continue;
                const active = pendingTableSize === k;
                b.classList.remove(...(active ? off : on));
                b.classList.add(...(active ? on : off));
            }
        }
        function setTableSize(size) { pendingTableSize = size; renderTableSizeBtns(); }
        function saveTableEdit() {
            const name = document.getElementById('table-edit-name').value.trim();
            const seats = Math.max(1, Math.min(20, parseInt(document.getElementById('table-edit-seats').value) || 2));
            if (!name) { showNotification(t('table_name_needed')); return; }
            const wSel = document.getElementById('table-edit-waiter');
            // undefined — селекта нет (сохранение не из диалога): чужое назначение не трогаем.
            const waiterId = wSel ? parseWaiterId(wSel.value) : undefined;
            if (editingTableId) {
                const tb = tablesDB.find(v => v.id === editingTableId);
                if (tb) { tb.name = name; tb.seats = seats; tb.shape = pendingTableShape; tb.size = pendingTableSize; if (waiterId !== undefined) tb.waiterId = waiterId; }
            } else {
                tablesDB.push({ id: Date.now(), name, seats, shape: pendingTableShape, size: pendingTableSize, waiterId: waiterId !== undefined ? waiterId : null, x: pendingTableXY ? Math.round(pendingTableXY.x * 10) / 10 : 50, y: pendingTableXY ? Math.round(pendingTableXY.y * 10) / 10 : 50 });
            }
            markDirty();
            closeModal('table-edit-modal');
            renderFloorPlan();
        }
        function deleteTableEdit() {
            if (!editingTableId) return;
            const i = tablesDB.findIndex(v => v.id === editingTableId);
            if (i >= 0) tablesDB.splice(i, 1);
            const ti = tableTabsDB.findIndex(x => x.tableId === editingTableId);
            if (ti >= 0) tableTabsDB.splice(ti, 1);
            markDirty();
            closeModal('table-edit-modal');
            renderFloorPlan();
        }

        // Перетаскивание в режиме редактирования
        let dragTableId = null, dragMoved = false, _suppressTableClick = false;
        function tableDragStart(e, id) {
            if (!floorEditMode) return;
            if (_floorPtrs.size > 1) return;
            dragTableId = id; dragMoved = false;
            e.preventDefault();
            const move = (ev) => {
                if (dragTableId !== id) return;
                const plan = document.getElementById('floor-canvas');
                const r = plan.getBoundingClientRect();
                const cx = (ev.touches && ev.touches[0]) ? ev.touches[0].clientX : ev.clientX;
                const cy = (ev.touches && ev.touches[0]) ? ev.touches[0].clientY : ev.clientY;
                const tb = tablesDB.find(v => v.id === id);
                if (!tb) return;
                tb.x = Math.round(Math.min(94, Math.max(6, ((cx - r.left) / r.width) * 100)) * 10) / 10;
                tb.y = Math.round(Math.min(90, Math.max(10, ((cy - r.top) / r.height) * 100)) * 10) / 10;
                dragMoved = true;
                const el = plan.querySelector(`[data-id="${id}"]`);
                if (el) { el.style.left = tb.x + '%'; el.style.top = tb.y + '%'; }
            };
            const up = () => {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', up);
                document.removeEventListener('pointercancel', up);
                document.removeEventListener('touchmove', move);
                document.removeEventListener('touchend', up);
                if (dragMoved) markDirty();
                // Клик после драга не должен открывать редактор
                if (dragMoved) { _suppressTableClick = true; setTimeout(() => { _suppressTableClick = false; }, 120); }
                dragTableId = null;
                dragMoved = false;
            };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
            document.addEventListener('pointercancel', up);
            document.addEventListener('touchmove', move, { passive: true });
            document.addEventListener('touchend', up);
        }

        // --- СЧЁТ СТОЛИКА ---
        function openTableTab(tableId) {
            const tb = tablesDB.find(v => v.id === tableId);
            if (!tb) return;
            const tab = tableTabFor(tableId);
            activeTableId = tableId;
            activeTableTabId = tab ? tab.id : null;
            tableDishQuery = '';
            const si = document.getElementById('table-tab-search');
            if (si) si.value = '';
            renderTableTab();
            openModal('table-tab-modal');
        }
        // Посадить гостей: открыть пустой счёт = стол занят. Размер компании и имя
        // берутся из формы в свободной панели (если она есть); посадка из хост-панели
        // и броней идёт через posSeatTable с теми же полями на счёте.
        function seatTableGuests() {
            if (!activeTableId || tableTabFor(activeTableId)) return;
            const gEl = document.getElementById('table-seat-guests');
            const nEl = document.getElementById('table-seat-name');
            const guests = gEl ? Math.max(1, Math.min(20, parseInt(gEl.value) || 2)) : 0;
            const guestName = nEl ? nEl.value.trim() : '';
            const tab = posSeatTable(activeTableId, guests, guestName);
            if (!tab) return;
            activeTableTabId = tab.id;
            renderTableTab();
            renderFloorPlan();
        }
        // Кнопка статуса: занят/свободен
        function toggleTableStatus() {
            const tab = activeTab();
            if (!tab) return;
            const hasItems = Object.keys(tab.items || {}).length > 0;
            if (hasItems) { showNotification(t('table_cannot_free')); return; }
            const i = tableTabsDB.findIndex(x => x.id === tab.id);
            if (i >= 0) tableTabsDB.splice(i, 1);
            activeTableTabId = null;
            markDirty();
            closeTableTabModal();
            showNotification(t('table_freed'));
        }
        function activeTab() {
            return (typeof tableTabsDB !== 'undefined' && Array.isArray(tableTabsDB) ? tableTabsDB : []).find(x => x.id === activeTableTabId) || null;
        }
        function tableTabAddDish(dishId) {
            const tab = activeTab();
            if (!tab) return;
            tab.items[dishId] = (tab.items[dishId] || 0) + 1;
            markDirty();
            renderTableTab();
            renderFloorPlan();
            if (navigator.vibrate) navigator.vibrate(10);
        }
        function tableTabRemoveDish(dishId) {
            const tab = activeTab();
            if (!tab || !tab.items[dishId]) return;
            tab.items[dishId]--;
            if (tab.items[dishId] <= 0) delete tab.items[dishId];
            markDirty();
            renderTableTab();
            renderFloorPlan();
        }
        function tableTabTotals() {
            const tab = activeTab();
            let total = 0, count = 0;
            if (tab) for (const id in tab.items) {
                const d = (typeof menuDB !== 'undefined') ? menuDB.find(x => x.id == id) : null;
                if (d) { total += (d.menuPrice || 0) * tab.items[id]; count += tab.items[id]; }
            }
            return { total: Math.round(total * 100) / 100, count };
        }
        // Быстрое назначение официанта из счёта столика: тап по столику → селект.
        // Строку доклеиваем в модалку при каждой отрисовке (разметку index.html не трогаем),
        // значение всегда берётся из tb.waiterId, поэтому не расходится с планом зала.
        // Назначение не привязано к посадке гостей: оно живёт на столике и переживает
        // освобождение счёта — это закрепление секций, а не текущего заказа.
        function renderTableWaiterPicker() {
            const stBtn = document.getElementById('table-status-btn');
            if (!stBtn || !stBtn.parentNode) return;
            const tb = tablesDB.find(v => v.id === activeTableId);
            if (!tb) return;
            let row = document.getElementById('table-tab-waiter-row');
            if (!row) {
                row = document.createElement('div');
                row.id = 'table-tab-waiter-row';
                row.className = 'px-6 pt-3';
                stBtn.parentNode.insertAdjacentElement('afterend', row);
            }
            const opts = waiterCandidates().map(e => `<option value="${e.id}" ${tb.waiterId == e.id ? 'selected' : ''}>${escapeHtml(e.name)}${e.role ? ' — ' + escapeHtml(e.role) : ''}</option>`).join('');
            row.innerHTML = `<div class="flex items-center gap-2">
                <label class="text-xs text-gray-400 shrink-0">${waiterLabel('table_waiter', 'Официант')}</label>
                <select onchange="setTableWaiterFromPicker(this.value)" class="flex-1 h-10 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-3 outline-none focus:border-emerald-500 text-sm">
                    <option value="">${waiterLabel('table_no_waiter', 'Не назначен')}</option>${opts}
                </select>
            </div>`;
        }
        function renderTableTab() {
            const tab = activeTab();
            const tb = tablesDB.find(v => v.id === (tab ? tab.tableId : activeTableId));
            const freePane = document.getElementById('table-tab-free');
            const busyPane = document.getElementById('table-tab-busy');
            const stBtn = document.getElementById('table-status-btn');
            const occupied = !!tab;
            if (freePane) freePane.classList.toggle('hidden', occupied);
            if (busyPane) busyPane.classList.toggle('hidden', !occupied);
            if (stBtn) {
                stBtn.innerHTML = occupied
                    ? `<i class="fa-solid fa-users mr-2"></i><span>${t('table_is_occupied')}</span>`
                    : `<i class="fa-solid fa-circle-check mr-2"></i><span>${t('table_is_free')}</span>`;
                const on = ['bg-amber-500', 'text-black', 'border-amber-500'];
                const off = ['bg-emerald-500/15', 'text-emerald-300', 'border-emerald-500/40'];
                stBtn.classList.remove(...(occupied ? off : on));
                stBtn.classList.add(...(occupied ? on : off));
                // В свободном состоянии это индикатор, а не кнопка — действие одно: «Посадить гостей»
                stBtn.classList.toggle('pointer-events-none', !occupied);
            }
            const subEl = document.querySelector('#table-tab-modal [data-i18n="table_tab_subtitle"]');
            renderTableWaiterPicker();
            if (!tab) {
                const title = document.getElementById('table-tab-title');
                if (title) title.textContent = (t('table_prefix') + ' ' + (tb ? tb.name : '')) + (tb ? ` · ${tb.seats} ${t('table_seats_short')}` : '');
                if (subEl) subEl.textContent = t('table_is_free');
                renderTableSeatForm();
                return;
            }
            const title = document.getElementById('table-tab-title');
            if (title) title.textContent = (t('table_prefix') + ' ' + (tb ? tb.name : '')) + (tb ? ` · ${tb.seats} ${t('table_seats_short')}` : '');
            if (subEl) subEl.textContent = `${t('table_tab_subtitle')} · ${tableElapsedMin(tab)} ${t('table_min_short')}`;
            renderTableTabAllergens();
            const { total, count } = tableTabTotals();

            // Позиции счёта
            const list = document.getElementById('table-tab-items');
            const ids = Object.keys(tab.items || {});
            if (list) {
                list.innerHTML = ids.length === 0
                    ? `<p class="text-gray-500 text-sm text-center py-4">${t('table_empty_tab')}</p>`
                    : ids.map(id => {
                        const d = menuDB.find(x => x.id == id);
                        if (!d) return '';
                        const q = tab.items[id];
                        const sentQ = (tab.sent && tab.sent[id]) || 0;
                        const unsent = q - sentQ;
                        return `<div class="flex items-center justify-between bg-[#2C2C2E] rounded-xl px-3 py-2 mb-2">
                            <div class="min-w-0">
                                <div class="text-white text-sm truncate">${escapeHtml(d.name)}${unsent > 0 ? ` <span class="text-amber-400 text-xs">· ${t('table_not_sent')}</span>` : ''}</div>
                                <div class="text-gray-400 text-xs">${currentCurrency}${d.menuPrice || 0} × ${q}</div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <button onclick="tableTabRemoveDish(${d.id})" class="w-8 h-8 rounded-full bg-black/50 text-white border border-white/20 active:scale-90">−</button>
                                <span class="text-white font-bold w-6 text-center">${q}</span>
                                <button onclick="tableTabAddDish(${d.id})" class="w-8 h-8 rounded-full bg-emerald-500 text-white active:scale-90">+</button>
                            </div>
                        </div>`;
                    }).join('');
            }
            const tv = document.getElementById('table-tab-total');
            if (tv) tv.textContent = `${currentCurrency}${total}`;
            const tc = document.getElementById('table-tab-count');
            if (tc) tc.textContent = count > 0 ? `${count} ${t('unit_pcs')}` : '';
            const payBtn = document.getElementById('table-tab-pay');
            if (payBtn) {
                payBtn.classList.toggle('opacity-40', count === 0);
                payBtn.classList.toggle('pointer-events-none', count === 0);
            }
            const kdsBtn = document.getElementById('table-tab-kds');
            if (kdsBtn) {
                const hasUnsent = ids.some(id => (tab.items[id] - ((tab.sent && tab.sent[id]) || 0)) > 0);
                kdsBtn.classList.toggle('opacity-40', !hasUnsent);
                kdsBtn.classList.toggle('pointer-events-none', !hasUnsent);
            }

            // Блюда для добавления
            const grid = document.getElementById('table-tab-dishes');
            if (grid) {
                const q = tableDishQuery.toLowerCase();
                const dishes = (menuDB || []).filter(d => d.type === 'dish' && d.isTTKActive && (!q || d.name.toLowerCase().includes(q)));
                grid.innerHTML = dishes.length === 0
                    ? `<p class="text-gray-500 text-sm text-center col-span-3">${t('sales_no_dishes')}</p>`
                    : dishes.map(d => `
                        <div class="rounded-xl overflow-hidden bg-black/40 border border-white/5 cursor-pointer active:scale-95 transition-transform select-none" onclick="tableTabAddDish(${d.id})">
                            <div class="p-2">
                                <div class="text-white text-[11px] font-medium leading-tight min-h-[28px]">${escapeHtml(d.name)}</div>
                                <div class="text-emerald-400 text-xs font-bold mt-1">${currentCurrency}${d.menuPrice || 0}</div>
                            </div>
                        </div>`).join('');
            }
        }
        function renderTableTabAllergens() {
            const box = document.getElementById('table-tab-allergens');
            const tab = activeTab();
            if (!box || !tab) { if (box) box.innerHTML = ''; return; }
            const list = (typeof ALLERGENS !== 'undefined') ? ALLERGENS : [];
            const sel = Array.isArray(tab.allergies) ? tab.allergies : [];
            box.innerHTML = list.map(a => {
                const on = sel.includes(a);
                return `<button onclick="toggleTableTabAllergen('${a}')" class="h-9 px-2.5 rounded-lg text-[11px] font-medium border transition-all active:scale-95 ${on ? 'bg-red-500/20 text-red-300 border-red-500/60' : 'bg-[#2C2C2E] text-gray-400 border-white/10'}">${on ? '⚠ ' : ''}${t('alg_' + a)}</button>`;
            }).join('');
        }
        function toggleTableTabAllergen(a) {
            const tab = activeTab(); if (!tab) return;
            if (!Array.isArray(tab.allergies)) tab.allergies = [];
            const i = tab.allergies.indexOf(a);
            if (i >= 0) tab.allergies.splice(i, 1); else tab.allergies.push(a);
            markDirty();
            renderTableTabAllergens();
            renderFloorPlan();
        }
        function filterTableTabDishes() {
            const si = document.getElementById('table-tab-search');
            tableDishQuery = si ? si.value : '';
            renderTableTab();
        }

        // Отправить новые позиции на кухню (KDS)
        function sendTableTabToKitchen() {
            const tab = activeTab();
            if (!tab) return;
            const tb = tablesDB.find(v => v.id === tab.tableId);
            const tableName = t('table_prefix') + ' ' + (tb ? tb.name : '');
            const fresh = Object.keys(tab.items || {}).filter(id => (tab.items[id] - ((tab.sent && tab.sent[id]) || 0)) > 0);
            if (!fresh.length) return;
            if (!Array.isArray(kdsDB)) kdsDB = [];
            const todayKey = new Date().toISOString().slice(0, 10);
            const num = kdsDB.filter(x => (x.ts || '').slice(0, 10) === todayKey).length + 1;
            const ticket = {
                id: Date.now(), num, ts: new Date().toISOString(), table: tableName,
                items: fresh.map(id => { const d = menuDB.find(x => x.id == id); return { name: d ? d.name : '?', qty: tab.items[id] - (tab.sent[id] || 0) }; }),
                status: 'new'
            };
            const tAlg = Array.isArray(tab.allergies) ? tab.allergies : [];
            if (tAlg.length) ticket.allergies = tAlg.slice();
            kdsDB.unshift(ticket);
            fresh.forEach(id => { tab.sent[id] = tab.items[id]; });
            markDirty();
            renderTableTab();
            showNotification(`${t('table_sent_kitchen')}: ${tableName}`);
        }

        // Оплатить счёт: счёт столика уходит в кассу — скидки, чаевые,
        // способ оплаты и чек как на вынос. Счёт закроется после оплаты.
        function payTableTab() {
            const tab = activeTab();
            if (!tab) return;
            if (typeof posLoadTableTab === 'function') { posLoadTableTab(tab.id); return; }
            // Фолбэк, если касса недоступна: старое прямое проведение
            const { count } = tableTabTotals();
            if (count === 0) { showNotification(t('sales_empty')); return; }
            const tb = tablesDB.find(v => v.id === tab.tableId);
            const tableName = t('table_prefix') + ' ' + (tb ? tb.name : '');
            commitSale(Object.keys(tab.items || {}).map(id => ({ id: Number(id), qty: tab.items[id], mods: [] })), { tableId: tab.tableId, tableName, allergies: Array.isArray(tab.allergies) ? tab.allergies.slice() : [] });
            const i = tableTabsDB.findIndex(x => x.id === tab.id);
            if (i >= 0) tableTabsDB.splice(i, 1);
            markDirty();
            closeTableTabModal();
            showNotification(`${t('sales_success')}: ${tableName}`);
        }

        function closeTableTabModal() {
            activeTableTabId = null;
            activeTableId = null;
            closeModal('table-tab-modal');
            renderFloorPlan();
        }

        // --- ХОСТ КАССЫ (2.1.7): лист ожидания, брони на сегодня, посажены, счётчики ---
        // Всё в tables.js, разметка index.html не тронута: панель создаётся динамически
        // после панели официантов (или после #floor-plan) и живёт внутри pos-floor-wrap,
        // поэтому показывается/скрывается вместе с планом зала. Обновляется при каждом
        // renderFloorPlan + раз в 60 сек (только панель, без перерисовки плана — чтобы
        // не сбивать зум/панораму и не стирать ввод в формах: значения полей сохраняются).
        // waitlistDB — новая коллекция (объявлена в data.js, добавлена в PERSISTED_KEYS
        // и LOCATION_KEYS): сохраняется и синкается, как tablesDB. Брони — существующий
        // reservationsDB: статусы new/done/cancelled + новое значение noshow (не пришёл),
        // VIP — простое поле vip на самой брони, отдельного хранилища нет.
        // Сервисов Lunch/Dinner в кассе нет — переключение даты/сервиса не делаем:
        // хост-панель всегда про сегодня.
        function posHostLabel(key, fallback) { return waiterLabel(key, fallback); }
        function posFmtElapsed(min) {
            min = Math.max(0, Math.floor(min || 0));
            if (min < 60) return min + ' ' + waiterLabel('table_min_short', 'мин');
            return Math.floor(min / 60) + 'ч ' + (min % 60) + ' ' + waiterLabel('table_min_short', 'мин');
        }
        function posTimeHHMM(iso) {
            try { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
            catch (e) { return ''; }
        }
        function posFreeTables() {
            return (Array.isArray(tablesDB) ? tablesDB : []).filter(tb => !tableTabFor(tb.id));
        }
        function posTableById(id) {
            return (Array.isArray(tablesDB) ? tablesDB : []).find(x => String(x.id) === String(id)) || null;
        }
        function posFreeTableOptions(selectedId) {
            const opts = posFreeTables().map(tb => `<option value="${tb.id}" ${String(tb.id) === String(selectedId) ? 'selected' : ''}>${posHostLabel('pos_table_prefix', 'Стол')} ${escapeHtml(tb.name)} · ${tb.seats} ${waiterLabel('table_seats_short', 'мест')}</option>`).join('');
            return `<option value="">${posHostLabel('pos_choose_table', 'Выбрать стол…')}</option>` + opts;
        }
        // Посадить гостей на стол: создаёт счёт (стол становится занятым).
        // guests/guestName необязательны — старые вызовы без них работают как раньше.
        function posSeatTable(tableId, guests, guestName) {
            const tb = posTableById(tableId);
            if (!tb) return null;
            if (tableTabFor(tb.id)) { showNotification(posHostLabel('pos_table_busy', 'Стол уже занят')); return null; }
            const legacyAlg = (tb.allergies) ? tb.allergies.slice() : [];
            if (tb.allergies) tb.allergies = [];
            const tab = { id: Date.now(), tableId: tb.id, items: {}, sent: {}, ts: new Date().toISOString(), allergies: legacyAlg };
            if (guests) tab.guests = guests;
            if (guestName) tab.guestName = guestName;
            if (!Array.isArray(tableTabsDB)) tableTabsDB = [];
            tableTabsDB.push(tab);
            markDirty();
            return tab;
        }
        function posWaitlist() { if (!Array.isArray(waitlistDB)) waitlistDB = []; return waitlistDB; }
        function posWaitlistAdd() {
            const nEl = document.getElementById('pos-wl-name');
            const gEl = document.getElementById('pos-wl-guests');
            const guests = gEl ? Math.max(1, Math.min(20, parseInt(gEl.value) || 1)) : 1;
            const name = nEl ? nEl.value.trim() : '';
            posWaitlist().push({ id: Date.now(), name: name, guests: guests, ts: new Date().toISOString() });
            if (nEl) nEl.value = '';
            markDirty(); renderPosHost();
            showNotification(posHostLabel('pos_wl_added', 'Добавлен в лист ожидания'));
        }
        function posWaitlistRemove(id) {
            if (!Array.isArray(waitlistDB)) return;
            waitlistDB = waitlistDB.filter(w => String(w.id) !== String(id));
            markDirty(); renderPosHost();
        }
        function posWaitlistSeat(id) {
            const w = (Array.isArray(waitlistDB) ? waitlistDB : []).find(x => String(x.id) === String(id));
            if (!w) return;
            const sel = document.getElementById('pos-wl-table-' + w.id);
            const tableId = sel ? sel.value : '';
            if (!tableId) { showNotification(posHostLabel('pos_choose_table', 'Выбрать стол…')); return; }
            const tab = posSeatTable(tableId, w.guests, w.name);
            if (!tab) return;
            posWaitlistRemove(id);
            renderFloorPlan();
        }
        function posResvTodayRows() {
            const today = (typeof resvToday === 'function') ? resvToday() : new Date().toISOString().slice(0, 10);
            return (typeof reservationsDB !== 'undefined' && Array.isArray(reservationsDB) ? reservationsDB : [])
                .filter(r => r.date === today)
                .sort((a, b) => String(a.time).localeCompare(String(b.time)));
        }
        function posResvBadge(st) {
            const base = 'text-[11px] font-semibold shrink-0';
            if (st === 'done') return `<span class="${base} text-emerald-400">${waiterLabel('resv_done', 'посажены')}</span>`;
            if (st === 'cancelled') return `<span class="${base} text-gray-500">${waiterLabel('resv_cancelled', 'отменена')}</span>`;
            if (st === 'noshow') return `<span class="${base} text-rose-400">${posHostLabel('resv_noshow', 'Не пришёл')}</span>`;
            return `<span class="${base} text-amber-400">${waiterLabel('resv_new', 'ожидает')}</span>`;
        }
        function posResvSeat(id) {
            const r = (Array.isArray(reservationsDB) ? reservationsDB : []).find(x => String(x.id) === String(id));
            if (!r || r.status !== 'new') return;
            const sel = document.getElementById('pos-resv-table-' + r.id);
            const tableId = sel ? sel.value : (r.tableId || '');
            if (!tableId) { showNotification(posHostLabel('pos_choose_table', 'Выбрать стол…')); return; }
            const tab = posSeatTable(tableId, r.guests, r.name);
            if (!tab) return;
            r.tableId = tab.tableId;
            r.status = 'done';
            markDirty(); renderFloorPlan();
            if (typeof renderReservations === 'function') renderReservations();
        }
        function posResvSetStatus(id, st) {
            const r = (Array.isArray(reservationsDB) ? reservationsDB : []).find(x => String(x.id) === String(id));
            if (!r) return;
            r.status = st; markDirty(); renderPosHost();
            if (typeof renderReservations === 'function') renderReservations();
        }
        function posResvVip(id) {
            const r = (Array.isArray(reservationsDB) ? reservationsDB : []).find(x => String(x.id) === String(id));
            if (!r) return;
            r.vip = !r.vip; markDirty(); renderPosHost();
        }
        function posHostStats() {
            const tabs = Array.isArray(tableTabsDB) ? tableTabsDB : [];
            const tables = Array.isArray(tablesDB) ? tablesDB : [];
            let covers = 0, incomplete = false;
            tabs.forEach(t => { if (t.guests) covers += t.guests; else incomplete = true; });
            const free = posFreeTables().length;
            const resvNew = posResvTodayRows().filter(r => r.status === 'new').length;
            return { occupied: tabs.length, covers: covers, coversPlus: incomplete, free: free, tables: tables.length, resvNew: resvNew, waiting: posWaitlist().length };
        }
        let _posHostTimer = null;
        function renderPosHost() {
            const anchor = document.getElementById('floor-waiters-panel') || document.getElementById('floor-plan');
            if (!anchor) return;
            let panel = document.getElementById('pos-host-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'pos-host-panel';
                panel.className = 'mt-3 rounded-2xl bg-black/40 border border-white/10 p-3 space-y-4';
                anchor.insertAdjacentElement('afterend', panel);
            }
            posBuildCashChrome();
            // Сохраняем ввод пользователя: перерисовка не должна стирать
            // набираемое имя, число гостей и выбранные в строках столы.
            const saved = {};
            panel.querySelectorAll('input, select').forEach(el => { if (el.id) saved[el.id] = el.value; });
            const tabs = (Array.isArray(tableTabsDB) ? tableTabsDB : []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
            const seatedHtml = tabs.length === 0
                ? `<p class="text-sm text-gray-500">${posHostLabel('pos_seated_empty', 'Пока никто не сидит')}</p>`
                : tabs.map(tab => {
                    const tb = posTableById(tab.tableId);
                    const waiter = tb ? waiterById(tb.waiterId) : null;
                    const sum = (typeof tableTabSum === 'function') ? tableTabSum(tab) : 0;
                    const cnt = Object.values(tab.items || {}).reduce((a, b) => a + b, 0);
                    return `<div onclick="openTableTab(${tb ? tb.id : tab.tableId})" class="flex items-center gap-2 py-1.5 cursor-pointer active:opacity-70 min-w-0">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-white truncate">${posHostLabel('pos_table_prefix', 'Стол')} ${escapeHtml(tb ? tb.name : '?')}${tab.guestName ? ' · ' + escapeHtml(tab.guestName) : ''}${tab.guests ? ' · ' + tab.guests + ' ' + waiterLabel('resv_guests', 'гост.') : ''}</p>
                            <p class="text-[11px] text-gray-500 truncate">${posTimeHHMM(tab.ts)} · <span class="pos-seated-elapsed" data-tab-id="${tab.id}">${posFmtElapsed(tableElapsedMin(tab))}</span>${waiter ? ' · ' + escapeHtml(waiterFirstName(waiter)) : ''}${cnt ? ' · ' + cnt + ' ' + waiterLabel('unit_pcs', 'шт') : ''}</p>
                        </div>
                        <span class="text-emerald-400 text-sm font-bold shrink-0">${currentCurrency}${sum}</span>
                    </div>`;
                }).join('');
            const resvRows = posResvTodayRows();
            const resvHtml = resvRows.length === 0
                ? `<p class="text-sm text-gray-500">${posHostLabel('pos_resv_empty', 'На сегодня броней нет')}</p>`
                : resvRows.map(r => {
                    const assigned = posTableById(r.tableId);
                    const acts = r.status === 'new'
                        ? `<div class="flex items-center gap-1.5 mt-1.5">
                            <select id="pos-resv-table-${r.id}" class="h-9 flex-1 min-w-0 bg-[#2C2C2E] border border-white/10 text-white rounded-lg px-2 text-xs outline-none focus:border-purple-500">${posFreeTableOptions(r.tableId)}</select>
                            <button onclick="posResvSeat('${r.id}')" class="h-9 px-3 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white text-xs font-semibold transition-colors shrink-0">${posHostLabel('pos_seat', 'Посадить')}</button>
                            <button onclick="posResvSetStatus('${r.id}','noshow')" class="h-9 px-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 text-xs font-medium transition-colors shrink-0">${posHostLabel('pos_noshow', 'Не пришёл')}</button>
                            <button onclick="posResvSetStatus('${r.id}','cancelled')" class="h-9 px-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 text-xs font-medium transition-colors shrink-0">${posHostLabel('pos_cancel', 'Отмена')}</button>
                        </div>`
                        : '';
                    return `<div class="py-1.5 ${r.status === 'cancelled' || r.status === 'noshow' ? 'opacity-50' : ''}">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-sm font-bold text-white shrink-0">${escapeHtml(r.time || '')}</span>
                            <p class="text-sm text-white truncate flex-1 min-w-0">${escapeHtml(r.name || '')} · ${r.guests || 1} ${waiterLabel('resv_guests', 'гост.')}</p>
                            <button onclick="posResvVip('${r.id}')" title="${posHostLabel('pos_vip', 'VIP')}" class="text-base leading-none shrink-0 ${r.vip ? 'text-amber-400' : 'text-gray-600'}">${r.vip ? '★' : '☆'}</button>
                            <span id="pos-resv-badge-${r.id}">${posResvBadge(r.status)}</span>
                        </div>
                        <p class="text-[11px] text-gray-500 truncate">${posHostLabel('pos_table_prefix', 'Стол')}: ${assigned ? escapeHtml(assigned.name) : posHostLabel('resv_no_table', 'Без стола')}${r.phone ? ' · ' + escapeHtml(r.phone) : ''}${r.note ? ' · ' + escapeHtml(r.note) : ''}</p>
                        ${acts}
                    </div>`;
                }).join('');
            const wl = posWaitlist();
            const wlHtml = wl.length === 0
                ? `<p class="text-sm text-gray-500">${posHostLabel('pos_wl_empty', 'Лист ожидания пуст')}</p>`
                : wl.map(w => {
                    const waitMin = Math.max(0, Math.floor((Date.now() - new Date(w.ts).getTime()) / 60000));
                    return `<div class="py-1.5">
                        <div class="flex items-center gap-2 min-w-0">
                            <p class="text-sm text-white truncate flex-1 min-w-0">${escapeHtml(w.name || posHostLabel('pos_walkin', 'Walk-in'))} · ${w.guests} ${waiterLabel('resv_guests', 'гост.')}</p>
                            <span class="pos-wl-wait text-[11px] text-gray-500 shrink-0" data-wl-id="${w.id}">${posFmtElapsed(waitMin)}</span>
                            <button onclick="posWaitlistRemove(${w.id})" class="w-8 h-8 rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"><i class="fa-solid fa-xmark text-xs"></i></button>
                        </div>
                        <div class="flex items-center gap-1.5 mt-1.5">
                            <select id="pos-wl-table-${w.id}" class="h-9 flex-1 min-w-0 bg-[#2C2C2E] border border-white/10 text-white rounded-lg px-2 text-xs outline-none focus:border-emerald-500">${posFreeTableOptions('')}</select>
                            <button onclick="posWaitlistSeat(${w.id})" class="h-9 px-3 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white text-xs font-semibold transition-colors shrink-0">${posHostLabel('pos_seat', 'Посадить')}</button>
                        </div>
                    </div>`;
                }).join('');
            panel.innerHTML = `<div id="pos-host-sec-seated">
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">${posHostLabel('pos_seated', 'Посажены')}</p>
                    ${seatedHtml}
                </div>
                <div id="pos-host-sec-resv">
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">${posHostLabel('pos_reservations', 'Брони на сегодня')}</p>
                    ${resvHtml}
                </div>
                <div id="pos-host-sec-wl">
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">${posHostLabel('pos_waitlist', 'Лист ожидания')}</p>
                    <div class="flex items-center gap-1.5 mb-2">
                        <input id="pos-wl-name" type="text" maxlength="40" placeholder="${posHostLabel('pos_wl_name_ph', 'Имя (можно пустым)')}" class="h-10 flex-1 min-w-0 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-3 text-sm outline-none focus:border-emerald-500">
                        <input id="pos-wl-guests" type="number" min="1" max="20" value="2" class="h-10 w-16 shrink-0 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-2 text-sm outline-none focus:border-emerald-500 text-center">
                        <button onclick="posWaitlistAdd()" class="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shrink-0">${posHostLabel('pos_wl_add', 'В лист')}</button>
                    </div>
                    <div class="flex items-center gap-1 mb-2">
                        ${[1, 2, 3, 4, 5, 6].map(n => `<button onclick="document.getElementById('pos-wl-guests').value=${n}" class="h-8 w-8 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-colors">${n}</button>`).join('')}
                        <span class="text-[11px] text-gray-500 ml-1">${posHostLabel('pos_wl_guests_hint', 'гостей')}</span>
                    </div>
                    ${wlHtml}
                </div>`;
            Object.keys(saved).forEach(id => { const el = document.getElementById(id); if (el) el.value = saved[id]; });
            if (!_posHostTimer) _posHostTimer = setInterval(() => { try { posHostTick(); } catch (e) {} }, 60000);
            posHostTick();
            posApplyHostTab();
        }

        // --- ХОСТ КАССЫ 2.1.8: липкая шапка, вкладки, док кнопок зума, тик без пересборки ---
        // 1) Кнопки зума (+/−/сброс) раньше лежали absolute-слоем внутри #floor-plan
        // с backdrop-blur: на iOS такой слой при прокрутке модалки «прилипает»
        // к экрану и наезжает на липкую шапку «Касса». Теперь кнопки переезжают
        // в обычную строку над планом (нормальный поток документа, без blur) —
        // прилипать нечему, прокручиваются вместе с планом.
        // 2) Липкая шапка кассы: счётчики + вкладки «Зал/Посажены/Брони/Лист» +
        // поиск блюд (перенесён сюда же из низа страницы). Шапка sticky под
        // шапкой модалки (top измеряется по её высоте), поэтому счётчики и
        // переключение всегда под рукой без прокрутки. Вкладки только
        // показывают/скрывают блоки, данные не трогают; сетка блюд ниже
        // остаётся как раньше (поиск из шапки её фильтрует). Тап по вкладке
        // при закрытом плане открывает план (togglePosFloor(true)).
        // 3) Тик раз в 60 сек больше НЕ пересобирает панель целиком (это
        // сбрасывало фокус при наборе имени в листе ожидания): обновляются
        // только счётчики шапки, числа на вкладках, таймеры «сидят/ждут»
        // и бейджи статусов броней. Новые/удалённые строки появляются при
        // следующем явном действии (посадка, добавление, перерисовка плана).
        let _posHostTab = 'floor';
        function posStickyCountersHtml(st) {
            return `<span class="text-white font-semibold">${posHostLabel('pos_occupied', 'Занято')}: ${st.occupied}/${st.tables}</span>
                <span class="text-gray-300">${posHostLabel('pos_covers', 'Гостей')}: ${st.covers}${st.coversPlus ? '+' : ''}</span>
                <span class="text-gray-300">${posHostLabel('pos_free', 'Свободно')}: ${st.free}</span>
                <span class="text-gray-300">${posHostLabel('pos_resv_today', 'Броней')}: ${st.resvNew}</span>
                <span class="text-gray-300">${posHostLabel('pos_waiting', 'Ожидают')}: ${st.waiting}</span>
                <span class="text-[11px] text-gray-500 ml-auto"><span class="text-amber-400">●</span> ${posHostLabel('pos_st_occupied', 'занят')} <span class="text-violet-400">●</span> ${posHostLabel('pos_st_reserved', 'забронирован')} <span class="text-gray-500">●</span> ${posHostLabel('pos_st_free', 'свободен')}</span>`;
        }
        // Точечное обновление без пересборки: не трогает input/select вообще,
        // поэтому фокус и набираемый текст никуда не деваются.
        function posHostTick() {
            const st = posHostStats();
            const cc = document.getElementById('pos-sticky-counters');
            if (cc) cc.innerHTML = posStickyCountersHtml(st);
            document.querySelectorAll('.pos-tab-count').forEach(el => {
                const t = el.dataset.tab;
                const n = t === 'seated' ? st.occupied : t === 'resv' ? st.resvNew : t === 'wl' ? st.waiting : 0;
                el.textContent = n > 0 ? ' (' + n + ')' : '';
            });
            document.querySelectorAll('.pos-seated-elapsed').forEach(el => {
                const tab = (Array.isArray(tableTabsDB) ? tableTabsDB : []).find(x => String(x.id) === el.dataset.tabId);
                if (tab) el.textContent = posFmtElapsed(tableElapsedMin(tab));
            });
            document.querySelectorAll('.pos-wl-wait').forEach(el => {
                const w = (Array.isArray(waitlistDB) ? waitlistDB : []).find(x => String(x.id) === el.dataset.wlId);
                if (w) el.textContent = posFmtElapsed(Math.max(0, Math.floor((Date.now() - new Date(w.ts).getTime()) / 60000)));
            });
            (Array.isArray(reservationsDB) ? reservationsDB : []).forEach(r => {
                const b = document.getElementById('pos-resv-badge-' + r.id);
                if (b) b.innerHTML = posResvBadge(r.status);
            });
        }
        function posHostTab(tab) {
            _posHostTab = tab;
            const wrap = document.getElementById('pos-floor-wrap');
            if (wrap && wrap.classList.contains('hidden') && typeof togglePosFloor === 'function') {
                togglePosFloor(true); // откроет план → renderFloorPlan → renderPosHost → posApplyHostTab
                return;
            }
            posApplyHostTab();
        }
        function posApplyHostTab() {
            const floor = _posHostTab === 'floor';
            const setVis = (el, vis) => { if (el) el.style.display = vis ? '' : 'none'; };
            setVis(document.getElementById('floor-plan'), floor);
            const hint = document.getElementById('floor-hint');
            setVis(hint ? hint.parentElement : null, floor);
            setVis(document.getElementById('floor-waiters-panel'), floor);
            setVis(document.getElementById('pos-zoom-dock'), floor);
            const rl = document.getElementById('reservations-list');
            setVis(rl ? (rl.closest('div.mb-6') || rl.parentElement) : null, floor);
            const panel = document.getElementById('pos-host-panel');
            setVis(panel, !floor);
            if (panel) {
                setVis(document.getElementById('pos-host-sec-seated'), _posHostTab === 'seated');
                setVis(document.getElementById('pos-host-sec-resv'), _posHostTab === 'resv');
                setVis(document.getElementById('pos-host-sec-wl'), _posHostTab === 'wl');
            }
            document.querySelectorAll('.pos-tab-btn').forEach(b => {
                const active = b.dataset.posTab === _posHostTab;
                b.className = 'pos-tab-btn h-11 flex-1 rounded-xl text-sm font-semibold transition-colors ' + (active ? 'bg-emerald-500 text-white' : 'bg-white/5 text-gray-300');
            });
        }
        function posBuildCashChrome() {
            if (document.getElementById('pos-sticky-bar')) return;
            const ctxRow = document.getElementById('pos-ctx-row');
            if (!ctxRow || !ctxRow.parentElement) return;
            const bar = document.createElement('div');
            bar.id = 'pos-sticky-bar';
            bar.style.cssText = 'position:sticky;z-index:20;background:#1C1C1E;border-bottom:1px solid rgba(255,255,255,0.08);padding:10px 24px 12px;';
            bar.innerHTML = `<div id="pos-sticky-counters" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"></div>
                <div class="flex gap-2 mt-2">
                    <button onclick="posHostTab('floor')" data-pos-tab="floor" class="pos-tab-btn h-11 flex-1 rounded-xl text-sm font-semibold transition-colors">Зал</button>
                    <button onclick="posHostTab('seated')" data-pos-tab="seated" class="pos-tab-btn h-11 flex-1 rounded-xl text-sm font-semibold transition-colors">Посажены<span class="pos-tab-count" data-tab="seated"></span></button>
                    <button onclick="posHostTab('resv')" data-pos-tab="resv" class="pos-tab-btn h-11 flex-1 rounded-xl text-sm font-semibold transition-colors">Брони<span class="pos-tab-count" data-tab="resv"></span></button>
                    <button onclick="posHostTab('wl')" data-pos-tab="wl" class="pos-tab-btn h-11 flex-1 rounded-xl text-sm font-semibold transition-colors">Лист<span class="pos-tab-count" data-tab="wl"></span></button>
                </div>
                <div id="pos-sticky-search-slot" class="mt-2"></div>`;
            ctxRow.parentElement.insertAdjacentElement('beforebegin', bar);
            // Поиск блюд переезжает в шапку: сам input не пересоздаётся,
            // поэтому filterSalesList() продолжает работать по тому же id.
            const search = document.getElementById('sales-search');
            const slot = document.getElementById('pos-sticky-search-slot');
            if (search && search.parentElement && slot) {
                const searchWrap = search.parentElement;
                slot.appendChild(searchWrap);
                if (searchWrap.classList) searchWrap.classList.remove('mb-4');
            } else if (slot) {
                slot.style.display = 'none';
            }
            // Шапка висит ровно под липкой шапкой модалки: top = её высота.
            const syncTop = () => {
                let header = null, el = document.querySelector('[data-i18n="sales_title"]');
                while (el) { if (el.classList && el.classList.contains('sticky')) { header = el; break; } el = el.parentElement; }
                bar.style.top = (header ? header.offsetHeight : 0) + 'px';
            };
            syncTop();
            if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', syncTop);
            posApplyHostTab();
        }
        function posDockZoomControls() {
            const plan = document.getElementById('floor-plan');
            if (!plan || document.getElementById('pos-zoom-dock')) return;
            const reset = document.getElementById('floor-zoom-reset');
            if (!reset || !reset.parentElement) return;
            const ctrl = reset.parentElement;
            const dock = document.createElement('div');
            dock.id = 'pos-zoom-dock';
            dock.className = 'flex items-center gap-2 mb-3';
            const label = document.createElement('span');
            label.className = 'text-xs text-gray-500 mr-1';
            label.textContent = posHostLabel('pos_zoom', 'Масштаб');
            dock.appendChild(label);
            // Переезд кнопок (inline onclick переезжают вместе с узлами),
            // сброс/расширение сохраняет id — applyFloorTransform по-прежнему
            // показывает/скрывает его через класс hidden.
            ctrl.className = 'flex flex-row gap-2';
            ctrl.querySelectorAll('button').forEach(b => {
                const wasHidden = b.classList.contains('hidden');
                b.className = 'h-11 w-11 rounded-xl bg-[#2C2C2E] border border-white/10 text-white text-lg font-bold active:scale-95 transition-transform shadow';
                if (wasHidden) b.classList.add('hidden');
            });
            dock.appendChild(ctrl);
            plan.insertAdjacentElement('beforebegin', dock);
        }

        // Форма посадки в модалке счёта: размер компании + имя. Доклеивается
        // в свободную панель при отрисовке (разметку index.html не трогаем),
        // строится один раз, чтобы перерисовки не стирали ввод.
        function renderTableSeatForm() {
            const pane = document.getElementById('table-tab-free');
            if (!pane) return;
            let row = document.getElementById('table-seat-form');
            if (!row) {
                row = document.createElement('div');
                row.id = 'table-seat-form';
                row.className = 'flex gap-2 mb-3';
                const btn = pane.querySelector('button[onclick="seatTableGuests()"]');
                if (btn && btn.parentNode) btn.parentNode.insertBefore(row, btn);
                else pane.appendChild(row);
            }
            if (row._built) return;
            row._built = true;
            row.innerHTML = `<input id="table-seat-guests" type="number" min="1" max="20" value="2" class="h-11 w-20 shrink-0 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-3 text-sm outline-none focus:border-emerald-500 text-center">
                <input id="table-seat-name" type="text" maxlength="40" placeholder="${posHostLabel('pos_seat_name_ph', 'Имя гостей (необязательно)')}" class="h-11 flex-1 min-w-0 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-3 text-sm outline-none focus:border-emerald-500">`;
        }

        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
