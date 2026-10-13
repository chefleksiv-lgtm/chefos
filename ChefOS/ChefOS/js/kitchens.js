        // --- КУХНИ И ЗАДАЧИ ---
        function renderKitchenTabs() {
            const container = document.getElementById('kitchen-tabs'); container.innerHTML = '';
            kitchens.forEach(kitchen => {
                const isActive = kitchen === activeKitchen;
                const btn = document.createElement('button');
                btn.className = `px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 active:scale-95 flex items-center gap-2 ${isActive ? 'bg-white text-black shadow-sm' : 'bg-[#2C2C2E] text-gray-300 hover:bg-[#3A3A3C]'}`;
                
                if (isActive) {
                    let actionsHtml = '';
                    if (currentAppRole === 'chef') {
                        actionsHtml = `<div class="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors ml-1" onclick="event.stopPropagation(); showRenameKitchenModal('${kitchen}')" title="${t('edit')}"><i class="fa-solid fa-pen text-[10px] text-gray-600"></i></div>`;
                        if (kitchens.length > 1) {
                            actionsHtml += `<div class="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors ml-0.5" onclick="event.stopPropagation(); showConfirm('${t('confirm_title')}', '${t('confirm_msg')}', () => { kitchens = kitchens.filter(k => k !== kitchen); markDirty(); selectKitchen(kitchens[0]); })"><i class="fa-solid fa-xmark text-xs text-gray-600"></i></div>`;
                        }
                    }
                    btn.innerHTML = `<span>${t(kitchen)}</span><div class="flex items-center">${actionsHtml}</div>`;
                } else {
                    btn.textContent = t(kitchen);
                }
                
                btn.onclick = () => selectKitchen(kitchen); container.appendChild(btn);
            });
            if (currentAppRole === 'chef') {
                new Sortable(container, { animation: 150, delay: 200, delayOnTouchOnly: true, onEnd: function (evt) {
                    const moved = kitchens.splice(evt.oldIndex, 1)[0];
                    kitchens.splice(evt.newIndex, 0, moved);
                    markDirty();
                }});
            }
        }
        function selectKitchen(k) {
            activeKitchen = k; document.getElementById('current-kitchen-label').textContent = t(activeKitchen);
            renderKitchenTabs(); updateFoodCostDisplay(k); loadWidgetNote(); renderCalendar(); 
            if(!document.getElementById('menu-modal').classList.contains('hidden')) { document.getElementById('menu-kitchen-subtitle').textContent = t(activeKitchen); filterMenu(); }
            if(!document.getElementById('ttk-modal').classList.contains('hidden')) filterTTK();
            if(!document.getElementById('team-modal').classList.contains('hidden')) {
                document.getElementById('team-kitchen-subtitle').textContent = t(activeKitchen);
                document.getElementById('schedule-kitchen-name').textContent = t(activeKitchen);
                renderSchedule();
            }
            if(!document.getElementById('inventory-modal').classList.contains('hidden')) {
                document.getElementById('inventory-kitchen-subtitle').textContent = t(activeKitchen);
            }
            if(!document.getElementById('inventory-check-modal').classList.contains('hidden')) {
                document.getElementById('inv-check-kitchen-subtitle').textContent = t(activeKitchen);
            }
            if(navigator.vibrate) navigator.vibrate(10);
        }
        function showAddKitchenModal() { document.getElementById('kitchen-name-input').value = ''; openModal('add-kitchen-modal'); document.getElementById('kitchen-name-input').focus(); }
        function addNewKitchen() {
            const n = document.getElementById('kitchen-name-input').value.trim();
            if (n && !kitchens.includes(n)) { kitchens.push(n); markDirty(); selectKitchen(n); closeModal('add-kitchen-modal'); setTimeout(() => { const c = document.getElementById('kitchen-tabs'); c.scrollLeft = c.scrollWidth; }, 50); } 
            else if (kitchens.includes(n)) showNotification(t('notif_kitchen_exists'));
        }

        function showRenameKitchenModal(k) {
            kitchenToRename = k;
            document.getElementById('rename-kitchen-input').value = k;
            openModal('rename-kitchen-modal');
            document.getElementById('rename-kitchen-input').focus();
        }

        function applyRenameKitchen() {
            const newName = document.getElementById('rename-kitchen-input').value.trim();
            if (!newName || newName === kitchenToRename) { closeModal('rename-kitchen-modal'); return; }
            if (kitchens.includes(newName)) { showNotification(t('notif_kitchen_exists')); return; }

            const idx = kitchens.indexOf(kitchenToRename);
            if (idx !== -1) kitchens[idx] = newName;

            if (chefNotes[kitchenToRename]) { chefNotes[newName] = chefNotes[kitchenToRename]; delete chefNotes[kitchenToRename]; }
            if (currentFoodCosts[kitchenToRename]) { currentFoodCosts[newName] = currentFoodCosts[kitchenToRename]; delete currentFoodCosts[kitchenToRename]; }
            if (targetFoodCosts[kitchenToRename]) { targetFoodCosts[newName] = targetFoodCosts[kitchenToRename]; delete targetFoodCosts[kitchenToRename]; }
            if (scheduleDB[kitchenToRename]) { scheduleDB[newName] = scheduleDB[kitchenToRename]; delete scheduleDB[kitchenToRename]; }
            
            menuDB.forEach(d => { if (d.category === kitchenToRename) d.category = newName; });

            if (activeKitchen === kitchenToRename) activeKitchen = newName;

            kitchenToRename = null;
            closeModal('rename-kitchen-modal');
            markDirty();
            selectKitchen(activeKitchen);
            showNotification(t('notif_kitchen_renamed'));
        }

