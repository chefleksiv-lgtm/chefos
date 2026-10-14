        // --- ПЛАН ЗАЛА И СТОЛИКИ (v2.3) ---
        // tablesDB: [{id, name, seats, x, y (в % от плана), shape:'round'|'square'}]
        // tableTabsDB: [{id, tableId, items:{dishId:qty}, sent:{dishId:qty}, ts}]
        let floorEditMode = false;
        let activeTableTabId = null;
        let activeTableId = null;
        let tableDishQuery = '';

        function tableTabFor(tableId) {
            if (!Array.isArray(tableTabsDB)) tableTabsDB = [];
            return tableTabsDB.find(x => x.tableId === tableId) || null;
        }

        // Вкладки кассы: блюда / зал
        function switchSalesTab(tab) {
            const dishesBtn = document.getElementById('sales-tab-dishes');
            const floorBtn = document.getElementById('sales-tab-floor');
            const dishesPane = document.getElementById('sales-pane-dishes');
            const floorPane = document.getElementById('sales-pane-floor');
            const on = ['bg-emerald-500', 'text-white'];
            const off = ['bg-[#2C2C2E]', 'text-gray-300'];
            [[dishesBtn, tab === 'dishes'], [floorBtn, tab === 'floor']].forEach(([b, active]) => {
                if (!b) return;
                b.classList.remove(...(active ? off : on));
                b.classList.add(...(active ? on : off));
            });
            if (dishesPane) dishesPane.classList.toggle('hidden', tab !== 'dishes');
            if (floorPane) floorPane.classList.toggle('hidden', tab !== 'floor');
            if (tab === 'floor') { renderFloorPlan(); if (typeof renderReservations === 'function') renderReservations(); }
        }

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
                const ring = occupied ? 'border-amber-400/90 shadow-amber-500/25' : 'border-white/15 shadow-black/40';
                const shape = tb.shape === 'square' ? 'rounded-[22%]' : 'rounded-full';
                const itemCount = tab ? Object.values(tab.items || {}).reduce((a, b) => a + b, 0) : 0;
                const px = tableSizePx(tb);
                const tabSum = occupied ? tableTabSum(tab) : 0;
                const elapsed = occupied ? tableElapsedMin(tab) : 0;
                const pillAbove = tb.y > 76;
                return `<div class="floor-table absolute select-none ${floorEditMode ? 'cursor-move' : 'cursor-pointer active:scale-95'} transition-transform"
                    data-id="${tb.id}" style="left:${tb.x}%; top:${tb.y}%; transform:translate(-50%,-50%); touch-action:none;"
                    ${floorEditMode ? `onpointerdown="tableDragStart(event, ${tb.id})" onclick="openTableEdit(${tb.id})"` : `onclick="openTableTab(${tb.id})"`}>
                    <div class="relative" style="width:${px}px; height:${px}px;">
                        <div class="${shape} w-full h-full bg-gradient-to-b from-[#3A3A3C] to-[#262628] border-2 ${ring} shadow-lg flex flex-col items-center justify-center pointer-events-none">
                            <div class="text-white font-semibold tracking-wide leading-none ${px >= 92 ? 'text-2xl' : px >= 72 ? 'text-xl' : 'text-lg'}">${escapeHtml(tb.name)}</div>
                            <div class="text-gray-500 ${px >= 72 ? 'text-[10px]' : 'text-[9px]'} mt-1 font-medium">${tb.seats} ${t('table_seats_short')}</div>
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
                e.preventDefault();
                floorZoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 0.87);
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
            openModal('table-edit-modal');
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
            if (editingTableId) {
                const tb = tablesDB.find(v => v.id === editingTableId);
                if (tb) { tb.name = name; tb.seats = seats; tb.shape = pendingTableShape; tb.size = pendingTableSize; }
            } else {
                tablesDB.push({ id: Date.now(), name, seats, shape: pendingTableShape, size: pendingTableSize, x: pendingTableXY ? Math.round(pendingTableXY.x * 10) / 10 : 50, y: pendingTableXY ? Math.round(pendingTableXY.y * 10) / 10 : 50 });
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
        // Посадить гостей: открыть пустой счёт = стол занят
        function seatTableGuests() {
            if (!activeTableId || tableTabFor(activeTableId)) return;
            const stb = tablesDB.find(v => v.id === activeTableId);
            const legacyAlg = (stb && stb.allergies) ? stb.allergies.slice() : [];
            if (stb) stb.allergies = [];
            tableTabsDB.push({ id: Date.now(), tableId: activeTableId, items: {}, sent: {}, ts: new Date().toISOString(), allergies: legacyAlg });
            activeTableTabId = tableTabsDB[tableTabsDB.length - 1].id;
            markDirty();
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
            if (!tab) {
                const title = document.getElementById('table-tab-title');
                if (title) title.textContent = (t('table_prefix') + ' ' + (tb ? tb.name : '')) + (tb ? ` · ${tb.seats} ${t('table_seats_short')}` : '');
                if (subEl) subEl.textContent = t('table_is_free');
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

        // Оплатить счёт: проводим продажу с привязкой к столику, закрываем счёт
        function payTableTab() {
            const tab = activeTab();
            if (!tab) return;
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

        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
