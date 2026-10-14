        // --- КАССА (v2.9): экран кассира ---
        let salesCart = {}; // id блюда -> кол-во порций (текущий чек)
        let posPayMethod = 'cash'; // 'cash' | 'card'
        // Ставка HST Онтарио для информационной строки «в т.ч. налог» (настройка ставки — со следующим шагом, HST-отчёт)
        const POS_TAX_RATE = 0.13;

        function openSalesModal() {
            salesCart = {};
            document.getElementById('sales-search').value = '';
            filterSalesList();
            updateSalesTotal();
            if (typeof floorEditMode !== 'undefined') floorEditMode = false;
            if (typeof switchSalesTab === 'function') switchSalesTab('dishes');
            const tn = document.getElementById('takeaway-name'); if (tn) tn.value = '';
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
            salesCart[id] = (salesCart[id] || 0) + 1;
            refreshSaleBadges();
            updateSalesTotal();
            if (navigator.vibrate) navigator.vibrate(10);
        }

        function untapSaleDish(e, id) {
            e.stopPropagation();
            if (salesCart[id]) {
                salesCart[id]--;
                if (salesCart[id] <= 0) delete salesCart[id];
                refreshSaleBadges();
                updateSalesTotal();
            }
        }

        function refreshSaleBadges() {
            const activeDishes = menuDB.filter(d => d.type === 'dish' && d.isTTKActive);
            activeDishes.forEach(d => {
                const qty = salesCart[d.id] || 0;
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

        function posTotals() {
            let subtotal = 0, count = 0;
            for (const id in salesCart) {
                const d = menuDB.find(x => x.id == id);
                if (d) { subtotal += (d.menuPrice || 0) * salesCart[id]; count += salesCart[id]; }
            }
            subtotal = Math.round(subtotal * 100) / 100;
            const pctEl = document.getElementById('pos-disc-pct');
            const amtEl = document.getElementById('pos-disc-amt');
            const pct = Math.min(100, Math.max(0, parseFloat(pctEl && pctEl.value) || 0));
            const amt = Math.max(0, parseFloat(amtEl && amtEl.value) || 0);
            let discount = Math.round(subtotal * pct / 100 * 100) / 100 + amt;
            discount = Math.min(discount, subtotal);
            discount = Math.round(discount * 100) / 100;
            const total = Math.round((subtotal - discount) * 100) / 100;
            const taxIncl = Math.round((total - total / (1 + POS_TAX_RATE)) * 100) / 100;
            return { subtotal, discount, total, count, taxIncl };
        }
        function updateSalesTotal() { renderTicket(); }
        function renderTicket() {
            const box = document.getElementById('pos-lines');
            if (!box) return;
            const tt = posTotals();
            const ids = Object.keys(salesCart);
            box.innerHTML = ids.length === 0
                ? `<p class="text-gray-600 text-xs text-center py-4">${t('pos_empty_ticket')}</p>`
                : ids.map(id => {
                    const d = menuDB.find(x => x.id == id);
                    if (!d) return '';
                    const q = salesCart[id];
                    const line = Math.round((d.menuPrice || 0) * q * 100) / 100;
                    return `<div class="flex items-center gap-2 bg-white/5 rounded-xl px-2 py-1.5">
                        <div class="flex-1 min-w-0"><div class="text-white text-xs font-medium truncate">${d.name}</div>
                        <div class="text-gray-500 text-[11px]">${currentCurrency}${d.menuPrice || 0}</div></div>
                        <div class="flex items-center gap-1">
                            <button onclick="posQty(${d.id},-1)" class="w-7 h-7 rounded-lg bg-black/50 text-white border border-white/15 active:scale-90">−</button>
                            <span class="w-6 text-center text-white text-sm font-bold">${q}</span>
                            <button onclick="posQty(${d.id},1)" class="w-7 h-7 rounded-lg bg-black/50 text-white border border-white/15 active:scale-90">+</button>
                        </div>
                        <div class="text-emerald-400 text-xs font-bold w-14 text-right">${currentCurrency}${line}</div>
                    </div>`;
                }).join('');
            document.getElementById('pos-subtotal').textContent = `${currentCurrency}${tt.subtotal}`;
            document.getElementById('pos-disc-line').textContent = `−${currentCurrency}${tt.discount}`;
            document.getElementById('pos-total').textContent = `${currentCurrency}${tt.total}`;
            document.getElementById('pos-tax').textContent = `${currentCurrency}${tt.taxIncl}`;
            const tendered = parseFloat(document.getElementById('pos-tendered').value) || 0;
            const change = posPayMethod === 'cash' ? Math.max(0, Math.round((tendered - tt.total) * 100) / 100) : 0;
            document.getElementById('pos-change').textContent = `${currentCurrency}${change}`;
            const btn = document.getElementById('pos-pay-btn');
            const ok = tt.count > 0 && (posPayMethod === 'card' || tendered >= tt.total);
            btn.classList.toggle('opacity-40', !ok);
            btn.classList.toggle('pointer-events-none', !ok);
            btn.querySelector('span').textContent = `${t('pos_pay')} ${currentCurrency}${tt.total}`;
        }
        function posQty(id, delta) {
            salesCart[id] = (salesCart[id] || 0) + delta;
            if (salesCart[id] <= 0) delete salesCart[id];
            refreshSaleBadges();
            renderTicket();
            if (navigator.vibrate) navigator.vibrate(10);
        }
        function posClear() {
            salesCart = {};
            document.getElementById('pos-disc-pct').value = 0;
            document.getElementById('pos-disc-amt').value = 0;
            document.getElementById('pos-tendered').value = '';
            refreshSaleBadges();
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
            const ids = Object.keys(salesCart);
            if (ids.length === 0) { showNotification(t('sales_empty')); return; }
            const tt = posTotals();
            const tendered = posPayMethod === 'cash' ? (parseFloat(document.getElementById('pos-tendered').value) || 0) : tt.total;
            if (posPayMethod === 'cash' && tendered < tt.total) { showNotification(t('pos_short')); return; }
            const change = posPayMethod === 'cash' ? Math.round((tendered - tt.total) * 100) / 100 : 0;
            const btn = event.currentTarget;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>`;
            btn.classList.add('pointer-events-none');

            setTimeout(() => {
                const nameEl = document.getElementById('takeaway-name');
                const customerName = nameEl ? nameEl.value.trim() : '';
                const pct = parseFloat(document.getElementById('pos-disc-pct').value) || 0;
                const amt = parseFloat(document.getElementById('pos-disc-amt').value) || 0;
                const receiptItems = ids.map(id => {
                    const d = menuDB.find(x => x.id == id);
                    return { id: Number(id), name: d ? d.name : '', qty: salesCart[id], price: d ? (d.menuPrice || 0) : 0 };
                });
                const receipt = {
                    id: Date.now(), ts: new Date().toISOString(), items: receiptItems,
                    subtotal: tt.subtotal, discountPct: pct, discountAmt: amt, total: tt.total,
                    payMethod: posPayMethod, tendered: Math.round(tendered * 100) / 100, change,
                    customerName, returned: 0
                };
                const totalSold = commitSale(salesCart, { takeaway: true, customerName, receipt });
                posClear();
                if (nameEl) nameEl.value = '';

                btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i> <span>${t('pos_success')}</span>`;
                setTimeout(() => {
                    closeModal('sales-modal');
                    showNotification(change > 0 ? `${t('pos_success')}. ${t('pos_change')}: ${currentCurrency}${change}` : `${t('pos_success')} (${totalSold})`);
                    setTimeout(() => { btn.innerHTML = originalHTML; renderTicket(); }, 500);
                }, 700);
            }, 400);
        }

        // Ядро проведения продажи (v2.3): финансы, склад, salesDB, KDS.
        // items: {dishId: qty}. opts: {tableId, tableName} — для продаж со столика.
        // Используют и быстрая касса, и счета столиков.
        function commitSale(items, opts) {
            opts = opts || {};
            const ids = Object.keys(items || {});
            let totalSold = 0; let sessionIncome = 0; let sessionCOGS = 0;

            ids.forEach(id => {
                const d = menuDB.find(x => x.id == id);
                const qty = items[id];
                if (!d || !qty) return;
                totalSold += qty;
                sessionIncome += (d.menuPrice || 0) * qty;
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
            ids.forEach(id => {
                const qty = items[id];
                if (qty > 0) salesDB[curMonth][id] = (salesDB[curMonth][id] || 0) + qty;
            });
            // Чеки кассы (v2.9): для возвратов, отчётов и HST
            if (opts && opts.receipt) {
                if (!receiptsDB[curMonth]) receiptsDB[curMonth] = [];
                receiptsDB[curMonth].unshift(opts.receipt);
            }
            // KDS (v2.2): кухонный тикет — кухня видит, что готовить (v2.3: с номером столика)
            const kdsItems = ids.map(id => { const d = menuDB.find(x => x.id == id); const q = items[id]; return (d && q > 0) ? { name: d.name, qty: q } : null; }).filter(Boolean);
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
            markDirty();
            return totalSold;
        }
