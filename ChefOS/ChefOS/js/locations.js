        // --- МУЛЬТИ-ЛОКАЦИИ (v2.2) ---
        // Несколько ресторанов под одним аккаунтом. Переключение — через location.reload()
        // после сохранения: так весь UI гарантированно перерисовывается из нового набора данных.

        function ensureLocations() {
            if (!Array.isArray(locationsDB)) locationsDB = [];
            if (!locationsDB.length) {
                const id = 'loc_' + Date.now();
                locationsDB.push({ id, name: t('loc_main_default') });
                activeLocationId = id;
                // Миграция: текущий рабочий набор (дефолты или восстановленные старые данные) — это main.
                if (typeof stashLocationState === 'function') stashLocationState();
                if (typeof markDirty === 'function') markDirty();
            }
            if (!activeLocationId || !locationsDB.find(l => l.id === activeLocationId)) {
                activeLocationId = locationsDB[0].id;
            }
        }

        function switchLocation(id) {
            if (!id || id === activeLocationId) return;
            if (!locationsDB.find(l => l.id === id)) return;
            saveState(); // stash текущей локации
            activeLocationId = id;
            applyLocationState(id);
            saveState();
            location.reload();
        }

        function renderLocationSelector() {
            const sel = document.getElementById('location-selector');
            if (!sel) return;
            sel.innerHTML = locationsDB.map(l => `<option value="${l.id}"${l.id === activeLocationId ? ' selected' : ''}>${l.name}</option>`).join('');
            // Показываем селектор только если локаций больше одной
            sel.style.display = locationsDB.length > 1 ? '' : 'none';
        }

        function addLocation() {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const inp = document.getElementById('loc-new-name');
            const name = (inp.value || '').trim();
            if (!name) return;
            const id = 'loc_' + Date.now();
            locationsDB.push({ id, name });
            // Новая локация стартует с чистого состояния
            if (!locationData || typeof locationData !== 'object') locationData = {};
            locationData[id] = deepCopy(DEFAULT_LOCATION_STATE);
            markDirty();
            inp.value = '';
            renderLocationManager();
            renderLocationSelector();
            showNotification(t('notif_saved'));
        }

        function deleteLocation(id) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            if (locationsDB.length <= 1) { showNotification(t('loc_cant_delete_last')); return; }
            const loc = locationsDB.find(l => l.id === id);
            if (!loc) return;
            showConfirm(t('confirm_title'), t('loc_delete_confirm').replace('{name}', loc.name), () => {
                locationsDB = locationsDB.filter(l => l.id !== id);
                if (locationData && locationData[id]) delete locationData[id];
                markDirty();
                if (id === activeLocationId) {
                    activeLocationId = locationsDB[0].id;
                    saveState();
                    location.reload();
                } else {
                    renderLocationManager();
                    renderLocationSelector();
                }
            });
        }

        function renameLocation(id) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const loc = locationsDB.find(l => l.id === id);
            if (!loc) return;
            const row = document.getElementById('loc-row-' + id);
            row.innerHTML = `<div class="flex gap-2 flex-1">
                <input type="text" id="loc-rename-${id}" value="${escapeHtml(loc.name)}" class="flex-1 h-10 bg-[#2C2C2E] border border-white/10 rounded-xl px-3 text-white text-sm outline-none focus:border-teal-500">
                <button onclick="saveRenameLocation('${id}')" class="h-10 px-4 rounded-xl bg-teal-500 text-white text-sm font-medium">${t('save')}</button>
            </div>`;
            document.getElementById('loc-rename-' + id).focus();
        }

        function saveRenameLocation(id) {
            const loc = locationsDB.find(l => l.id === id);
            const inp = document.getElementById('loc-rename-' + id);
            if (loc && inp) {
                const name = inp.value.trim();
                if (name) loc.name = name;
                markDirty();
            }
            renderLocationManager();
            renderLocationSelector();
        }

        function renderLocationManager() {
            const box = document.getElementById('locations-list');
            if (!box) return;
            const isChef = currentAppRole === 'chef';
            box.innerHTML = locationsDB.map(l => `
                <div id="loc-row-${l.id}" class="flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        <i class="fa-solid fa-store text-teal-500/70 text-xs"></i>
                        <span class="text-sm text-white truncate">${l.name}</span>
                        ${l.id === activeLocationId ? `<span class="text-[10px] bg-teal-500/20 text-teal-400 px-2 py-0.5 rounded-full shrink-0">${t('loc_current')}</span>` : ''}
                    </div>
                    ${isChef ? `
                    <button onclick="switchLocation('${l.id}')" class="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition-colors shrink-0" ${l.id === activeLocationId ? 'disabled style="opacity:.3"' : ''}>${t('loc_open')}</button>
                    <button onclick="renameLocation('${l.id}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition-colors shrink-0"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteLocation('${l.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors shrink-0"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>`).join('');
            const addBox = document.getElementById('loc-add-block');
            if (addBox) addBox.style.display = isChef ? '' : 'none';
        }
