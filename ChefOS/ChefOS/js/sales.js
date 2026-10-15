        // --- КАССА (v2.9): экран кассира ---
        let posTicket = []; // [{key, dishId, qty, mods:[{id,name,price}]}] — строки чека
        let posPayMethod = 'cash'; // 'cash' | 'card'
        // Контекст оплаты столика: кассир пробивает счёт стола через полную кассу
        // (скидки, чаевые, способ оплаты, чек). null — обычный заказ на вынос.
        let posTableCtx = null; // {tabId, tableId, tableName, allergies}
        let modDishId = null; // блюдо, для которого выбираем модификаторы
        // Ставка налога из настроек (HST Онтарио по умолчанию) — для строки «в т.ч. налог»
        function posTaxRate() { return (typeof taxRate === 'number' ? taxRate : 13) / 100; }

        function openSalesModal() {
            posTicket = [];
            posTableCtx = null;
            posRenderTableCtx();
            document.getElementById('sales-search').value = '';
            filterSalesList();
            updateSalesTotal();
            if (typeof floorEditMode !== 'undefined') floorEditMode = false;
            togglePosFloor(false);
            renderPosCtx();
            openModal('sales-modal');
        }

        function filterSalesList() {
            const list = document.getElementById('sales-list');
            const q = document.getElementById('sales-search') ? document.getElementById('sales-search').value.toLowerCase() : '';
            if (list.innerHTML === '') {
                const activeDishes = menuDB.filter(d => d.type === 'dish' && d.isTTKActive);
                if (activeDishes.length === 0) {
                    list.innerHTML = `<p class="text-gray-500 text-sm text-center col-span-3">${t('sales_no_dishes')}</p>`;
                } else {
                    list.innerHTML = activeDishes.map(d => `
                        <div class="sale-card relative rounded-2xl overflow-hidden bg-black/40 border border-white/5 cursor-pointer active:scale-95 transition-transform select-none" data-name="${d.name.toLowerCase()}" onclick="tapSaleDish(${d.id})">
                            <img src="${d.img || ''}" alt="" loading="lazy" onerror="this.style.display='none'" class="w-full h-20 sm:h-24 object-cover pointer-events-none">
                            <div class="p-2 pointer-events-none">
                                <div class="text-white text-[11px] font-medium leading-tight min-h-[28px]">${d.name}</div>
                                <div class="text-emerald-400 text-xs font-bold mt-1">${currentCurrency}${d.menuPrice || 0}</div>
                            </div>
                            <div id="sale-badge-${d.id}" class="hidden absolute top-1.5 right-1.5 min-w-[28px] h-7 px-1.5 rounded-full bg-emerald-500 text-white text-sm font-bold items-center justify-center shadow-lg pointer-events-none">×1</div>
                            <button onclick="untapSaleDish(event, ${d.id})" id="sale-minus-${d.id}" class="hidden absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white text-lg leading-none border border-white/20 active:scale-90">−</button>
                        </div>
                    `).join('');
                }
            }
            document.querySelectorAll('.sale-card').forEach(card => {
                card.style.display = (q === '' || card.dataset.name.includes(q)) ? 'block' : 'none';
            });
            refreshSaleBadges();
        }

        function tapSaleDish(id) {
            const d = menuDB.find(x => x.id == id);
            if (d && d.modifiers && d.modifiers.length) { openModModal(id); return; }
            posAddLine(id, []);
        }
        function posAddLine(dishId, mods) {
            const key = dishId + '|' + mods.map(m => m.id).sort((a, b) => a - b).join(',');
            const line = posTicket.find(l => l.key === key);
            if (line) line.qty++;
            else posTicket.push({ key, dishId, qty: 1, mods: mods.slice() });
            refreshSaleBadges();
            renderTicket();
            if (navigator.vibrate) navigator.vibrate(10);
        }
        // Модалка выбора модификаторов (v2.9)
        function openModModal(id) {
            modDishId = id;
            const d = menuDB.find(x => x.id == id);
            document.getElementById('mod-modal-title').textContent = d ? d.name : '';
            document.getElementById('mod-modal-list').innerHTML = (d.modifiers || []).map(m => `
                <label class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 cursor-pointer active:scale-[0.98]">
                    <input type="checkbox" data-mod-id="${m.id}" class="w-5 h-5 accent-emerald-500 shrink-0">
                    <span class="flex-1 text-white text-sm">${m.name}</span>
                    <span class="text-emerald-400 text-sm font-bold">+${currentCurrency}${m.price || 0}</span>
                </label>`).join('');
            openModal('mod-modal');
        }
        function confirmModAdd() {
            const d = menuDB.find(x => x.id == modDishId);
            const sel = [];
            document.querySelectorAll('#mod-modal-list input[type=checkbox]:checked').forEach(cb => {
                const m = (d.modifiers || []).find(x => String(x.id) === cb.dataset.modId);
                if (m) sel.push({ id: m.id, name: m.name, price: m.price || 0 });
            });
            closeModal('mod-modal');
            posAddLine(modDishId, sel);
        }

        function untapSaleDish(e, id) {
            e.stopPropagation();
            for (let i = posTicket.length - 1; i >= 0; i--) {
                if (String(posTicket[i].dishId) === String(id)) {
                    posTicket[i].qty--;
                    if (posTicket[i].qty <= 0) posTicket.splice(i, 1);
                    break;
                }
            }
            refreshSaleBadges();
            renderTicket();
        }

        function refreshSaleBadges() {
            const activeDishes = menuDB.filter(d => d.type === 'dish' && d.isTTKActive);
            activeDishes.forEach(d => {
                const qty = posTicket.filter(l => String(l.dishId) === String(d.id)).reduce((s, l) => s + l.qty, 0);
                const badge = document.getElementById(`sale-badge-${d.id}`);
                const minus = document.getElementById(`sale-minus-${d.id}`);
                if (badge) {
                    badge.textContent = '×' + qty;
                    badge.classList.toggle('hidden', qty === 0);
                    badge.classList.toggle('flex', qty > 0);
                }
                if (minus) minus.classList.toggle('hidden', qty === 0);
            });
        }

        function posLinePrice(line) {
            const d = menuDB.find(x => x.id == line.dishId);
            const mods = (line.mods || []).reduce((s, m) => s + (m.price || 0), 0);
            return Math.round(((d ? (d.menuPrice || 0) : 0) + mods) * 100) / 100;
        }
        function posTotals() {
            let subtotal = 0, count = 0;
            posTicket.forEach(l => { subtotal += posLinePrice(l) * l.qty; count += l.qty; });
            subtotal = Math.round(subtotal * 100) / 100;
            const pctEl = document.getElementById('pos-disc-pct');
            const amtEl = document.getElementById('pos-disc-amt');
            const pct = Math.min(100, Math.max(0, parseFloat(pctEl && pctEl.value) || 0));
            const amt = Math.max(0, parseFloat(amtEl && amtEl.value) || 0);
            let discount = Math.round(subtotal * pct / 100 * 100) / 100 + amt;
            discount = Math.min(discount, subtotal);
            discount = Math.round(discount * 100) / 100;
            const total = Math.round((subtotal - discount) * 100) / 100;
            const taxIncl = Math.round((total - total / (1 + posTaxRate())) * 100) / 100;
            return { subtotal, discount, total, count, taxIncl };
        }
        function updateSalesTotal() { renderTicket(); }
        function renderTicket() {
            const box = document.getElementById('pos-lines');
            if (!box) return;
            const tt = posTotals();
            box.innerHTML = posTicket.length === 0
                ? `<p class="text-gray-600 text-xs text-center py-4">${t('pos_empty_ticket')}</p>`
                : posTicket.map(l => {
                    const d = menuDB.find(x => x.id == l.dishId);
                    if (!d) return '';
                    const unit = posLinePrice(l);
                    const line = Math.round(unit * l.qty * 100) / 100;
                    const modNames = (l.mods || []).map(m => m.name).join(', ');
                    return `<div class="flex items-center gap-2 bg-white/5 rounded-xl px-2 py-1.5">
                        <div class="flex-1 min-w-0"><div class="text-white text-xs font-medium truncate">${d.name}</div>
                        ${modNames ? `<div class="text-amber-400/80 text-[10px] truncate">+ ${modNames}</div>` : ''}
                        <div class="text-gray-500 text-[11px]">${currentCurrency}${unit}</div></div>
                        <div class="flex items-center gap-1">
                            <button onclick="posQty('${l.key}',-1)" class="w-7 h-7 rounded-lg bg-black/50 text-white border border-white/15 active:scale-90">−</button>
                            <span class="w-6 text-center text-white text-sm font-bold">${l.qty}</span>
                            <button onclick="posQty('${l.key}',1)" class="w-7 h-7 rounded-lg bg-black/50 text-white border border-white/15 active:scale-90">+</button>
                        </div>
                        <div class="text-emerald-400 text-xs font-bold w-14 text-right">${currentCurrency}${line}</div>
                    </div>`;
                }).join('');
            document.getElementById('pos-subtotal').textContent = `${currentCurrency}${tt.subtotal}`;
            document.getElementById('pos-disc-line').textContent = `−${currentCurrency}${tt.discount}`;
            document.getElementById('pos-total').textContent = `${currentCurrency}${tt.total}`;
            document.getElementById('pos-tax').textContent = `${currentCurrency}${tt.taxIncl}`;
            const taxLbl = document.querySelector('[data-i18n="pos_tax_incl"]');
            if (taxLbl) taxLbl.textContent = `${t('pos_tax_incl_short')} ${(typeof taxRate === 'number' ? taxRate : 13)}%`;
            const tendered = parseFloat(document.getElementById('pos-tendered').value) || 0;
            const change = posPayMethod === 'cash' ? Math.max(0, Math.round((tendered - tt.total) * 100) / 100) : 0;
            document.getElementById('pos-change').textContent = `${currentCurrency}${change}`;
            const btn = document.getElementById('pos-pay-btn');
            const ok = tt.count > 0 && (posPayMethod === 'card' || tendered >= tt.total);
            btn.classList.toggle('opacity-40', !ok);
            btn.classList.toggle('pointer-events-none', !ok);
            // Во время оплаты кнопка показывает спиннер без <span> — не падаем.
            const btnLabel = btn.querySelector('span');
            if (btnLabel) btnLabel.textContent = `${t('pos_pay')} ${currentCurrency}${tt.total}`;
            // Плашка корзины на главном экране кассы
            const cartbar = document.getElementById('pos-cartbar');
            if (cartbar) {
                cartbar.classList.toggle('hidden', tt.count === 0);
                const lbl = document.getElementById('pos-cartbar-label');
                if (lbl) lbl.textContent = `${t('pos_ticket')} • ${tt.count} • ${currentCurrency}${tt.total}`;
            }
        }
        // Оплата — отдельным всплывающим окном
        function openPayModal() {
            if (!posTicket.length) return;
            const sub = document.getElementById('pay-modal-sub');
            if (sub) sub.textContent = posTableCtx ? `${t('table_prefix')} ${posTableCtx.tableName}` : t('takeaway_tag');
            renderTicket();
            openModal('pay-modal');
        }
        function posQty(key, delta) {
            const l = posTicket.find(x => x.key === key);
            if (!l) return;
            l.qty += delta;
            if (l.qty <= 0) posTicket.splice(posTicket.indexOf(l), 1);
            refreshSaleBadges();
            renderTicket();
            if (navigator.vibrate) navigator.vibrate(10);
        }
        function posClear() {
            posTicket = [];
            posTableCtx = null;
            posRenderTableCtx();
            document.getElementById('pos-disc-pct').value = 0;
            document.getElementById('pos-disc-amt').value = 0;
            document.getElementById('pos-tendered').value = '';
            refreshSaleBadges();
            renderTicket();
            if (typeof renderPosCtx === 'function') renderPosCtx();
        }
        // Единая касса: строка контекста «На вынос / Столы / План зала» вместо вкладок
        function renderPosCtx() {
            const row = document.getElementById('pos-ctx-row');
            if (!row) return;
            const tabs = (typeof tableTabsDB !== 'undefined' && Array.isArray(tableTabsDB)) ? tableTabsDB : [];
            const tables = (typeof tablesDB !== 'undefined' && Array.isArray(tablesDB)) ? tablesDB : [];
            const chips = [];
            tables.forEach(tb => {
                const tab = tabs.find(x => x.tableId === tb.id);
                const occupied = !!tab;
                const isLoaded = !!(posTableCtx && tab && posTableCtx.tabId === tab.id);
                const sum = (occupied && typeof tableTabSum === 'function') ? tableTabSum(tab) : 0;
                const cls = isLoaded ? 'bg-emerald-500 text-white border-emerald-500'
                    : occupied ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
                    : 'bg-[#2C2C2E] text-gray-300 border-white/10';
                chips.push(`<button onclick="posCtxTable(${tb.id})" class="shrink-0 h-10 px-4 rounded-xl text-sm font-medium transition-colors border ${cls}"><i class="fa-solid fa-chair mr-2"></i><span>${t('table_prefix')} ${tb.name}</span>${occupied ? ` <span class="opacity-80">• ${currentCurrency}${sum}</span>` : ''}</button>`);
            });
            const wrap = document.getElementById('pos-floor-wrap');
            const floorOpen = wrap && !wrap.classList.contains('hidden');
            chips.push(`<button onclick="togglePosFloor()" class="shrink-0 h-10 px-4 rounded-xl text-sm font-medium transition-colors ${floorOpen ? 'bg-purple-500 text-white' : 'bg-[#2C2C2E] text-gray-300'}"><i class="fa-solid fa-map mr-2"></i><span>${t('pos_floor_plan')}</span></button>`);
            row.innerHTML = chips.join('');
        }
        function posCtxTable(tableId) {
            // повторный тап по загруженному столу — выгрузить (режим выноса)
            if (posTableCtx && posTableCtx.tableId === tableId) {
                posClear();
                return;
            }
            const tabs = (typeof tableTabsDB !== 'undefined' && Array.isArray(tableTabsDB)) ? tableTabsDB : [];
            const tab = tabs.find(x => x.tableId === tableId);
            if (tab) {
                const count = Object.keys(tab.items || {}).reduce((s, id) => s + (tab.items[id] || 0), 0);
                if (count > 0) { posLoadTableTab(tab.id); renderPosCtx(); return; }
            }
            if (typeof openTableTab === 'function') openTableTab(tableId);
            renderPosCtx();
        }
        function togglePosFloor(force) {
            const wrap = document.getElementById('pos-floor-wrap');
            if (!wrap) return;
            const show = (typeof force === 'boolean') ? force : wrap.classList.contains('hidden');
            wrap.classList.toggle('hidden', !show);
            if (show) {
                if (typeof renderFloorPlan === 'function') renderFloorPlan();
                if (typeof renderReservations === 'function') renderReservations();
            }
            renderPosCtx();
        }
        // Плашка «Стол N» в чеке кассира
        function posRenderTableCtx() {
            const chip = document.getElementById('pos-table-chip');
            if (!chip) return;
            if (posTableCtx) {
                chip.classList.remove('hidden');
                const s = chip.querySelector('span');
                if (s) s.textContent = posTableCtx.tableName;
            } else {
                chip.classList.add('hidden');
            }
        }
        // Загрузить счёт столика в кассу: скидки, чаевые, способ оплаты — как на вынос
        function posLoadTableTab(tabId) {
            const tabs = (typeof tableTabsDB !== 'undefined' && Array.isArray(tableTabsDB)) ? tableTabsDB : [];
            const tab = tabs.find(x => x.id === tabId);
            if (!tab) return;
            const items = tab.items || {};
            const count = Object.keys(items).reduce((s, id) => s + (items[id] || 0), 0);
            if (!count) { showNotification(t('sales_empty')); return; }
            const tb = (typeof tablesDB !== 'undefined' ? tablesDB : []).find(v => v.id === tab.tableId);
            const tableName = t('table_prefix') + ' ' + (tb ? tb.name : '');
            if (typeof closeTableTabModal === 'function') closeTableTabModal();
            openSalesModal();
            const stamp = Date.now();
            posTicket = Object.keys(items).map(id => ({ key: 'tbl' + id + '_' + stamp, dishId: Number(id), qty: items[id], mods: [] }));
            posTableCtx = { tabId: tab.id, tableId: tab.tableId, tableName, allergies: Array.isArray(tab.allergies) ? tab.allergies.slice() : [] };
            posRenderTableCtx();
            renderTicket();
        }
        function posDiscInput() { renderTicket(); }
        function posTenderedInput() { renderTicket(); }
        function posQuickCash(v) {
            const el = document.getElementById('pos-tendered');
            el.value = (parseFloat(el.value) || 0) + v;
            renderTicket();
        }
        function posExact() {
            document.getElementById('pos-tendered').value = posTotals().total;
            renderTicket();
        }
        function posSetPay(m) {
            posPayMethod = m;
            const cash = document.getElementById('pos-pay-cash');
            const card = document.getElementById('pos-pay-card');
            cash.className = 'h-11 rounded-xl text-sm font-semibold ' + (m === 'cash' ? 'bg-emerald-500 text-white' : 'bg-[#2C2C2E] text-gray-300 border border-white/10');
            card.className = 'h-11 rounded-xl text-sm font-semibold ' + (m === 'card' ? 'bg-emerald-500 text-white' : 'bg-[#2C2C2E] text-gray-300 border border-white/10');
            document.getElementById('pos-cash-block').style.display = m === 'cash' ? '' : 'none';
            renderTicket();
        }

        // Списание ингредиента со склада при продаже.
        // Было два бага, из-за которых цифры не сходились:
        // 1) '1kg'/'1 кг' при единице склада «кг»: 'kg'.includes('g') === true — делило на 1000, списывало в 1000 раз меньше.
        // 2) вес «по вкусу» давал NaN — quantity склада превращалось в NaN и портило стоимость запасов.
        // Теперь: честный разбор «100g» / «1,5 кг» / «2 шт» / «2» (без единиц — в единицах склада),
        // конверсия через convertQty; не распарсилось или несовместимые единицы — склад не трогаем.
        // v2.2: чистый парсер «имя + вес → количество в единицах склада» (на 1 порцию).
        // Используется и списанием при продаже, и прогнозом спроса.
        function parseIngredientAmount(ingredientName, weightStr) {
            const invItem = (typeof findInventoryByName === 'function')
                ? findInventoryByName(ingredientName)
                : (inventoryDB || []).find(i => String(i.name || '').toLowerCase() === String(ingredientName || '').toLowerCase());
            if (!invItem) return null;
            const m = String(weightStr || '').trim().match(/^([\d.,]+)\s*([a-zA-Zа-яА-Я]*)$/);
            if (!m) return null;
            const qty = parseFloat(m[1].replace(',', '.'));
            if (!(qty >= 0)) return null;
            let inInvUnit;
            if (!m[2]) {
                const invU = (typeof normUnit === 'function') ? normUnit(invItem.unit) : String(invItem.unit || '').toLowerCase();
                const asUnit = (invU === 'pcs') ? 'pcs' : 'g';
                if (typeof convertQty === 'function') {
                    const c = convertQty(qty, asUnit, invItem.unit);
                    if (c === null || !(c >= 0)) return null;
                    inInvUnit = c;
                } else {
                    inInvUnit = (asUnit === 'pcs') ? qty : qty / 1000;
                }
            } else if (typeof convertQty === 'function') {
                const c = convertQty(qty, m[2], invItem.unit);
                if (c === null || !(c >= 0)) return null;
                inInvUnit = c;
            } else {
                inInvUnit = qty;
            }
            return { item: invItem, amount: inInvUnit };
        }
        function deductFromInventory(ingredientName, weightStr, portionsStr) {
            const r = parseIngredientAmount(ingredientName, weightStr);
            if (!r) return;
            const portions = parseInt(portionsStr) || 1;
            r.item.quantity = Math.round((r.item.quantity - r.amount * portions) * 1000) / 1000;
            if (r.item.quantity < 0) r.item.quantity = 0;
        }

        function processSales(event) {
            if (posTicket.length === 0) { showNotification(t('sales_empty')); return; }
            const tt = posTotals();
            const tendered = posPayMethod === 'cash' ? (parseFloat(document.getElementById('pos-tendered').value) || 0) : tt.total;
            if (posPayMethod === 'cash' && tendered < tt.total) { showNotification(t('pos_short')); return; }
            const change = posPayMethod === 'cash' ? Math.round((tendered - tt.total) * 100) / 100 : 0;
            const btn = event.currentTarget;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>`;
            btn.classList.add('pointer-events-none');

            setTimeout(() => {
                try {
                const pct = parseFloat(document.getElementById('pos-disc-pct').value) || 0;
                const amt = parseFloat(document.getElementById('pos-disc-amt').value) || 0;
                const tableCtx = posTableCtx;
                const customerName = '';
                const receiptItems = posTicket.map(l => {
                    const d = menuDB.find(x => x.id == l.dishId);
                    return { id: Number(l.dishId), name: d ? d.name : '', qty: l.qty, price: posLinePrice(l), mods: (l.mods || []).map(m => ({ name: m.name, price: m.price })) };
                });
                const receipt = {
                    id: Date.now(), ts: new Date().toISOString(), items: receiptItems,
                    subtotal: tt.subtotal, discountPct: pct, discountAmt: amt, total: tt.total,
                    payMethod: posPayMethod, tendered: Math.round(tendered * 100) / 100, change,
                    customerName, tableName: tableCtx ? tableCtx.tableName : null, returned: 0
                };
                const saleOpts = tableCtx
                    ? { tableId: tableCtx.tableId, tableName: tableCtx.tableName, allergies: tableCtx.allergies, receipt }
                    : { takeaway: true, customerName, receipt };
                const totalSold = commitSale(posTicket, saleOpts);
                posClear();
                // Счёт стола закрываем сразу (не ждём анимацию кнопки),
                // чтобы план зала и тосты не гонялись за задержкой.
                if (tableCtx && typeof tableTabsDB !== 'undefined') {
                    const ti = tableTabsDB.findIndex(x => x.id === tableCtx.tabId);
                    if (ti >= 0) tableTabsDB.splice(ti, 1);
                    markDirty();
                    renderPosCtx();
                }

                btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i> <span>${t('pos_success')}</span>`;
                setTimeout(() => {
                    closeModal('pay-modal');
                    if (tableCtx && typeof renderFloorPlan === 'function') renderFloorPlan();
                    const okMsg = tableCtx ? `${t('pos_success')}: ${tableCtx.tableName}` : (change > 0 ? `${t('pos_success')}. ${t('pos_change')}: ${currentCurrency}${change}` : `${t('pos_success')} (${totalSold})`);
                    showNotification(okMsg);
                    setTimeout(() => { btn.innerHTML = originalHTML; renderTicket(); }, 500);
                }, 700);
                } catch (err) {
                    console.error('[ChefOS] processSales failed:', err);
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('pointer-events-none');
                    renderTicket();
                    showNotification(t('pos_error'));
                }
            }, 400);
        }

        // Ядро проведения продажи (v2.3, v2.9): финансы, склад, salesDB, KDS, чеки.
        // lines: [{id|dishId, qty, mods?}]. opts: {tableId, tableName} — для продаж со столика.
        // Используют касса и счета столиков.
        function commitSale(lines, opts) {
            opts = opts || {};
            // Обратная совместимость: {dishId: qty}
            if (lines && !Array.isArray(lines)) lines = Object.keys(lines).map(id => ({ id: Number(id), qty: lines[id], mods: [] }));
            lines = (lines || []).map(l => ({ id: l.id !== undefined ? l.id : l.dishId, qty: l.qty, mods: l.mods || [] }));
            let totalSold = 0; let sessionIncome = 0; let sessionCOGS = 0;

            lines.forEach(line => {
                const d = menuDB.find(x => x.id == line.id);
                const qty = line.qty;
                if (!d || !qty) return;
                const modsPrice = (line.mods || []).reduce((s, m) => s + (m.price || 0), 0);
                const unitPrice = (d.menuPrice || 0) + modsPrice;
                totalSold += qty;
                sessionIncome += unitPrice * qty;
                sessionCOGS += (d.costPrice || 0) * qty;
                if (d.ingredients) d.ingredients.forEach(ing => deductFromInventory(ing.name, ing.weight, qty));
                if (d.subRecipes) d.subRecipes.forEach(sub => {
                    if (sub.ingredients) sub.ingredients.forEach(subIng => {
                        const p = (typeof parseSubIngredient === 'function') ? parseSubIngredient(subIng) : null;
                        if (p && p.name && p.qty > 0) {
                            deductFromInventory(p.name, p.qty + p.unit, qty);
                        } else if (!p) {
                            const parts = String(subIng).trim().split(' ');
                            if (parts.length >= 2) deductFromInventory(parts.slice(0, -1).join(' '), parts[parts.length - 1], qty);
                        }
                    });
                });
            });

            const curMonth = (opts && opts.monthKey) || getCurrentMonthKey();
            if (!financeDB[curMonth]) financeDB[curMonth] = { income: 0, cogs: 0, payroll: 0, losses: 0 };
            // Округление до центов на уровне итога месяца — иначе float-дрейф (0.1+0.2)
            // накапливается и цифры перестают сходиться с чеками.
            financeDB[curMonth].income = Math.round((financeDB[curMonth].income + sessionIncome) * 100) / 100;
            financeDB[curMonth].cogs = Math.round((financeDB[curMonth].cogs + sessionCOGS) * 100) / 100;
            // Продажи по блюдам для ABC-аналитики (v1.7)
            if (!salesDB[curMonth]) salesDB[curMonth] = {};
            lines.forEach(line => {
                if (line.qty > 0) salesDB[curMonth][line.id] = (salesDB[curMonth][line.id] || 0) + line.qty;
            });
            // Чеки кассы (v2.9): для возвратов, отчётов и HST
            if (opts && opts.receipt) {
                if (!receiptsDB[curMonth]) receiptsDB[curMonth] = [];
                receiptsDB[curMonth].unshift(opts.receipt);
            }
            // KDS (v2.2): кухонный тикет — кухня видит, что готовить (v2.3: с номером столика)
            const kdsItems = lines.map(line => {
                const d = menuDB.find(x => x.id == line.id);
                if (!d || !(line.qty > 0)) return null;
                const modNames = (line.mods || []).map(m => m.name).join(', ');
                return { name: d.name + (modNames ? ' (+' + modNames + ')' : ''), qty: line.qty };
            }).filter(Boolean);
            if (kdsItems.length && !(opts && opts.skipKds)) {
                if (!Array.isArray(kdsDB)) kdsDB = [];
                const todayKey = new Date().toISOString().slice(0, 10);
                const num = kdsDB.filter(x => (x.ts || '').slice(0, 10) === todayKey).length + 1;
                const ticket = { id: Date.now(), num, ts: new Date().toISOString(), items: kdsItems, status: 'new' };
                if (opts.tableName) ticket.table = opts.tableName;
                if (opts.takeaway) { ticket.takeaway = true; if (opts.customerName) ticket.customer = opts.customerName; }
                if (opts.allergies && opts.allergies.length) ticket.allergies = opts.allergies.slice();
                kdsDB.unshift(ticket);
            }
            if (typeof checkLowStockAlerts === 'function') checkLowStockAlerts();
            markDirty();
            return totalSold;
        }
