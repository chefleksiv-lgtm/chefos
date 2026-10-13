        // --- ЗАКАЗЫ ПОСТАВЩИКАМ (v1.7, лайт) ---
        // Позиции с minQty > 0 и остатком <= minQty попадают в автозаказ.

        function lowStockItems() {
            return inventoryDB.filter(i => (i.minQty || 0) > 0 && (i.quantity || 0) <= i.minQty && i.supplier);
        }
        function suggestedOrderQty(i) {
            return Math.max(0, Math.ceil((i.minQty * 2 - (i.quantity || 0)) * 100) / 100);
        }

        function generateOrders() {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const low = lowStockItems();
            if (!low.length) { showNotification(t('orders_nothing')); return; }
            const bySupplier = {};
            low.forEach(i => { (bySupplier[i.supplier] = bySupplier[i.supplier] || []).push(i); });
            let created = 0;
            Object.keys(bySupplier).forEach(sup => {
                const items = bySupplier[sup]
                    .map(i => ({ name: i.name, qty: suggestedOrderQty(i), unit: i.unit }))
                    .filter(x => x.qty > 0);
                if (!items.length) return;
                const open = ordersDB.find(o => o.supplier === sup && o.status === 'new');
                if (open) open.items = items;
                else { ordersDB.push({ id: Date.now() + created, date: new Date().toISOString().slice(0, 10), supplier: sup, items, status: 'new' }); created++; }
            });
            markDirty();
            renderOrdersList();
            showNotification(created > 0 ? t('orders_created') + ': ' + created : t('orders_updated'));
        }

        function toggleOrderStatus(id) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const o = ordersDB.find(x => x.id === id); if (!o) return;
            if (o.status === 'new') {
                // Приёмка: товар приходит на склад (один раз)
                if (!o.received) {
                    o.items.forEach(it => {
                        const inv = (inventoryDB || []).find(x => x.name.trim().toLowerCase() === String(it.name).trim().toLowerCase());
                        if (inv && inv.unit === it.unit) inv.quantity = Math.round(((inv.quantity || 0) + (it.qty || 0)) * 100) / 100;
                    });
                    o.received = true;
                }
                o.status = 'done';
            } else {
                o.status = 'new';
            }
            markDirty();
            renderOrdersList();
        }
        function deleteOrder(id) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            showConfirm(t('confirm_title'), t('confirm_msg'), () => {
                ordersDB = ordersDB.filter(x => x.id !== id);
                markDirty();
                renderOrdersList();
                showNotification(t('notif_deleted'));
            });
        }

        // v2.2: сравнение цен — ищем поставщика дешевле для позиции заказа
        function cheaperSupplierHint(itemName, orderSupplier) {
            const inv = (inventoryDB || []).find(x => x.name.trim().toLowerCase() === String(itemName).trim().toLowerCase());
            if (!inv) return '';
            const all = [{ supplier: inv.supplier, price: inv.price }, ...((inv.altPrices || []).map(a => ({ supplier: a.supplier, price: a.price })))].filter(p => p.supplier && p.price > 0);
            if (all.length < 2) return '';
            const best = all.reduce((m, p) => p.price < m.price ? p : m, all[0]);
            const cur = all.find(p => p.supplier === orderSupplier);
            if (best.supplier === orderSupplier) return '';
            if (cur && best.price >= cur.price) return '';
            return `<div class="text-xs text-green-400 mt-0.5"><i class="fa-solid fa-arrow-trend-down mr-1"></i>${t('orders_cheaper_at')} ${best.supplier}: ${currentCurrency}${best.price}</div>`;
        }

        function renderOrdersList() {
            const box = document.getElementById('orders-list'); if (!box) return;
            const genBtn = document.getElementById('gen-orders-btn');
            if (genBtn) genBtn.style.display = currentAppRole === 'chef' ? '' : 'none';
            const sorted = [...ordersDB].sort((a, b) => (b.status === 'new') - (a.status === 'new') || b.id - a.id);
            box.innerHTML = sorted.length ? sorted.map(o => `
                <div class="bg-[#1C1C1E] border ${o.status === 'new' ? 'border-orange-500/30' : 'border-white/5 opacity-60'} rounded-2xl p-5">
                    <div class="flex items-center justify-between mb-3">
                        <div>
                            <h4 class="font-semibold text-white">${o.supplier}</h4>
                            <p class="text-xs text-gray-500">${o.date} · ${o.items.length} ${t('orders_positions')}</p>
                        </div>
                        <span class="text-xs font-bold px-2.5 py-1 rounded-md ${o.status === 'new' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}">${t('order_' + o.status)}</span>
                    </div>
                    <div class="text-sm text-gray-300 space-y-1 mb-3">
                        ${o.items.map(i => `<div class="border-b border-white/5 py-1"><div class="flex justify-between"><span>${i.name}</span><span class="font-medium text-white">${i.qty} ${t('unit_' + i.unit) || i.unit}</span></div>${cheaperSupplierHint(i.name, o.supplier)}</div>`).join('')}
                    </div>
                    ${currentAppRole === 'chef' ? `
                    <div class="flex gap-2">
                        <button onclick="toggleOrderStatus(${o.id})" class="flex-1 h-10 rounded-xl ${o.status === 'new' ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400' : 'bg-white/10 hover:bg-white/20 text-gray-300'} text-sm font-medium transition-colors">${t(o.status === 'new' ? 'order_mark_done' : 'order_reopen')}</button>
                        <button onclick="deleteOrder(${o.id})" class="h-10 w-10 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"><i class="fa-solid fa-trash"></i></button>
                    </div>` : ''}
                </div>`).join('')
                : `<p class="text-sm text-gray-600 text-center py-6">${t('orders_empty')}</p>`;
        }
