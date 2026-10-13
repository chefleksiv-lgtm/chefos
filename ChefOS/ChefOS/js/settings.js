        // --- НАСТРОЙКИ ---
        function openSettingsModal() {
            // Смену PIN-кода видит только шеф
            const s = document.getElementById('pin-change-section');
            if (s) s.style.display = currentAppRole === 'chef' ? 'block' : 'none';
            refreshCurrencyUI();
            openModal('settings-modal');
        }
        function setCurrency(c) { 
            currentCurrency = c; 
            markDirty();
            refreshCurrencyUI();
            if(navigator.vibrate) navigator.vibrate(10); 
            if(!document.getElementById('inventory-modal').classList.contains('hidden')) filterInventory(); 
        }
        function setCustomCurrency() {
            const v = (document.getElementById('custom-currency-input').value || '').trim();
            if (!v) { showNotification(t('cur_custom_empty')); return; }
            setCurrency(v);
            document.getElementById('custom-currency-input').value = '';
        }
        // Синхронизирует все места, где виден символ валюты: кнопки-пресеты, data-cur споты.
        function refreshCurrencyUI() {
            document.querySelectorAll('.currency-btn').forEach(b => {
                const active = b.dataset.currency === currentCurrency;
                b.className = 'currency-btn h-11 rounded-xl font-semibold ' + (active ? 'bg-white text-black' : 'bg-[#2C2C2E] text-gray-300 hover:bg-[#3A3A3C]');
            });
            document.querySelectorAll('[data-cur]').forEach(el => { el.textContent = currentCurrency; });
        }
        function setCountry(c) { currentCountry = c; markDirty(); if(navigator.vibrate) navigator.vibrate(10); }
        function setLanguage(l) { 
            currentLanguage = l; 
            markDirty();
            if(navigator.vibrate) navigator.vibrate(10); 
            applyTranslations();
        }

        // --- СМЕНА PIN-КОДА (только шеф) ---
        function changePin() {
            if (currentAppRole !== 'chef') { showNotification(t('pin_chef_only')); return; }
            const role = document.getElementById('pin-role-selector').value;
            const pin = (document.getElementById('new-pin-input').value || '').trim();
            if (!/^\d{4}$/.test(pin)) { showNotification(t('pin_invalid')); return; }
            pinCodes[role] = pin;
            document.getElementById('new-pin-input').value = '';
            markDirty();
            updatePinHint();
            showNotification(t('pin_changed'));
            if (navigator.vibrate) navigator.vibrate(10);
        }

        function applyTranslations() {
            // Static text
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if(i18n[key] && i18n[key][currentLanguage]) {
                    if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        if (el.hasAttribute('placeholder')) el.placeholder = i18n[key][currentLanguage];
                        else el.value = i18n[key][currentLanguage];
                    } else {
                        el.innerHTML = i18n[key][currentLanguage];
                    }
                }
            });
            initDropdowns();
            renderKitchenTabs();
            document.getElementById('current-kitchen-label').textContent = t(activeKitchen);
            renderCalendar();
            updateSelectedDateLabel();
            
            if(!document.getElementById('foodcost-modal').classList.contains('hidden')) {
                document.getElementById('progress-target-label').textContent = `${t('fc_target_lbl')} ${getTargetFC(activeKitchen)}%`;
            }
            if(!document.getElementById('inventory-modal').classList.contains('hidden')) {
                document.getElementById('inventory-kitchen-subtitle').textContent = t(activeKitchen);
                switchInvTab(activeTabs.inventory);
            }
            if(!document.getElementById('team-modal').classList.contains('hidden')) {
                document.getElementById('team-kitchen-subtitle').textContent = t(activeKitchen);
                document.getElementById('schedule-kitchen-name').textContent = t(activeKitchen);
                switchTeamTab(activeTabs.team);
            }
            if(!document.getElementById('menu-modal').classList.contains('hidden')) {
                document.getElementById('menu-kitchen-subtitle').textContent = t(activeKitchen);
                syncMenuAllergenDropdown();
                filterMenu();
            }
            if(!document.getElementById('ttk-modal').classList.contains('hidden')) filterTTK();
            if(!document.getElementById('inventory-check-modal').classList.contains('hidden')) {
                document.getElementById('inv-check-kitchen-subtitle').textContent = t(activeKitchen);
                filterInventoryCheck();
            }
            if(!document.getElementById('sales-modal').classList.contains('hidden')) filterSalesList();
        }
        
        function getCurrentFC(k) { if (!currentFoodCosts[k]) currentFoodCosts[k] = (Math.random()*10+25).toFixed(1); return parseFloat(currentFoodCosts[k]); }
        function getTargetFC(k) { return targetFoodCosts[k] || 30; }
        function openFoodCostModal() { document.getElementById('foodcost-modal-kitchen').textContent = t(activeKitchen); document.getElementById('target-fc-input').value = getTargetFC(activeKitchen); updateFoodCostModalVisuals(getCurrentFC(activeKitchen), getTargetFC(activeKitchen)); openModal('foodcost-modal'); }
        function updateFoodCostModalVisuals(cur, tar) {
            const d = document.getElementById('modal-current-fc'), s = document.getElementById('modal-fc-status'), b = document.getElementById('fc-progress-bar'), m = document.getElementById('fc-target-marker');
            document.getElementById('progress-target-label').textContent = `${t('fc_target_lbl')} ${tar}%`; d.textContent = cur.toFixed(1) + '%';
            const max = Math.max(tar + 20, 50); b.style.width = Math.min((cur/max)*100, 100) + '%'; m.style.left = Math.min((tar/max)*100, 100) + '%';
            if (cur > tar) { d.className = 'text-4xl font-bold text-red-500'; s.textContent = t('fc_status_bad'); s.className = 'text-xs font-medium text-red-500 mt-2 bg-red-500/10 inline-block px-2 py-1 rounded-md'; b.className = 'h-full bg-red-500'; } 
            else { d.className = 'text-4xl font-bold text-green-400'; s.textContent = t('fc_status_ok'); s.className = 'text-xs font-medium text-green-400 mt-2 bg-green-500/10 inline-block px-2 py-1 rounded-md'; b.className = 'h-full bg-green-500'; }
        }
        function saveFoodCostSettings(e) {
            const v = parseFloat(document.getElementById('target-fc-input').value);
            if (!isNaN(v) && v > 0 && v <= 100) {
                targetFoodCosts[activeKitchen] = v; markDirty(); updateFoodCostModalVisuals(getCurrentFC(activeKitchen), v); updateFoodCostDisplay(activeKitchen);
                const b = e.currentTarget, orig = b.innerHTML; b.innerHTML = `<i class="fa-solid fa-check-double"></i> ${t('saved')}`; b.classList.replace('bg-orange-500','bg-green-500');
                setTimeout(() => { closeModal('foodcost-modal'); setTimeout(() => { b.innerHTML=orig; b.classList.replace('bg-green-500','bg-orange-500'); },300); }, 700);
            } else showNotification("1 - 100");
        }
        function updateFoodCostDisplay(k) { const e = document.getElementById('food-cost-value'); if(e) { const c = getCurrentFC(k), t = getTargetFC(k); e.textContent = c.toFixed(1) + '%'; e.className = `text-lg sm:text-xl md:text-2xl font-bold flex-shrink-0 transition-colors ${c > t ? 'text-red-400' : 'text-green-400'}`; } }

