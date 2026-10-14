        // --- ЗАКАЗЫ ПОСТАВЩИКАМ (v1.7, лайт) ---
        // Позиции с minQty > 0 и остатком <= minQty попадают в автозаказ.

        function lowStockItems() {
            return inventoryDB.filter(i => (i.minQty || 0) > 0 && (i.quantity || 0) <= i.minQty && i.supplier);
        }
        // Уведомления о критических остатках (v2.9): шефам — один раз, пока не пополнят
        function checkLowStockAlerts() {
            if (typeof notifyApprovers !== 'function') return;
            let changed = false;
            (inventoryDB || []).forEach(i => {
                const min = i.minQty || 0, qty = i.quantity || 0;
                if (min > 0 && qty <= min) {
                    if (!i.lowNotified) {
                        i.lowNotified = true; changed = true;
                        notifyApprovers('lowstock', t('lowstock_alert')
                            .replace('{name}', i.name)
                            .replace('{qty}', qty)
                            .replace('{unit}', t('unit_' + i.unit) || i.unit)
                            .replace('{min}', min), i.id);
                    }
                } else if (i.lowNotified) { i.lowNotified = false; changed = true; }
            });
            if (changed) markDirty();
        }
        function suggestedOrderQty(i) {
            const base = Math.max(0, Math.ceil((i.minQty * 2 - (i.quantity || 0)) * 100) / 100);
            // v2.4: если у поставщика настроен график — запаса должно хватить
            // до следующего дня заказа + срок поставки (+1 день запаса)
            const sup = i.supplier ? supplierByName(i.supplier) : null;
            if (!sup || !Array.isArray(sup.orderDays) || !sup.orderDays.length) return base;
            const daily = ingredientDailyUse(i);
            if (!(daily > 0)) return base;
            const cover = daysToNextOrderDay(i.supplier) + (sup.leadDays || 0) + 1;
            const need = Math.max(0, Math.ceil((daily * cover - (i.quantity || 0)) * 100) / 100);
            return Math.max(base, need);
        }
        // Средний расход ингредиента в день — по истории продаж и ТТК
        function ingredientDailyUse(item) {
            try {
                const mk = (typeof analyticsMonth !== 'undefined' && analyticsMonth) ? analyticsMonth : getCurrentMonthKey();
                const sales = ((typeof salesDB !== 'undefined' ? salesDB[mk] : null) || {});
                const parts = String(mk).split('-');
                const now = new Date();
                const daysElapsed = (parseInt(parts[0]) === now.getFullYear() && parseInt(parts[1]) === now.getMonth() + 1) ? now.getDate() : new Date(parseInt(parts[0]), parseInt(parts[1]), 0).getDate();
                if (!(daysElapsed > 0)) return 0;
                let use = 0;
                const mdb = (typeof menuDB !== 'undefined' && Array.isArray(menuDB)) ? menuDB : [];
                for (const id in sales) {
                    const d = mdb.find(x => String(x.id) === String(id));
                    if (!d) continue;
                    const perDay = sales[id] / daysElapsed;
                    if (typeof forecastDishNeeds !== 'function') continue;
                    const needs = forecastDishNeeds(d, 1);
                    const n = needs.find(x => x.item && x.item.id === item.id);
                    if (n) use += perDay * n.amount;
                }
                return use;
            } catch (e) { return 0; }
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
            if (typeof renderForecastList === 'function') renderForecastList();
            showNotification(created > 0 ? t('orders_created') + ': ' + created : t('orders_updated'));
        }

        // --- ПРОГНОЗ ЗАПАСОВ (v2.6): «хватит на N дней» по истории продаж ---
        // Показываем позиции, которые закончатся раньше/около следующего заказа.
        function forecastRows() {
            const rows = [];
            (typeof inventoryDB !== 'undefined' ? inventoryDB : []).forEach(it => {
                if (!it.supplier) return;
                const daily = (typeof ingredientDailyUse === 'function') ? ingredientDailyUse(it) : 0;
                if (!(daily > 0)) return;
                const daysLeft = (it.quantity || 0) / daily;
                const sup = (typeof supplierByName === 'function') ? supplierByName(it.supplier) : null;
                const lead = (sup && sup.leadDays) || 0;
                const cover = ((typeof daysToNextOrderDay === 'function') ? daysToNextOrderDay(it.supplier) : 7) + lead + 1;
                const status = daysLeft <= lead + 1 ? 'urgent' : (daysLeft <= cover ? 'soon' : 'ok');
                rows.push({ item: it, daily: daily, daysLeft: daysLeft, status: status });
            });
            rows.sort((a, b) => a.daysLeft - b.daysLeft);
            return rows;
        }
        function renderForecastList() {
            const box = document.getElementById('forecast-list');
            if (!box) return;
            const rows = forecastRows().filter(r => r.status !== 'ok').slice(0, 12);
            if (!rows.length) { box.innerHTML = `<div class="text-sm text-gray-500 py-2">${t('forecast_empty')}</div>`; return; }
            box.innerHTML = rows.map(r => {
                const col = r.status === 'urgent' ? 'text-red-400' : 'text-amber-400';
                const dot = r.status === 'urgent' ? 'bg-red-500' : 'bg-amber-500';
                const dl = r.daysLeft < 1 ? '<1' : Math.floor(r.daysLeft);
                return `<div class="bg-[#1C1C1E] border border-white/5 rounded-xl p-3 flex items-center gap-3">`
                    + `<span class="w-2 h-2 rounded-full ${dot} shrink-0"></span>`
                    + `<div class="flex-1 min-w-0"><p class="text-sm font-medium text-white truncate">${escapeHtml(r.item.name)}</p>`
                    + `<p class="text-[11px] text-gray-500">${trimNum(r.item.quantity)} ${t('unit_' + r.item.unit) || r.item.unit} · ${t('forecast_per_day')}: ${trimNum(Math.round(r.daily * 100) / 100)}</p></div>`
                    + `<span class="text-sm font-bold ${col} whitespace-nowrap">${t('forecast_left')} ${dl} ${t('forecast_days')}</span>`
                    + `<button onclick="forecastAddToOrder('${r.item.id}')" class="h-9 px-3 rounded-xl bg-orange-500/15 text-orange-400 hover:bg-orange-500 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap active:scale-95">${t('forecast_add')}</button>`
                    + `</div>`;
            }).join('');
        }
        function forecastAddToOrder(id) {
            const it = (typeof inventoryDB !== 'undefined' ? inventoryDB : []).find(x => String(x.id) === String(id));
            if (!it || !it.supplier || typeof suggestedOrderQty !== 'function') return;
            const qty = suggestedOrderQty(it);
            if (!(qty > 0)) { showNotification(t('orders_nothing')); return; }
            const line = { name: it.name, qty: qty, unit: it.unit };
            let open = (typeof ordersDB !== 'undefined' ? ordersDB : []).find(o => o.supplier === it.supplier && o.status === 'new');
            if (open) {
                const ex = open.items.find(x => x.name === it.name && x.unit === it.unit);
                if (ex) ex.qty = Math.round((ex.qty + qty) * 100) / 100; else open.items.push(line);
            } else {
                ordersDB.push({ id: Date.now(), date: new Date().toISOString().slice(0, 10), supplier: it.supplier, items: [line], status: 'new' });
            }
            markDirty(); renderOrdersList(); renderForecastList();
            showNotification(t('forecast_added'));
        }
        function toggleOrderStatus(id) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const o = ordersDB.find(x => x.id === id); if (!o) return;
            if (o.status === 'new') { openReceiveModal(id); return; }
            o.status = 'new'; o.received = false;
            markDirty(); renderOrdersList();
        }
        // Приёмка заказа (v2.9): фактическое кол-во + цена за единицу
        let receiveOrderId = null;
        function openReceiveModal(id) {
            const o = ordersDB.find(x => x.id === id); if (!o) return;
            receiveOrderId = id;
            document.getElementById('receive-supplier').textContent = o.supplier + ' · ' + o.date;
            document.getElementById('receive-lines').innerHTML = o.items.map((it, idx) => {
                const inv = (inventoryDB || []).find(x => String(x.name).trim().toLowerCase() === String(it.name).trim().toLowerCase());
                const lastPrice = inv ? (inv.price || 0) : 0;
                return `<div class="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div class="text-white text-sm font-medium mb-2">${it.name} <span class="text-gray-500 text-xs">· ${t('orders_ordered')}: ${it.qty} ${t('unit_' + it.unit) || it.unit}</span></div>
                    <div class="flex gap-2">
                        <div class="flex-1"><div class="text-[11px] text-gray-500 mb-1">${t('receive_qty')}</div>
                            <input type="number" data-recv="qty" data-idx="${idx}" value="${it.qty}" min="0" step="0.01" oninput="renderReceiveTotal()" class="w-full h-10 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-3 text-sm outline-none focus:border-emerald-500"></div>
                        <div class="flex-1"><div class="text-[11px] text-gray-500 mb-1">${t('receive_price')}</div>
                            <input type="number" data-recv="price" data-idx="${idx}" value="${lastPrice}" min="0" step="0.01" oninput="renderReceiveTotal()" class="w-full h-10 bg-[#2C2C2E] border border-white/10 text-white rounded-xl px-3 text-sm outline-none focus:border-emerald-500"></div>
                    </div>
                </div>`;
            }).join('');
            renderReceiveTotal();
            openModal('receive-modal');
        }
        function renderReceiveTotal() {
            let total = 0;
            document.querySelectorAll('#receive-lines [data-recv="qty"]').forEach(qEl => {
                const pEl = document.querySelector('#receive-lines [data-recv="price"][data-idx="' + qEl.dataset.idx + '"]');
                total += (parseFloat(qEl.value) || 0) * (parseFloat(pEl.value) || 0);
            });
            document.getElementById('receive-total').textContent = currentCurrency + (Math.round(total * 100) / 100);
        }
        function confirmReceive() {
            const o = ordersDB.find(x => x.id === receiveOrderId); if (!o) return;
            let total = 0;
            document.querySelectorAll('#receive-lines [data-recv="qty"]').forEach(qEl => {
                const idx = qEl.dataset.idx;
                const pEl = document.querySelector('#receive-lines [data-recv="price"][data-idx="' + idx + '"]');
                const qty = Math.max(0, parseFloat(qEl.value) || 0);
                const price = Math.max(0, parseFloat(pEl.value) || 0);
                const it = o.items[idx];
                it.receivedQty = Math.round(qty * 100) / 100;
                it.receivedPrice = Math.round(price * 100) / 100;
                total += qty * price;
                if (qty > 0) {
                    const inv = (inventoryDB || []).find(x => String(x.name).trim().toLowerCase() === String(it.name).trim().toLowerCase());
                    if (inv && inv.unit === it.unit) {
                        inv.quantity = Math.round(((inv.quantity || 0) + qty) * 100) / 100;
                        if (price > 0) { inv.previousPrice = inv.price || 0; inv.price = price; }
                        if (o.supplier) inv.supplier = o.supplier;
                    }
                }
            });
            total = Math.round(total * 100) / 100;
            o.received = true; o.status = 'done'; o.receivedAt = new Date().toISOString().slice(0, 10); o.receivedTotal = total;
            markDirty(); renderOrdersList();
            if (typeof checkLowStockAlerts === 'function') checkLowStockAlerts();
            closeModal('receive-modal');
            showNotification(t('receive_done') + ': ' + currentCurrency + total);
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

        // --- НАСТРОЙКИ АВТОЗАКАЗА (v2.4): дни работы поставщика, лид-тайм ---
        // supplier.orderDays: [0..6] (0=вс), supplier.leadDays: дней до поставки
        function allSuppliers() { return (typeof suppliersDB !== 'undefined' && Array.isArray(suppliersDB)) ? suppliersDB : []; }
        function supplierByName(name) {
            return allSuppliers().find(x => String(x.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase()) || null;
        }
        function supplierWorkdays(sup) {
            const r = supplierByName(sup);
            const d = r && Array.isArray(r.orderDays) ? r.orderDays : null;
            return (d && d.length) ? d : [0, 1, 2, 3, 4, 5, 6];
        }
        function supplierLead(sup) {
            const r = supplierByName(sup);
            return (r && r.leadDays >= 0) ? r.leadDays : 0;
        }
        // Дней до ближайшего рабочего дня поставщика (0 = сегодня)
        function daysToNextOrderDay(sup, fromDate) {
            const days = supplierWorkdays(sup);
            const base = fromDate ? new Date(fromDate) : new Date();
            for (let i = 0; i < 8; i++) {
                if (days.includes((base.getDay() + i) % 7)) return i;
            }
            return 0;
        }
        function weekdayShort(d) { return t('dow_' + d); }
        function nextOrderDayLabel(sup) {
            const n = daysToNextOrderDay(sup);
            if (n === 0) return t('next_order_today');
            const d = new Date(); d.setDate(d.getDate() + n);
            return t('next_order_day') + ': ' + weekdayShort(d.getDay());
        }
        function toggleSupplierDay(id, day) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const s = allSuppliers().find(x => x.id === id); if (!s) return;
            if (!Array.isArray(s.orderDays)) s.orderDays = [0, 1, 2, 3, 4, 5, 6];
            const i = s.orderDays.indexOf(day);
            if (i >= 0) { if (s.orderDays.length > 1) s.orderDays.splice(i, 1); }
            else s.orderDays.push(day);
            markDirty();
            renderAutoOrderSettings();
            renderOrdersList();
        }
        function changeSupplierLead(id, delta) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const s = allSuppliers().find(x => x.id === id); if (!s) return;
            s.leadDays = Math.max(0, Math.min(14, (s.leadDays || 0) + delta));
            markDirty();
            renderAutoOrderSettings();
            renderOrdersList();
        }
        function renderAutoOrderSettings() {
            const box = document.getElementById('autoorder-settings'); if (!box) return;
            const isChef = currentAppRole === 'chef';
            const list = allSuppliers();
            box.innerHTML = list.length ? list.map(s => {
                const days = supplierWorkdays(s.name);
                const chips = [1, 2, 3, 4, 5, 6, 0].map(d => {
                    const on = days.includes(d);
                    return `<button ${isChef ? `onclick="toggleSupplierDay(${s.id}, ${d})"` : 'disabled'} class="w-9 h-9 rounded-lg text-xs font-bold border transition-all ${on ? 'bg-orange-500 text-white border-orange-500' : 'bg-[#2C2C2E] text-gray-500 border-white/10'} ${isChef ? 'active:scale-90 cursor-pointer' : 'cursor-default'}">${weekdayShort(d)}</button>`;
                }).join('');
                return `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div>
                            <span class="font-semibold text-white">${s.name}</span>
                            <span class="text-xs text-gray-500 ml-2">${s.email ? s.email : t('no_supplier_email')}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-400">${t('lead_days')}:</span>
                            <button ${isChef ? `onclick="changeSupplierLead(${s.id}, -1)"` : 'disabled'} class="w-8 h-8 rounded-lg bg-[#2C2C2E] text-white border border-white/10 ${isChef ? 'active:scale-90' : 'opacity-40'}">−</button>
                            <span class="text-white font-bold w-6 text-center">${s.leadDays || 0}</span>
                            <button ${isChef ? `onclick="changeSupplierLead(${s.id}, 1)"` : 'disabled'} class="w-8 h-8 rounded-lg bg-[#2C2C2E] text-white border border-white/10 ${isChef ? 'active:scale-90' : 'opacity-40'}">+</button>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs text-gray-400 mr-1">${t('supplier_workdays')}:</span>
                        ${chips}
                    </div>
                </div>`;
            }).join('') : `<p class="text-sm text-gray-600 text-center py-4">${t('sup_empty')}</p>`;
        }

        // --- Отправка заказа поставщику (v2.4): email / копирование ---
        function orderText(o) {
            const lines = o.items.map(i => `- ${i.name} — ${i.qty} ${t('unit_' + i.unit) || i.unit}`);
            return `${t('order_mail_subject')} ${o.date}\n${t('order_mail_supplier')}: ${o.supplier}\n\n${lines.join('\n')}\n\n${t('orders_positions')}: ${o.items.length}`;
        }
        function emailOrder(id) {
            const o = (ordersDB || []).find(x => x.id === id); if (!o) return;
            const s = supplierByName(o.supplier);
            const email = String(s.email || '').trim();
            if (!s || !email) { showNotification(t('no_supplier_email')); return; }
            const subject = encodeURIComponent(`${t('order_mail_subject')} ${o.date} — ${o.supplier}`);
            const body = encodeURIComponent(orderText(o));
            window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        }
        function copyOrder(id) {
            const o = (ordersDB || []).find(x => x.id === id); if (!o) return;
            const done = () => showNotification(t('order_copied'));
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(orderText(o)).then(done).catch(() => showNotification(t('order_copy_fail')));
            } else {
                const ta = document.createElement('textarea');
                ta.value = orderText(o); document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); done(); } catch (e) { showNotification(t('order_copy_fail')); }
                ta.remove();
            }
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
                            <p class="text-xs text-sky-400 mt-0.5"><i class="fa-solid fa-truck mr-1"></i>${nextOrderDayLabel(o.supplier)}</p>
                        </div>
                        <span class="text-xs font-bold px-2.5 py-1 rounded-md ${o.status === 'new' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}">${t('order_' + o.status)}</span>
                    </div>
                    <div class="text-sm text-gray-300 space-y-1 mb-3">
                        ${o.items.map(i => `<div class="border-b border-white/5 py-1"><div class="flex justify-between"><span>${i.name}</span><span class="font-medium text-white">${i.qty} ${t('unit_' + i.unit) || i.unit}</span></div>${cheaperSupplierHint(i.name, o.supplier)}</div>`).join('')}
                    </div>
                    ${currentAppRole === 'chef' ? `
                    <div class="flex gap-2">
                        <button onclick="toggleOrderStatus(${o.id})" class="flex-1 h-10 rounded-xl ${o.status === 'new' ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400' : 'bg-white/10 hover:bg-white/20 text-gray-300'} text-sm font-medium transition-colors">${t(o.status === 'new' ? 'order_mark_done' : 'order_reopen')}</button>
                        <button onclick="emailOrder(${o.id})" title="${t('order_email')}" class="h-10 w-10 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 transition-colors"><i class="fa-solid fa-envelope"></i></button>
                        <button onclick="copyOrder(${o.id})" title="${t('order_copy')}" class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"><i class="fa-solid fa-copy"></i></button>
                        <button onclick="deleteOrder(${o.id})" class="h-10 w-10 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"><i class="fa-solid fa-trash"></i></button>
                    </div>` : ''}
                </div>`).join('')
                : `<p class="text-sm text-gray-600 text-center py-6">${t('orders_empty')}</p>`;
        }
