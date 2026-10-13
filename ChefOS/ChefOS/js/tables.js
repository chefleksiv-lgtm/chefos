        // --- ПЛАН ЗАЛА И СТОЛИКИ (v2.3) ---
        // tablesDB: [{id, name, seats, x, y (в % от плана), shape:'round'|'square'}]
        // tableTabsDB: [{id, tableId, items:{dishId:qty}, sent:{dishId:qty}, ts}]
        let floorEditMode = false;
        let activeTableTabId = null;
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
            if (tab === 'floor') renderFloorPlan();
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
            const plan = document.getElementById('floor-plan');
            if (!plan) return;
            if (!Array.isArray(tablesDB)) tablesDB = [];
            const isChef = (typeof currentAppRole !== 'undefined') && currentAppRole === 'chef';
            const editBtn = document.getElementById('floor-edit-btn');
            if (editBtn) editBtn.style.display = isChef ? '' : 'none';
            if (floorEditMode && !isChef) floorEditMode = false;

            plan.innerHTML = tablesDB.map(tb => {
                const tab = tableTabFor(tb.id);
                const occupied = !!tab;
                const ring = occupied ? 'border-amber-400 shadow-amber-500/20' : 'border-emerald-500/70 shadow-emerald-500/10';
                const shape = tb.shape === 'square' ? 'rounded-2xl' : 'rounded-full';
                const itemCount = tab ? Object.values(tab.items || {}).reduce((a, b) => a + b, 0) : 0;
                const px = tableSizePx(tb);
                const tabSum = occupied ? tableTabSum(tab) : 0;
                const elapsed = occupied ? tableElapsedMin(tab) : 0;
                return `<div class="floor-table absolute ${shape} bg-[#2C2C2E] border-2 ${ring} shadow-lg flex flex-col items-center justify-center select-none ${floorEditMode ? 'cursor-move' : 'cursor-pointer active:scale-95'} transition-transform"
                    data-id="${tb.id}" style="left:${tb.x}%; top:${tb.y}%; width:${px}px; height:${px}px; transform:translate(-50%,-50%); touch-action:none;"
                    ${floorEditMode ? `onpointerdown="tableDragStart(event, ${tb.id})" onclick="openTableEdit(${tb.id})"` : `onclick="openTableTab(${tb.id})"`}>
                    <div class="text-white font-bold ${px >= 92 ? 'text-xl' : 'text-lg'} leading-none pointer-events-none">${escapeHtml(tb.name)}</div>
                    <div class="text-gray-400 text-[10px] pointer-events-none">${tb.seats} ${t('table_seats_short')}</div>
                    ${occupied && !floorEditMode ? `<div class="text-amber-300 text-[11px] font-bold pointer-events-none">${currentCurrency}${tabSum}</div>
                    <div class="text-gray-500 text-[9px] pointer-events-none">${elapsed} ${t('table_min_short')}</div>` : ''}
                    ${occupied && !floorEditMode ? `<div class="absolute -top-2 -right-2 min-w-[24px] h-6 px-1 rounded-full bg-amber-400 text-black text-xs font-bold flex items-center justify-center pointer-events-none">${itemCount}</div>` : ''}
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
        }

        function toggleFloorEdit() {
            floorEditMode = !floorEditMode;
            renderFloorPlan();
        }

        function floorPlanClick(e) {
            if (!floorEditMode) return;
            if (e.target.closest('.floor-table')) return;
            const plan = document.getElementById('floor-plan');
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
            document.getElementById('table-edit-name').value = tb ? tb.name : String(tablesDB.length + 1);
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
            dragTableId = id; dragMoved = false;
            e.preventDefault();
            const move = (ev) => {
                if (dragTableId !== id) return;
                const plan = document.getElementById('floor-plan');
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
            document.addEventListener('touchmove', move, { passive: true });
            document.addEventListener('touchend', up);
        }

        // --- СЧЁТ СТОЛИКА ---
        function openTableTab(tableId) {
            const tb = tablesDB.find(v => v.id === tableId);
            if (!tb) return;
            let tab = tableTabFor(tableId);
            if (!tab) {
                tab = { id: Date.now(), tableId, items: {}, sent: {}, ts: new Date().toISOString() };
                tableTabsDB.push(tab);
                markDirty();
            }
            activeTableTabId = tab.id;
            tableDishQuery = '';
            const si = document.getElementById('table-tab-search');
            if (si) si.value = '';
            renderTableTab();
            renderFloorPlan();
            openModal('table-tab-modal');
        }
        function activeTab() {
            return (tableTabsDB || []).find(x => x.id === activeTableTabId) || null;
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
            if (!tab) return;
            const tb = tablesDB.find(v => v.id === tab.tableId);
            const title = document.getElementById('table-tab-title');
            if (title) title.textContent = (t('table_prefix') + ' ' + (tb ? tb.name : '')) + (tb ? ` · ${tb.seats} ${t('table_seats_short')}` : '');
            const sub = document.querySelector('#table-tab-modal [data-i18n="table_tab_subtitle"]');
            if (sub) sub.textContent = `${t('table_tab_subtitle')} · ${tableElapsedMin(tab)} ${t('table_min_short')}`;
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
            kdsDB.unshift({
                id: Date.now(), num, ts: new Date().toISOString(), table: tableName,
                items: fresh.map(id => { const d = menuDB.find(x => x.id == id); return { name: d ? d.name : '?', qty: tab.items[id] - (tab.sent[id] || 0) }; }),
                status: 'new'
            });
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
            commitSale(Object.assign({}, tab.items), { tableId: tab.tableId, tableName });
            const i = tableTabsDB.findIndex(x => x.id === tab.id);
            if (i >= 0) tableTabsDB.splice(i, 1);
            activeTableTabId = null;
            markDirty();
            closeModal('table-tab-modal');
            renderFloorPlan();
            showNotification(`${t('sales_success')}: ${tableName}`);
        }

        function closeTableTabModal() {
            activeTableTabId = null;
            closeModal('table-tab-modal');
            renderFloorPlan();
        }

        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
