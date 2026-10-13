        // --- ВНЕСЕНИЕ ПРОДАЖ: карточки блюд, тап = +1 порция ---
        let salesCart = {}; // id блюда -> кол-во порций

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

        function updateSalesTotal() {
            let total = 0, count = 0;
            for (const id in salesCart) {
                const d = menuDB.find(x => x.id == id);
                if (d) { total += (d.menuPrice || 0) * salesCart[id]; count += salesCart[id]; }
            }
            document.getElementById('sales-total-value').textContent = `${currentCurrency}${total}`;
            document.getElementById('sales-total-count').textContent = count > 0 ? `${count} ${t('unit_pcs')}` : '';
            const btn = document.getElementById('sales-pay-btn');
            if (btn) {
                btn.classList.toggle('opacity-40', count === 0);
                btn.classList.toggle('pointer-events-none', count === 0);
            }
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
            const btn = event.currentTarget;
            const ids = Object.keys(salesCart);
            if (ids.length === 0) { showNotification(t('sales_empty')); return; }
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> <span>${t('sales_processing')}</span>`;
            btn.classList.add('pointer-events-none');

            setTimeout(() => {
                const nameEl = document.getElementById('takeaway-name');
                const customerName = nameEl ? nameEl.value.trim() : '';
                const totalSold = commitSale(salesCart, { takeaway: true, customerName });
                salesCart = {};
                if (nameEl) nameEl.value = '';

                btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i> <span>${t('sales_success')}</span>`;
                btn.classList.replace('bg-emerald-500', 'bg-green-500');

                setTimeout(() => {
                    closeModal('sales-modal');
                    if (totalSold > 0) showNotification(`${t('sales_success')} (${totalSold})`);
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.classList.remove('pointer-events-none');
                        btn.classList.replace('bg-green-500', 'bg-emerald-500');
                        document.getElementById('sales-list').innerHTML = '';
                    }, 500);
                }, 800);
            }, 600);
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

            const curMonth = getCurrentMonthKey();
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
            // KDS (v2.2): кухонный тикет — кухня видит, что готовить (v2.3: с номером столика)
            const kdsItems = ids.map(id => { const d = menuDB.find(x => x.id == id); const q = items[id]; return (d && q > 0) ? { name: d.name, qty: q } : null; }).filter(Boolean);
            if (kdsItems.length) {
                if (!Array.isArray(kdsDB)) kdsDB = [];
                const todayKey = new Date().toISOString().slice(0, 10);
                const num = kdsDB.filter(x => (x.ts || '').slice(0, 10) === todayKey).length + 1;
                const ticket = { id: Date.now(), num, ts: new Date().toISOString(), items: kdsItems, status: 'new' };
                if (opts.tableName) ticket.table = opts.tableName;
                if (opts.takeaway) { ticket.takeaway = true; if (opts.customerName) ticket.customer = opts.customerName; }
                kdsDB.unshift(ticket);
            }
            markDirty();
            return totalSold;
        }
