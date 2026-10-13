        // --- СКЛАД И ИНВЕНТАРЬ ---
        function initDropdowns() {
            const fc = document.getElementById('inventory-category-filter'), fs = document.getElementById('inventory-supplier-filter'), ec = document.getElementById('edit-ing-category'), es = document.getElementById('edit-ing-supplier'), sc = document.getElementById('edit-sup-category');
            fc.innerHTML = `<option value="all">${t('inv_cat_all')}</option>`; ec.innerHTML = '';
            INGREDIENT_CATEGORIES.forEach(c => { fc.insertAdjacentHTML('beforeend', `<option value="${c}">${t(c)}</option>`); ec.insertAdjacentHTML('beforeend', `<option value="${c}">${t(c)}</option>`); });
            sc.innerHTML = ''; SUPPLIER_CATEGORIES.forEach(c => { sc.insertAdjacentHTML('beforeend', `<option value="${c}">${t(c)}</option>`); });
            updateSupplierDropdowns();
        }
        function updateSupplierDropdowns() {
            const fs = document.getElementById('inventory-supplier-filter'), es = document.getElementById('edit-ing-supplier'), cur = fs.value;
            fs.innerHTML = `<option value="all">${t('inv_sup_all')}</option>`; es.innerHTML = suppliersDB.length === 0 ? '<option value="">Нет поставщика</option>' : '';
            suppliersDB.forEach(s => { fs.insertAdjacentHTML('beforeend', `<option value="${s.name}">${s.name}</option>`); es.insertAdjacentHTML('beforeend', `<option value="${s.name}">${s.name}</option>`); });
            if(suppliersDB.find(s=>s.name===cur)) fs.value = cur;
        }

        function openInventoryModal() { document.getElementById('inventory-kitchen-subtitle').textContent = t(activeKitchen); document.getElementById('inventory-search').value = ''; document.getElementById('inventory-category-filter').value = 'all'; document.getElementById('inventory-supplier-filter').value = 'all'; switchInvTab('ingredients'); openModal('inventory-modal'); }
        function switchInvTab(tabName) {
            activeTabs.inventory = tabName;
            ['ingredients', 'invoices', 'suppliers', 'finance', 'waste'].forEach(i => { 
                const btn = document.getElementById(`inv-tab-btn-${i}`);
                const content = document.getElementById(`inv-tab-${i}`);
                if(btn) btn.className = `px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${i === tabName ? 'border-purple-500 text-purple-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`;
                if(content) {
                    if(i === tabName) content.classList.remove('hidden');
                    else content.classList.add('hidden');
                }
            });
            if (tabName === 'ingredients') renderInventoryList(); 
            if (tabName === 'suppliers') { renderSuppliersList(); renderOrdersList(); }
            if (tabName === 'finance') renderFinanceTab();
            if (tabName === 'waste') renderWasteTab();
        }

        function renderInventoryList(sq = '', fc = 'all', fs = 'all') {
            const l = document.getElementById('inventory-list'); l.innerHTML = ''; let f = inventoryDB;
            if (fc !== 'all') f = f.filter(i => i.category === fc); if (fs !== 'all') f = f.filter(i => i.supplier === fs);
            if (sq) { const q = sq.toLowerCase(); f = f.filter(i => i.name.toLowerCase().includes(q) || (i.supplier && i.supplier.toLowerCase().includes(q))); }
            let tot = 0;
            
            f.forEach(i => {
                const it = i.quantity * i.price; tot += it;
                
                let supplierHtml = '';
                let priceHtml = '';
                let sumHtml = '';
                let pointerClass = '';
                let onclickAttr = '';

                if (currentAppRole === 'chef') {
                    supplierHtml = i.supplier ? `<span class="text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">${i.supplier}</span>` : '';
                    let tr = '<i class="fa-solid fa-minus text-gray-600 text-[10px] ml-1.5" title="Без изменений"></i>';
                    if (i.previousPrice) { if (i.price > i.previousPrice) tr = `<i class="fa-solid fa-arrow-trend-up text-red-500 text-[10px] ml-1.5" title="Цена выросла (было ${i.previousPrice})"></i>`; else if (i.price < i.previousPrice) tr = `<i class="fa-solid fa-arrow-trend-down text-green-500 text-[10px] ml-1.5" title="Цена упала (было ${i.previousPrice})"></i>`; }
                    priceHtml = `<div class="md:col-span-2 flex justify-between md:justify-end text-sm"><span class="md:hidden text-gray-500">${t('inv_th_price')}:</span><span class="text-gray-300 font-medium flex items-center">${currentCurrency}${i.price.toLocaleString('ru-RU')} ${tr}</span></div>`;
                    sumHtml = `<div class="md:col-span-3 flex justify-between md:justify-end text-sm"><span class="md:hidden text-gray-500">${t('inv_th_sum')}:</span><span class="font-bold text-white">${currentCurrency}${it.toLocaleString('ru-RU')}</span></div>`;
                    pointerClass = 'cursor-pointer hover:border-purple-500/50 hover:bg-[#2C2C2E]';
                    onclickAttr = `onclick="openIngredientEditModal(${i.id})"`;
                }

                l.innerHTML += `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4 flex flex-col md:grid md:grid-cols-12 md:items-center gap-3 transition-all group ${pointerClass}" ${onclickAttr}><div class="md:col-span-${currentAppRole === 'chef' ? '5' : '10'} flex flex-col min-w-0"><span class="font-semibold text-white break-words">${i.name}</span><div class="flex items-center mt-0.5 overflow-hidden"><span class="text-[10px] sm:text-xs text-purple-400 font-medium">${t(i.category)}</span>${supplierHtml}</div></div><div class="md:col-span-2 flex justify-between md:justify-end text-sm"><span class="md:hidden text-gray-500">${t('inv_th_stock')}:</span><span class="font-medium text-white bg-zinc-800 px-2.5 py-1 rounded-lg border border-white/5 group-hover:bg-zinc-700 transition-colors">${i.quantity.toFixed(2)} ${t('unit_'+i.unit)}</span></div>${priceHtml}${sumHtml}</div>`;
            });
            
            const h = document.getElementById('inventory-total-header');
            if (f.length === 0) { l.innerHTML = `<div class="text-center text-gray-500 py-10">${t('inv_not_found')}</div>`; h.innerHTML = ''; } 
            else if (currentAppRole === 'chef') { h.innerHTML = `<div class="p-5 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex justify-between items-center text-lg shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]"><span class="font-medium text-purple-300">${t('inv_total_assets')}</span><span class="font-bold text-purple-400 text-xl">${currentCurrency}${tot.toLocaleString('ru-RU')}</span></div>`; }
            else { h.innerHTML = ''; }

            const headerRow = document.getElementById('inv-table-header');
            if (headerRow) {
                const nameCol = document.getElementById('inv-th-name');
                if (!rolePerm(currentAppRole, 'seePrices')) {
                    headerRow.classList.remove('md:grid');
                    headerRow.classList.add('hidden');
                } else {
                    headerRow.classList.add('md:grid');
                    headerRow.classList.remove('hidden');
                    if(nameCol) nameCol.className = 'col-span-5';
                }
            }
        }
        function filterInventory() { renderInventoryList(document.getElementById('inventory-search').value, document.getElementById('inventory-category-filter').value, document.getElementById('inventory-supplier-filter').value); }
        
        function simulateInvoiceScan() {
            document.getElementById('scan-curr-1').textContent = currentCurrency; document.getElementById('scan-curr-2').textContent = currentCurrency; document.getElementById('scan-curr-3').textContent = currentCurrency;
            document.getElementById('scanner-loading').classList.remove('hidden'); document.getElementById('scanner-result').classList.add('hidden'); openModal('invoice-scanner-modal');
            setTimeout(() => { document.getElementById('scanner-loading').classList.add('hidden'); document.getElementById('scanner-result').classList.remove('hidden'); }, 2000);
        }
        function closeScannerModal() { closeModal('invoice-scanner-modal'); }
        function applyScannedInvoice() {
            let i1 = inventoryDB.find(i => i.id === 101); if(i1) { i1.previousPrice = i1.price; i1.price = 1000; i1.quantity += 10; }
            let i2 = inventoryDB.find(i => i.id === 103); if(i2) { i2.previousPrice = i2.price; i2.price = 210; i2.quantity += 5; }
            if(!inventoryDB.find(i => i.name === 'Авокадо Хасс')) inventoryDB.push({ id: Date.now(), name: 'Авокадо Хасс', category: 'Овощи и фрукты', quantity: 3, unit: 'kg', price: 12, previousPrice: 12, supplier: 'Sysco Canada', yieldPct: 100, allergens: [], priceHistory: [] });
            markDirty();
            closeScannerModal(); showNotification(t('notif_invoice_scanned')); switchInvTab('ingredients');
        }

        function renderAllergenCheckboxes(selected) {
            const box = document.getElementById('edit-ing-allergens'); if (!box) return;
            box.innerHTML = '';
            ALLERGENS.forEach(a => {
                const on = (selected || []).includes(a);
                box.innerHTML += `<label class="flex items-center gap-1.5 h-9 px-2 bg-[#2C2C2E] rounded-lg text-[11px] text-gray-300 cursor-pointer whitespace-nowrap ${on ? 'ring-1 ring-amber-500/60' : ''}"><input type="checkbox" data-allergen="${a}" ${on ? 'checked' : ''} class="accent-amber-500 w-3.5 h-3.5 shrink-0">${t('alg_' + a)}</label>`;
            });
        }
        function getSelectedAllergens() {
            return [...document.querySelectorAll('#edit-ing-allergens input[data-allergen]:checked')].map(el => el.dataset.allergen);
        }
        function openIngredientEditModal(id) {
            if(id === null) { editingIngredientId = null; document.getElementById('delete-ing-btn').classList.add('hidden'); document.getElementById('edit-ing-name').value = ''; document.getElementById('edit-ing-qty').value = ''; document.getElementById('edit-ing-minqty').value = ''; document.getElementById('edit-ing-price').value = ''; document.getElementById('edit-ing-yield').value = 100; renderAllergenCheckboxes([]); document.getElementById('edit-ing-price-history-block').classList.add('hidden'); document.getElementById('edit-ing-waste-block').classList.add('hidden'); editingAltPrices = []; fillAltSupplierSelect(''); renderAltPrices(); } 
            else { const i = inventoryDB.find(item => item.id === id); if (!i) return; editingIngredientId = id; document.getElementById('delete-ing-btn').classList.remove('hidden'); document.getElementById('edit-ing-name').value = i.name; document.getElementById('edit-ing-category').value = i.category; document.getElementById('edit-ing-qty').value = Math.round(i.quantity * 1000) / 1000; document.getElementById('edit-ing-minqty').value = i.minQty || ''; document.getElementById('edit-ing-unit').value = i.unit; document.getElementById('edit-ing-price').value = i.price; document.getElementById('edit-ing-supplier').value = i.supplier || ''; document.getElementById('edit-ing-yield').value = i.yieldPct || 100; renderAllergenCheckboxes(i.allergens); renderPriceHistory(i); document.getElementById('edit-ing-waste-block').classList.remove('hidden'); document.getElementById('waste-qty').value = ''; editingAltPrices = (i.altPrices || []).map(a => ({ supplier: a.supplier, price: a.price })); fillAltSupplierSelect(i.supplier || ''); renderAltPrices(); }
            document.getElementById('edit-ing-currency').textContent = currentCurrency; openModal('ingredient-edit-modal');
        }
        function renderPriceHistory(i) {
            const block = document.getElementById('edit-ing-price-history-block'), list = document.getElementById('edit-ing-price-history');
            const h = (i.priceHistory || []).slice(-5).reverse();
            if (!h.length) { block.classList.add('hidden'); return; }
            block.classList.remove('hidden');
            list.innerHTML = h.map(e => `<div class="flex justify-between text-xs bg-black/30 rounded-lg px-3 py-1.5"><span class="text-gray-500">${e.date}</span><span class="text-gray-300 font-medium">${currentCurrency}${e.price}</span></div>`).join('');
        }
        function deleteIngredient() { showConfirm(t('confirm_title'), t('confirm_msg'), () => { inventoryDB = inventoryDB.filter(i => i.id !== editingIngredientId); markDirty(); closeModal('ingredient-edit-modal'); filterInventory(); showNotification(t('notif_deleted')); }); }
        // --- ЦЕНЫ ДРУГИХ ПОСТАВЩИКОВ (v2.2): сравнение цен для заказов ---
        let editingAltPrices = [];
        function renderAltPrices() {
            const list = document.getElementById('edit-ing-altprices'); if (!list) return;
            list.innerHTML = editingAltPrices.length ? editingAltPrices.map((a, idx) => `
                <div class="flex justify-between items-center text-xs bg-black/30 rounded-lg px-3 py-1.5">
                    <span class="text-gray-400 truncate mr-2">${a.supplier}</span>
                    <span class="flex items-center gap-2"><span class="text-gray-300 font-medium">${currentCurrency}${a.price}</span>
                    <button type="button" onclick="removeAltPrice(${idx})" class="text-red-400/60 hover:text-red-400"><i class="fa-solid fa-xmark"></i></button></span>
                </div>`).join('') : `<p class="text-xs text-gray-600">${t('ing_alt_empty')}</p>`;
        }
        function addAltPrice() {
            const sup = document.getElementById('edit-ing-alt-supplier').value;
            const p = parseFloat(document.getElementById('edit-ing-alt-price').value) || 0;
            if (!sup || p <= 0) return;
            const ex = editingAltPrices.findIndex(a => a.supplier === sup);
            if (ex >= 0) editingAltPrices[ex].price = Math.round(p * 100) / 100;
            else editingAltPrices.push({ supplier: sup, price: Math.round(p * 100) / 100 });
            document.getElementById('edit-ing-alt-price').value = '';
            renderAltPrices();
        }
        function removeAltPrice(idx) { editingAltPrices.splice(idx, 1); renderAltPrices(); }
        function fillAltSupplierSelect(current) {
            const sel = document.getElementById('edit-ing-alt-supplier'); if (!sel) return;
            const opts = (suppliersDB || []).filter(s => s.name && s.name !== current).map(s => s.name);
            sel.innerHTML = opts.map(n => `<option value="${n}">${n}</option>`).join('');
        }
        let _savingIngredient = false;
        function saveIngredientChanges() {
            if (_savingIngredient) return; _savingIngredient = true;
            try {
            const n = document.getElementById('edit-ing-name').value.trim(); if(!n) { showNotification(t('notif_enter_name')); return; } const p = parseFloat(document.getElementById('edit-ing-price').value) || 0;
            const yieldPct = Math.min(100, Math.max(1, parseInt(document.getElementById('edit-ing-yield').value) || 100));
            const minQty = Math.max(0, parseFloat(document.getElementById('edit-ing-minqty').value) || 0);
            const allergens = getSelectedAllergens();
            let priceRiseInfo = null;
            if (editingIngredientId) {
                const i = inventoryDB.find(item => item.id === editingIngredientId);
                if (i) {
                    const oldPrice = i.price;
                    i.name = n; i.category = document.getElementById('edit-ing-category').value; i.quantity = Math.round((parseFloat(document.getElementById('edit-ing-qty').value) || 0) * 1000) / 1000; i.unit = document.getElementById('edit-ing-unit').value;
                    i.yieldPct = yieldPct; i.allergens = allergens; i.minQty = minQty; i.altPrices = editingAltPrices.map(a => ({ supplier: a.supplier, price: a.price }));
                    if (p !== oldPrice) {
                        if (!Array.isArray(i.priceHistory)) i.priceHistory = [];
                        i.priceHistory.push({ date: new Date().toISOString().slice(0, 10), price: p, supplier: i.supplier });
                        i.previousPrice = oldPrice; i.price = p;
                        if (oldPrice > 0 && p > oldPrice * (1 + PRICE_RISE_ALERT_PCT / 100)) priceRiseInfo = { id: i.id, name: i.name, oldPrice, newPrice: p };
                    }
                    i.supplier = document.getElementById('edit-ing-supplier').value;
                }
            } 
            else { inventoryDB.push({ id: Date.now(), name: n, category: document.getElementById('edit-ing-category').value, quantity: Math.round((parseFloat(document.getElementById('edit-ing-qty').value) || 0) * 1000) / 1000, unit: document.getElementById('edit-ing-unit').value, price: p, previousPrice: p, supplier: document.getElementById('edit-ing-supplier').value, yieldPct, minQty, allergens, priceHistory: [], altPrices: editingAltPrices.map(a => ({ supplier: a.supplier, price: a.price })) }); }
            markDirty();
            filterInventory(); closeModal('ingredient-edit-modal'); showNotification(t('notif_saved'));
            if (priceRiseInfo) setTimeout(() => showPriceRiseAlert(priceRiseInfo), 350);
            } finally { _savingIngredient = false; }
        }

        // --- АЛЕРТ РОСТА ЦЕНЫ (v1.6) ---
        let priceRiseAffected = [];
        function showPriceRiseAlert(info) {
            const oldCost = {}, affected = dishesUsingIngredient(info.name);
            priceRiseAffected = affected.map(d => d.id);
            const list = document.getElementById('price-alert-list');
            const pct = ((info.newPrice - info.oldPrice) / info.oldPrice * 100).toFixed(1);
            document.getElementById('price-alert-desc').textContent = `${info.name}: ${currentCurrency}${info.oldPrice} → ${currentCurrency}${info.newPrice} (+${pct}%)`;
            list.innerHTML = affected.length ? affected.map(d => {
                const before = costPerPortion(d).perPortion;
                // себестоимость "до" считаем со старой ценой: временно подменяем
                const inv = findInventoryByName(info.name);
                let deltaTxt = '';
                if (inv) {
                    const savedPrice = inv.price; inv.price = info.oldPrice;
                    const cOld = costPerPortion(d).perPortion; inv.price = savedPrice;
                    const delta = before - cOld;
                    deltaTxt = `<span class="text-red-400 font-bold">+${currentCurrency}${trimNum(delta)}</span>`;
                }
                return `<div class="flex justify-between items-center bg-black/30 rounded-lg px-3 py-2 text-sm"><span class="text-gray-300 truncate mr-2">${d.name}</span><span class="text-xs text-gray-500 whitespace-nowrap">${currentCurrency}${trimNum(before)} ${deltaTxt}</span></div>`;
            }).join('') : `<p class="text-gray-500 text-sm">—</p>`;
            openModal('price-alert-modal');
        }
        function applyPriceRiseRecalc() {
            priceRiseAffected.forEach(id => {
                const d = menuDB.find(i => i.id === id); if (!d) return;
                d.costPrice = Math.round(costPerPortion(d).perPortion * 100) / 100;
            });
            markDirty();
            closeModal('price-alert-modal');
            if (!document.getElementById('menu-modal').classList.contains('hidden')) filterMenu();
            showNotification(t('price_rise_done'));
        }

        // --- СПИСАНИЯ / ОТХОДЫ (v1.6) ---
        function applyWaste() {
            const i = inventoryDB.find(item => item.id === editingIngredientId); if (!i) return;
            const qty = parseFloat(document.getElementById('waste-qty').value) || 0;
            if (qty <= 0) { showNotification(t('waste_qty')); return; }
            const reason = document.getElementById('waste-reason').value;
            const realQty = Math.min(qty, i.quantity);
            const cost = Math.round(realQty * i.price * 100) / 100;
            i.quantity = Math.round((i.quantity - realQty) * 100) / 100;
            wasteDB.unshift({ id: Date.now(), date: new Date().toISOString().slice(0, 10), ingredient: i.name, qty: realQty, unit: i.unit, cost, reason });
            const key = getCurrentMonthKey();
            if (!financeDB[key]) financeDB[key] = { income: 0, cogs: 0, payroll: 0, losses: 0 };
            financeDB[key].losses = Math.round((financeDB[key].losses + cost) * 100) / 100;
            markDirty();
            document.getElementById('edit-ing-qty').value = Math.round(i.quantity * 1000) / 1000;
            document.getElementById('waste-qty').value = '';
            filterInventory();
            showNotification(`${t('waste_done')}: ${currentCurrency}${cost}`);
        }
        function renderWasteTab() {
            const list = document.getElementById('waste-list'), totalLine = document.getElementById('waste-total-line'), topBlock = document.getElementById('waste-top-block');
            const total = wasteDB.reduce((s, w) => s + w.cost, 0);
            totalLine.innerHTML = `<span class="text-gray-500">${t('waste_total')}</span> <span class="font-bold text-red-400">${currentCurrency}${trimNum(total)}</span>`;
            if (!wasteDB.length) { topBlock.innerHTML = ''; list.innerHTML = `<div class="text-center text-gray-500 py-10">${t('waste_empty')}</div>`; return; }
            // топ потерь по ингредиентам
            const byIng = {};
            wasteDB.forEach(w => { byIng[w.ingredient] = (byIng[w.ingredient] || 0) + w.cost; });
            const top = Object.entries(byIng).sort((a, b) => b[1] - a[1]).slice(0, 3);
            topBlock.innerHTML = `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4"><p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">${t('waste_top')}</p><div class="flex flex-col gap-1">${top.map(([name, c], idx) => `<div class="flex justify-between text-sm"><span class="text-gray-300">${idx + 1}. ${name}</span><span class="font-bold text-red-400">${currentCurrency}${trimNum(c)}</span></div>`).join('')}</div></div>`;
            const reasonKey = r => ({ spoil: 'waste_reason_spoil', resort: 'waste_reason_resort', tasting: 'waste_reason_tasting', defect: 'waste_reason_defect' }[r] || 'waste_reason_spoil');
            list.innerHTML = wasteDB.map(w => `<div class="bg-[#1C1C1E] border border-white/5 rounded-xl p-3 flex items-center gap-3"><div class="flex-1 min-w-0"><p class="text-sm font-medium text-white truncate">${w.ingredient}</p><p class="text-[11px] text-gray-500">${w.date} · ${t(reasonKey(w.reason))}</p></div><span class="text-sm text-gray-400 whitespace-nowrap">${trimNum(w.qty)} ${t('unit_' + w.unit) || w.unit}</span><span class="text-sm font-bold text-red-400 whitespace-nowrap">${currentCurrency}${trimNum(w.cost)}</span></div>`).join('');
        }

        function renderSuppliersList() {
            const l = document.getElementById('suppliers-list'); l.innerHTML = '';
            suppliersDB.forEach(s => { l.innerHTML += `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-5 hover:border-purple-500/50 transition-all cursor-pointer group" onclick="openSupplierEditModal(${s.id})"><div class="flex justify-between items-start mb-3"><div><h4 class="font-semibold text-white text-lg leading-tight">${s.name}</h4><span class="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-md mt-1 inline-block">${t(s.category)}</span></div><div class="w-8 h-8 rounded-full bg-zinc-800 text-gray-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors"></div></div><div class="space-y-1 text-sm"><div class="flex items-center text-gray-400"><i class="fa-solid fa-user w-5"></i><span class="text-gray-300">${s.manager}</span></div><div class="flex items-center text-gray-400"><i class="fa-solid fa-phone w-5"></i><span class="text-gray-300">${s.phone}</span></div><div class="flex items-center text-gray-400"><i class="fa-solid fa-envelope w-5"></i><span class="text-gray-300 truncate">${s.email}</span></div></div></div>`; });
        }
        function openSupplierEditModal(id) {
            if(id === null) { editingSupplierId = null; document.getElementById('delete-sup-btn').classList.add('hidden'); document.getElementById('edit-sup-name').value = ''; document.getElementById('edit-sup-manager').value = ''; document.getElementById('edit-sup-phone').value = ''; document.getElementById('edit-sup-email').value = ''; } 
            else { const s = suppliersDB.find(i => i.id === id); if(!s) return; editingSupplierId = id; document.getElementById('delete-sup-btn').classList.remove('hidden'); document.getElementById('edit-sup-name').value = s.name; document.getElementById('edit-sup-category').value = s.category; document.getElementById('edit-sup-manager').value = s.manager; document.getElementById('edit-sup-phone').value = s.phone; document.getElementById('edit-sup-email').value = s.email; }
            openModal('supplier-edit-modal');
        }
        function deleteSupplier() { showConfirm(t('confirm_title'), t('confirm_msg'), () => { suppliersDB = suppliersDB.filter(i => i.id !== editingSupplierId); markDirty(); updateSupplierDropdowns(); closeModal('supplier-edit-modal'); renderSuppliersList(); showNotification(t('notif_deleted')); }); }
        function saveSupplierChanges() {
            const n = document.getElementById('edit-sup-name').value.trim(); if(!n) return;
            if(editingSupplierId) { const s = suppliersDB.find(i => i.id === editingSupplierId); if(s) { s.name=n; s.category=document.getElementById('edit-sup-category').value; s.manager=document.getElementById('edit-sup-manager').value; s.phone=document.getElementById('edit-sup-phone').value; s.email=document.getElementById('edit-sup-email').value; } } 
            else suppliersDB.push({ id: Date.now(), name: n, category: document.getElementById('edit-sup-category').value, manager: document.getElementById('edit-sup-manager').value, phone: document.getElementById('edit-sup-phone').value, email: document.getElementById('edit-sup-email').value, status: 'active' });
            markDirty();
            updateSupplierDropdowns(); renderSuppliersList(); closeModal('supplier-edit-modal'); showNotification(t('notif_saved'));
        }

