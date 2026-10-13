        // --- ИНВЕНТАРИЗАЦИЯ (СВЕРКА) ---
        function openInventoryCheck() {
            document.getElementById('inv-check-kitchen-subtitle').textContent = t(activeKitchen); document.getElementById('inv-check-search').value = '';
            renderInventoryCheckList(); openModal('inventory-check-modal');
        }
        function renderInventoryCheckList(sq = '') {
            const l = document.getElementById('inv-check-list'); l.innerHTML = '';
            let f = inventoryDB;
            if (sq) { const q = sq.toLowerCase(); f = f.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)); }
            f.forEach(i => {
                l.innerHTML += `
                    <div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4 flex flex-col md:grid md:grid-cols-12 md:items-center gap-4 hover:border-indigo-500/50 transition-colors">
                        <div class="md:col-span-5 flex flex-col"><span class="font-semibold text-white">${i.name}</span><span class="text-[10px] sm:text-xs text-indigo-400 font-medium">${t(i.category)}</span></div>
                        <div class="md:col-span-2 flex justify-between md:justify-end text-sm"><span class="md:hidden text-gray-500">${t('chk_th_sys')}:</span><span class="text-gray-400 font-medium">${i.quantity.toFixed(2)} ${t('unit_'+i.unit)}</span></div>
                        <div class="md:col-span-3 flex justify-between md:justify-center items-center gap-2 text-sm"><span class="md:hidden text-gray-500">${t('chk_th_fact')}:</span><div class="flex items-center gap-2"><input type="number" step="0.01" id="inv-check-input-${i.id}" value="${i.quantity.toFixed(2)}" oninput="updateCheckDiff(${i.id}, ${i.quantity})" class="w-20 sm:w-24 h-10 bg-[#2C2C2E] border border-white/10 rounded-lg px-3 text-center text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-semibold"><span class="text-gray-500 text-xs">${t('unit_'+i.unit)}</span></div></div>
                        <div class="md:col-span-2 flex justify-between md:justify-end text-sm"><span class="md:hidden text-gray-500">${t('chk_th_diff')}:</span><span id="inv-check-diff-${i.id}" class="font-bold text-gray-400">0.00</span></div>
                    </div>`;
            });
            if (f.length === 0) l.innerHTML = `<div class="text-center text-gray-500 py-10">${t('inv_not_found')}</div>`;
        }
        function filterInventoryCheck() { renderInventoryCheckList(document.getElementById('inv-check-search').value); }
        function updateCheckDiff(id, sys) {
            const inp = document.getElementById(`inv-check-input-${id}`), dEl = document.getElementById(`inv-check-diff-${id}`); if (!inp || !dEl) return;
            const act = parseFloat(inp.value); if (isNaN(act)) { dEl.textContent = '0.00'; dEl.className = 'font-bold text-gray-400'; return; }
            const diff = act - sys;
            dEl.textContent = (diff > 0 ? '+' : '') + diff.toFixed(2);
            dEl.className = `font-bold ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-400'}`;
        }
        function applyInventoryCheck(btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> <span>${t('chk_processing')}</span>`;
            
            setTimeout(() => {
                let updatedCount = 0;
                inventoryDB.forEach(i => {
                    const inp = document.getElementById(`inv-check-input-${i.id}`);
                    if (inp) {
                        const act = parseFloat(inp.value);
                        if (!isNaN(act) && act !== i.quantity) {
                            const diff = act - i.quantity;
                            if (diff < 0) {
                                const curMonth = getCurrentMonthKey();
                                if (!financeDB[curMonth]) financeDB[curMonth] = { income: 0, cogs: 0, payroll: 0, losses: 0 };
                                financeDB[curMonth].losses += Math.abs(diff) * i.price;
                            }
                            i.quantity = act;
                            updatedCount++;
                        }
                    }
                });
                if (updatedCount > 0) markDirty();
                
                btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i> <span>${t('chk_success')}</span>`;
                btn.classList.replace('bg-indigo-500', 'bg-green-500');
                
                setTimeout(() => {
                    closeModal('inventory-check-modal');
                    btn.innerHTML = orig;
                    btn.classList.replace('bg-green-500', 'bg-indigo-500');
                    if (updatedCount > 0) {
                        showNotification(`${t('notif_stock_updated')}${updatedCount}`);
                        if(!document.getElementById('inventory-modal').classList.contains('hidden')) {
                            filterInventory();
                        }
                    }
                }, 1000);
            }, 600);
        }

