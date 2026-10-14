        // --- КАССА (v2.9): экран кассира ---
        let posTicket = []; // [{key, dishId, qty, mods:[{id,name,price}]}] — строки чека
        let posPayMethod = 'cash'; // 'cash' | 'card'
        let modDishId = null; // блюдо, для которого выбираем модификаторы
        // Ставка HST Онтарио для информационной строки «в т.ч. налог» (настройка ставки — со следующим шагом, HST-отчёт)
        const POS_TAX_RATE = 0.13;

        function openSalesModal() {
            posTicket = [];
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
            const taxIncl = Math.round((total - total / (1 + POS_TAX_RATE)) * 100) / 100;
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
            const tendered = parseFloat(document.getElementById('pos-tendered').value) || 0;
            const change = posPayMethod === 'cash' ? Math.max(0, Math.round((tendered - tt.total) * 100) / 100) : 0;
            document.getElementById('pos-change').textContent = `${currentCurrency}${change}`;
            const btn = document.getElementById('pos-pay-btn');
            const ok = tt.count > 0 && (posPayMethod === 'card' || tendered >= tt.total);
            btn.classList.toggle('opacity-40', !ok);
            btn.classList.toggle('pointer-events-none', !ok);
            btn.querySelector('span').textContent = `${t('pos_pay')} ${currentCurrency}${tt.total}`;
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
                const nameEl = document.getElementById('takeaway-name');
                const customerName = nameEl ? nameEl.value.trim() : '';
                const pct = parseFloat(document.getElementById('pos-disc-pct').value) || 0;
                const amt = parseFloat(document.getElementById('pos-disc-amt').value) || 0;
                const receiptItems = posTicket.map(l => {
                    const d = menuDB.find(x => x.id == l.dishId);
                    return { id: Number(l.dishId), name: d ? d.name : '', qty: l.qty, price: posLinePrice(l), mods: (l.mods || []).map(m => ({ name: m.name, price: m.price })) };
                });
                const receipt = {
                    id: Date.now(), ts: new Date().toISOString(), items: receiptItems,
                    subtotal: tt.subtotal, discountPct: pct, discountAmt: amt, total: tt.total,
                    payMethod: posPayMethod, tendered: Math.round(tendered * 100) / 100, change,
                    customerName, returned: 0
                };
                const totalSold = commitSale(posTicket, { takeaway: true, customerName, receipt });
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
            markDirty();
            return totalSold;
        }
