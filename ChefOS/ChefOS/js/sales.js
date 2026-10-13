        // --- ВНЕСЕНИЕ ПРОДАЖ: карточки блюд, тап = +1 порция ---
        let salesCart = {}; // id блюда -> кол-во порций

        function openSalesModal() {
            salesCart = {};
            document.getElementById('sales-search').value = '';
            filterSalesList();
            updateSalesTotal();
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

        function deductFromInventory(ingredientName, weightStr, portionsStr) {
            let invItem = inventoryDB.find(i => i.name.toLowerCase() === ingredientName.toLowerCase());
            if (invItem) {
                let amount = parseFloat(weightStr);
                let portions = parseInt(portionsStr) || 1;
                if ((weightStr.includes('g') || weightStr.includes('г') || weightStr.includes('ml') || weightStr.includes('мл')) && (invItem.unit === 'кг' || invItem.unit === 'л' || invItem.unit === 'kg' || invItem.unit === 'l' || invItem.unit === 'L')) amount = amount / 1000;
                invItem.quantity -= (amount * portions);
                if(invItem.quantity < 0) invItem.quantity = 0;
            }
        }

        function processSales(event) {
            const btn = event.currentTarget;
            const ids = Object.keys(salesCart);
            if (ids.length === 0) { showNotification(t('sales_empty')); return; }
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> <span>${t('sales_processing')}</span>`;
            btn.classList.add('pointer-events-none');

            setTimeout(() => {
                let totalSold = 0; let sessionIncome = 0; let sessionCOGS = 0;

                ids.forEach(id => {
                    const d = menuDB.find(x => x.id == id);
                    const qty = salesCart[id];
                    if (!d || !qty) return;
                    totalSold += qty;
                    sessionIncome += (d.menuPrice || 0) * qty;
                    sessionCOGS += (d.costPrice || 0) * qty;
                    if (d.ingredients) d.ingredients.forEach(ing => deductFromInventory(ing.name, ing.weight, qty));
                    if (d.subRecipes) d.subRecipes.forEach(sub => {
                        if (sub.ingredients) sub.ingredients.forEach(subIng => {
                            let parts = subIng.trim().split(' ');
                            if (parts.length >= 2) {
                                let weightStr = parts.pop();
                                let name = parts.join(' ');
                                deductFromInventory(name, weightStr, qty);
                            }
                        });
                    });
                });

                const curMonth = getCurrentMonthKey();
                if (!financeDB[curMonth]) financeDB[curMonth] = { income: 0, cogs: 0, payroll: 0, losses: 0 };
                financeDB[curMonth].income += sessionIncome;
                financeDB[curMonth].cogs += sessionCOGS;
                // Продажи по блюдам для ABC-аналитики (v1.7)
                if (!salesDB[curMonth]) salesDB[curMonth] = {};
                ids.forEach(id => {
                    const qty = salesCart[id];
                    if (qty > 0) salesDB[curMonth][id] = (salesDB[curMonth][id] || 0) + qty;
                });
                markDirty();

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
                        salesCart = {};
                    }, 500);
                }, 800);
            }, 600);
        }
