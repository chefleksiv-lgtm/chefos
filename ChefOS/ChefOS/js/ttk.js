        // --- БАЗА ТТК И РЕДАКТОР ---
        function openTTKModal() { document.getElementById('ttk-search').value = ''; toggleTTKFilter('dishes'); openModal('ttk-modal'); }
        function toggleTTKFilter(type) {
            activeTTKFilter = type;
            const bd = document.getElementById('filter-ttk-dishes'), bp = document.getElementById('filter-ttk-preps');
            const on = "h-8 px-4 rounded-full border border-blue-500 bg-blue-500/20 text-white text-xs font-medium transition-colors whitespace-nowrap";
            const off = "h-8 px-4 rounded-full border border-white/20 text-gray-300 text-xs font-medium hover:bg-white/10 transition-colors whitespace-nowrap";
            bd.className = type === 'dishes' ? on : off; bp.className = type === 'preps' ? on : off;
            const grid = document.getElementById('ttk-grid');
            if (grid) grid.classList.remove('hidden');
            filterTTK();
        }
        function filterTTK() {
            const q = document.getElementById('ttk-search').value.toLowerCase(), grid = document.getElementById('ttk-grid'); grid.innerHTML = '';
            let f = menuDB.filter(d => activeTTKFilter === 'dishes' ? d.type === 'dish' : d.type === 'prep');
            if(q) f = f.filter(d => d.name.toLowerCase().includes(q));
            f.forEach(d => {
                const badge = d.isTTKActive ? `<div class="absolute top-3 right-3 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-blue-700">${t('ttk_badge_menu')}</div>` : `<div class="absolute top-3 right-3 bg-gray-500 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-gray-700">${t('ttk_badge_prep')}</div>`;
                const fcInfo = currentAppRole === 'chef' ? `<span class="${d.targetFoodCost > 0 && (d.costPrice/d.menuPrice)*100 > d.targetFoodCost ? 'text-red-400' : 'text-green-400'}">FC: ${d.menuPrice>0?((d.costPrice/d.menuPrice)*100).toFixed(1):0}%</span>` : '';
                grid.innerHTML += `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl overflow-hidden cursor-pointer hover:border-blue-500/50 transition-colors group" onclick="openTTKDetails(${d.id})"><div class="h-32 w-full relative overflow-hidden"><img src="${escapeHtml(d.img)}" class="w-full h-full object-cover opacity-80 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500">${badge}</div><div class="p-4"><h3 class="font-semibold text-white leading-tight mb-2 truncate">${escapeHtml(d.name)}</h3><div class="flex justify-between text-xs text-gray-400"><span>${t('ttk_yield')} ${d.yield}${t('unit_g')}</span>${fcInfo}</div></div></div>`;
            });
        }

        function openTTKDetails(id) {
            if (currentViewingTTKId !== id) { activeTabs.ttk = 'assembly'; currentViewingTTKId = id; }
            const d = menuDB.find(i => i.id === id); if(!d) return;
            const c = document.getElementById('ttk-details-content'), hasSub = d.subRecipes && d.subRecipes.length > 0;
            const badge = d.isTTKActive ? `<div class="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-md mb-2 shadow-lg inline-block">${t('ttk_badge_menu')}</div>` : `<div class="bg-gray-500 text-white text-xs font-bold px-2.5 py-1 rounded-md mb-2 shadow-lg inline-block">${t('ttk_badge_prep')}</div>`;
            const fcPercent = d.menuPrice > 0 ? ((d.costPrice/d.menuPrice)*100).toFixed(1) : 0;
            
            let techPanel = '';
            if (currentAppRole === 'chef') {
                techPanel = `<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4"><div class="bg-[#1C1C1E] rounded-xl p-4 border border-white/5"><p class="text-xs text-gray-500 mb-1">${t('ttk_yield_lbl')}</p><p class="text-lg font-bold text-white">${d.yield} ${t('unit_g')}</p></div><div class="bg-[#1C1C1E] rounded-xl p-4 border border-white/5"><p class="text-xs text-gray-500 mb-1">${t('ttk_cost')}</p><p class="text-lg font-bold text-white">${currentCurrency}${d.costPrice}</p></div><div class="bg-[#1C1C1E] rounded-xl p-4 border border-white/5"><p class="text-xs text-gray-500 mb-1">${t('ttk_price')}</p><p class="text-lg font-bold text-white">${currentCurrency}${d.menuPrice}</p></div><div class="bg-[#1C1C1E] rounded-xl p-4 border border-white/5"><p class="text-xs text-gray-500 mb-1">${t('tile_fc')}</p><p class="text-lg font-bold ${fcPercent > d.targetFoodCost ? 'text-red-400' : 'text-green-400'}">${fcPercent}% <span class="text-[10px] text-gray-500 ml-1">${t('fc_target_lbl')} ${d.targetFoodCost}%</span></p></div></div><div class="grid grid-cols-4 gap-4 mt-4 bg-zinc-900 rounded-xl p-4 border border-white/5 text-center"><div class="border-r border-white/10"><p class="text-[10px] text-gray-500 uppercase">${t('ttk_cal')}</p><p class="font-semibold text-white">${d.calories}</p></div><div class="border-r border-white/10"><p class="text-[10px] text-gray-500 uppercase">${t('ttk_prot')}</p><p class="font-semibold text-blue-400">${d.protein}${t('unit_g')}</p></div><div class="border-r border-white/10"><p class="text-[10px] text-gray-500 uppercase">${t('ttk_fat')}</p><p class="font-semibold text-yellow-400">${d.fat}${t('unit_g')}</p></div><div><p class="text-[10px] text-gray-500 uppercase">${t('ttk_carb')}</p><p class="font-semibold text-green-400">${d.carbs}${t('unit_g')}</p></div></div>`;
            } else {
                techPanel = `<div class="bg-[#1C1C1E] rounded-xl p-4 border border-white/5 mt-4 max-w-xs"><p class="text-xs text-gray-500 mb-1">${t('ttk_yield_lbl')}</p><p class="text-lg font-bold text-white">${d.yield} ${t('unit_g')}</p></div>`;
            }

            let ingHtml = d.ingredients.map(i => `<div class="flex justify-between gap-2 border-b border-white/5 py-2 text-sm"><span class="text-gray-300 min-w-0 break-words">${i.name}</span><span class="font-medium text-white shrink-0">${i.weight}</span></div>`).join(''), stpHtml = d.steps.map((s, idx) => `<div class="flex gap-4 mb-4"><div class="w-6 h-6 shrink-0 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">${idx+1}</div><p class="text-sm text-gray-300 pt-0.5">${s}</p></div>`).join(''), tHtml='', subHtml='';

            // v1.6: авторасчёт себестоимости + масштабирование (только шеф)
            let costPanel = '';
            if (currentAppRole === 'chef') {
                const auto = costPerPortion(d);
                const miss = auto.missing.length ? `<p class="text-[11px] text-amber-400/80 mt-1">⚠ ${t('ttk_unknown_price')}: ${auto.missing.join(', ')}</p>` : '';
                costPanel = `<div class="bg-[#1C1C1E] rounded-2xl p-5 border border-white/5 mt-4"><div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-xs text-gray-500 mb-1">${t('ttk_auto_cost')}</p><p class="text-lg font-bold text-white">${currentCurrency}${trimNum(auto.perPortion)}</p>${miss}</div><button onclick="applyAutoCost(${d.id})" class="h-10 px-4 rounded-xl bg-blue-500/20 hover:bg-blue-500 text-blue-400 hover:text-white text-sm font-medium transition-colors"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i> ${t('ttk_apply_cost')}</button></div><div class="flex items-center gap-3 mt-4 pt-4 border-t border-white/5"><label class="text-xs text-gray-500 whitespace-nowrap">${t('ttk_scale_lbl')}</label><input type="number" min="1" value="1" id="ttk-scale-input-${d.id}" oninput="renderScaledLines(${d.id})" class="w-20 h-10 bg-[#2C2C2E] text-white rounded-xl px-3 outline-none text-sm focus:ring-2 focus:ring-blue-500 text-center"><span id="ttk-scaled-cost-${d.id}" class="ml-auto text-sm font-bold text-white"></span></div><div id="ttk-scaled-lines-${d.id}" class="mt-2"></div></div>`;
            }
            if(hasSub) {
                tHtml = `<div class="flex border-b border-white/10 mb-6" id="ttk-tabs-container"><button onclick="switchTTKTab('assembly')" id="ttk-tab-btn-assembly" class="px-6 py-3 text-sm font-medium border-b-2 ${activeTabs.ttk === 'assembly' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'} transition-colors">${t('ttk_assembly')}</button><button onclick="switchTTKTab('prep')" id="ttk-tab-btn-prep" class="px-6 py-3 text-sm font-medium border-b-2 ${activeTabs.ttk === 'prep' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'} transition-colors">${t('ttk_preps_tab')} <span class="bg-zinc-800 text-xs px-1.5 py-0.5 rounded ml-1">${d.subRecipes.length}</span></button></div>`;
                subHtml = `<div id="ttk-tab-prep" class="${activeTabs.ttk === 'prep' ? '' : 'hidden'} space-y-8">`; d.subRecipes.forEach(sub => { subHtml += `<div class="bg-[#1C1C1E] rounded-2xl p-6 border border-white/5"><div class="flex justify-between items-end mb-4 pb-4 border-b border-white/5"><h3 class="text-lg font-semibold text-white">${sub.name} <span class="text-xs text-gray-500 ml-2 font-normal">${t('ttk_yield')} ${sub.yield}</span></h3></div><div class="grid grid-cols-1 md:grid-cols-2 gap-8"><div><h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Состав</h4>${sub.ingredients.map(s => { const p = (typeof parseSubIngredient === 'function') ? parseSubIngredient(s) : null; const nm = p ? p.name : s.split(' ').slice(0, -1).join(' '); const wt = p ? (String(Math.round(p.qty * 100) / 100) + p.unit) : s.split(' ').pop(); return `<div class="text-sm text-gray-300 py-1 flex justify-between gap-2 border-b border-white/5 last:border-0"><span class="min-w-0 break-words">${nm}</span><span class="text-white shrink-0">${wt}</span></div>`; }).join('')}</div><div><h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Приготовление</h4>${sub.steps.map(s => `<p class="text-sm text-gray-300 mb-2 relative pl-4 before:content-['•'] before:absolute before:left-0 before:text-blue-500">${s}</p>`).join('')}</div></div></div>`; }); subHtml += `</div>`;
            }
            
            const ab = document.getElementById('ttk-action-buttons');
            if (currentAppRole === 'chef') {
                ab.innerHTML = `${d.type==='dish'?(d.isTTKActive?`<button onclick="toggleDishInMenu(${d.id})" class="h-10 px-4 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-sm font-medium transition-colors"><i class="fa-solid fa-minus mr-1"></i> ${t('ttk_remove_from_menu')}</button>`:`<button onclick="toggleDishInMenu(${d.id})" class="h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors shadow-lg shadow-orange-500/20"><i class="fa-solid fa-plus mr-1"></i> ${t('ttk_add_to_menu')}</button>`):''}<button onclick="openCookMode(${d.id})" class="h-10 px-4 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-medium transition-colors"><i class="fa-solid fa-kitchen-set mr-1"></i> ${t('cook_mode')}</button><button class="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors" onclick="openLabelModal('ttk', ${d.id})"><i class="fa-solid fa-tag mr-1"></i> ${t('label_btn')}</button><button onclick="printTTKSheet(${d.id})" class="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"><i class="fa-solid fa-print mr-1"></i> ${t('print')}</button><button id="edit-ttk-btn" class="h-10 px-4 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-500/20" onclick="openTTKEditor(${d.id})"><i class="fa-solid fa-pen mr-1"></i> ${t('edit')}</button><button onclick="deleteTTK(${d.id})" title="${t('ttk_delete_ttk')}" class="h-10 w-10 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-colors flex items-center justify-center"><i class="fa-solid fa-trash-can text-sm"></i></button>`;
            } else {
                ab.innerHTML = `<button onclick="openCookMode(${d.id})" class="h-10 px-4 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-medium transition-colors"><i class="fa-solid fa-kitchen-set mr-1"></i> ${t('cook_mode')}</button><button class="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors" onclick="openLabelModal('ttk', ${d.id})"><i class="fa-solid fa-tag mr-1"></i> ${t('label_btn')}</button><button onclick="printTTKSheet(${d.id})" class="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"><i class="fa-solid fa-print mr-1"></i> ${t('print')}</button>`;
            }
            
            c.innerHTML = `<div><div class="h-48 sm:h-64 w-full rounded-3xl overflow-hidden relative shadow-2xl"><img src="${escapeHtml(d.img)}" class="w-full h-full object-cover"><div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6"><div class="flex flex-col gap-2 items-start">${badge}<h2 class="text-2xl sm:text-3xl font-bold text-white shadow-sm leading-tight">${escapeHtml(d.name)}</h2>${allergenBadgesHTML(d, false)}</div></div></div>${techPanel}${costPanel}</div>${tHtml}<div id="ttk-tab-assembly" class="${activeTabs.ttk === 'assembly' ? '' : 'hidden'} grid grid-cols-1 md:grid-cols-2 gap-8"><div class="bg-[#1C1C1E] rounded-2xl p-6 border border-white/5"><h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">${t('ttk_ingr')}</h3>${ingHtml}</div><div><h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">${t('ttk_steps')}</h3>${stpHtml}</div></div>${subHtml}`;
            openModal('ttk-details-modal');
            if (currentAppRole === 'chef') renderScaledLines(id);
            if(hasSub && currentAppRole === 'chef') new Sortable(document.getElementById('ttk-tabs-container'), { animation: 150, delay: 200, delayOnTouchOnly: true });
        }
        function switchTTKTab(t) {
            activeTabs.ttk = t;
            const ta = document.getElementById('ttk-tab-assembly'), tp = document.getElementById('ttk-tab-prep'), ba = document.getElementById('ttk-tab-btn-assembly'), bp = document.getElementById('ttk-tab-btn-prep');
            if(t==='assembly') { 
                if(ta) ta.classList.remove('hidden'); 
                if(tp) tp.classList.add('hidden'); 
                if(ba) ba.className="px-6 py-3 text-sm font-medium border-b-2 border-blue-500 text-blue-500 transition-colors"; 
                if(bp) bp.className="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 transition-colors"; 
            } else { 
                if(ta) ta.classList.add('hidden'); 
                if(tp) tp.classList.remove('hidden'); 
                if(bp) bp.className="px-6 py-3 text-sm font-medium border-b-2 border-blue-500 text-blue-500 transition-colors"; 
                if(ba) ba.className="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 transition-colors"; 
            }
        }
        function toggleDishInMenu(id) {
            const d = menuDB.find(i => i.id === id); if(d) { d.isTTKActive = !d.isTTKActive; markDirty(); }
            openTTKDetails(id); filterTTK(); if(!document.getElementById('menu-modal').classList.contains('hidden')) filterMenu();
        }

        function previewTTKImage(e) {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader(); r.onload = function(ev) { currentTTKImageBase64 = ev.target.result; const p = document.getElementById('ttk-img-preview'); p.src = currentTTKImageBase64; p.classList.remove('hidden'); document.getElementById('ttk-img-icon').classList.add('hidden'); document.getElementById('ttk-img-text').classList.add('hidden'); }; r.readAsDataURL(f);
        }
        function openTTKEditor(id) {
            editingTTKId = id; document.getElementById('ttk-img-upload').value = ''; 
            const p = document.getElementById('ttk-img-preview'), ic = document.getElementById('ttk-img-icon'), tx = document.getElementById('ttk-img-text');
            
            const datalist = document.getElementById('inventory-names-list');
            if (datalist) {
                datalist.innerHTML = '';
                inventoryDB.forEach(ing => datalist.innerHTML += `<option value="${ing.name}">`);
            }

            if (id) {
                document.getElementById('ttk-edit-title').textContent = t('ttk_edit_title'); const d = menuDB.find(i => i.id === id);
                document.getElementById('edit-ttk-name').value = d.name; document.getElementById('edit-ttk-type').value = d.type; document.getElementById('edit-ttk-category').value = d.category||''; document.getElementById('edit-ttk-portions').value = d.portions||1; document.getElementById('edit-ttk-yield').value = d.yield||0; document.getElementById('edit-ttk-cost').value = d.costPrice||0; document.getElementById('edit-ttk-price').value = d.menuPrice||0; document.getElementById('edit-ttk-target-fc').value = d.targetFoodCost||30; document.getElementById('edit-ttk-cal').value = d.calories||0; document.getElementById('edit-ttk-prot').value = d.prot||0; document.getElementById('edit-ttk-fat').value = d.fat||0; document.getElementById('edit-ttk-carb').value = d.carbs||0;
                currentTTKImageBase64 = d.img; if(currentTTKImageBase64) { p.src = currentTTKImageBase64; p.classList.remove('hidden'); ic.classList.add('hidden'); tx.classList.add('hidden'); } else { p.src=''; p.classList.add('hidden'); ic.classList.remove('hidden'); tx.classList.remove('hidden'); }
                tempEditIngredients = JSON.parse(JSON.stringify(d.ingredients || []));
                tempEditSteps = JSON.parse(JSON.stringify(d.steps || []));
                tempEditModifiers = JSON.parse(JSON.stringify(d.modifiers || []));
            } else {
                document.getElementById('ttk-edit-title').textContent = t('ttk_create_title');
                document.getElementById('edit-ttk-name').value = ''; document.getElementById('edit-ttk-type').value = 'dish'; document.getElementById('edit-ttk-category').value = ''; document.getElementById('edit-ttk-portions').value = 1; document.getElementById('edit-ttk-yield').value = ''; document.getElementById('edit-ttk-cost').value = ''; document.getElementById('edit-ttk-price').value = ''; document.getElementById('edit-ttk-target-fc').value = 30; document.getElementById('edit-ttk-cal').value = ''; document.getElementById('edit-ttk-prot').value = ''; document.getElementById('edit-ttk-fat').value = ''; document.getElementById('edit-ttk-carb').value = '';
                currentTTKImageBase64 = ''; p.src=''; p.classList.add('hidden'); ic.classList.remove('hidden'); tx.classList.remove('hidden');
                tempEditIngredients = [];
                tempEditSteps = [];
                tempEditModifiers = [];
                document.getElementById('edit-ttk-ing-noscale').checked = false;
            }
            renderEditIngredients(); renderEditSteps(); renderEditModifiers();
            openModal('ttk-edit-modal');
        }

        function renderEditIngredients() {
            const list = document.getElementById('edit-ttk-ingredients-list'); list.innerHTML = '';
            tempEditIngredients.forEach((ing, idx) => {
                list.innerHTML += `<div class="flex justify-between items-center gap-2 bg-black/40 border border-white/5 p-2 rounded-lg"><span class="text-white text-sm min-w-0 flex-1 truncate" title="${ing.name} — ${ing.weight}"><span class="font-medium">${ing.name}</span> <span class="text-gray-500 ml-1">— ${ing.weight}</span></span><span class="flex items-center gap-1 shrink-0"><button onclick="toggleEditIngredientNoScale(${idx})" title="${t('ttk_no_scale')}" class="text-[10px] font-bold px-2 h-6 rounded-md transition-colors ${ing.noScale ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-500 hover:text-gray-300'}">${ing.noScale ? '1:1' : '×N'}</button><button onclick="removeEditIngredient(${idx})" class="text-red-400 hover:text-red-500 w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/5"><i class="fa-solid fa-xmark"></i></button></span></div>`;
            });
        }
        function addEditIngredient() {
            const name = document.getElementById('edit-ttk-ing-name').value.trim();
            const weight = document.getElementById('edit-ttk-ing-weight').value.trim();
            const noScale = document.getElementById('edit-ttk-ing-noscale').checked;
            if (name && weight) { tempEditIngredients.push({name, weight, noScale}); document.getElementById('edit-ttk-ing-name').value = ''; document.getElementById('edit-ttk-ing-weight').value = ''; document.getElementById('edit-ttk-ing-noscale').checked = false; renderEditIngredients(); }
        }
        function removeEditIngredient(idx) { tempEditIngredients.splice(idx, 1); renderEditIngredients(); }

        // Модификаторы блюда (v2.9): добавки, выбираемые на кассе
        let tempEditModifiers = [];
        function renderEditModifiers() {
            const list = document.getElementById('edit-ttk-modifiers-list'); if (!list) return; list.innerHTML = '';
            tempEditModifiers.forEach((m, idx) => {
                list.innerHTML += `<div class="flex justify-between items-center gap-2 bg-black/40 border border-white/5 p-2 rounded-lg"><span class="text-white text-sm min-w-0 flex-1 truncate"><span class="font-medium">${m.name}</span> <span class="text-emerald-400 ml-1">+${m.price}</span></span><button onclick="removeEditModifier(${idx})" class="text-red-400 hover:text-red-500 w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/5 shrink-0"><i class="fa-solid fa-xmark"></i></button></div>`;
            });
        }
        function addEditModifier() {
            const nameEl = document.getElementById('edit-ttk-mod-name');
            const priceEl = document.getElementById('edit-ttk-mod-price');
            const name = nameEl.value.trim();
            const price = Math.round((parseFloat(priceEl.value) || 0) * 100) / 100;
            if (name) { tempEditModifiers.push({ id: Date.now() + Math.floor(Math.random() * 1000), name, price }); nameEl.value = ''; priceEl.value = ''; renderEditModifiers(); }
        }
        function removeEditModifier(idx) { tempEditModifiers.splice(idx, 1); renderEditModifiers(); }

        function renderEditSteps() {
            const list = document.getElementById('edit-ttk-steps-list'); list.innerHTML = '';
            tempEditSteps.forEach((step, idx) => {
                list.innerHTML += `<div class="flex gap-3 bg-black/40 border border-white/5 p-2.5 rounded-lg"><span class="w-5 h-5 shrink-0 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs font-bold">${idx+1}</span><p class="text-white text-sm flex-1 pt-0.5">${step}</p><button onclick="removeEditStep(${idx})" class="text-red-400 hover:text-red-500 w-6 h-6 flex items-center justify-center shrink-0 rounded-md hover:bg-white/5"><i class="fa-solid fa-xmark"></i></button></div>`;
            });
        }
        function addEditStep() {
            const step = document.getElementById('edit-ttk-step-text').value.trim();
            if (step) { tempEditSteps.push(step); document.getElementById('edit-ttk-step-text').value = ''; renderEditSteps(); }
        }
        function removeEditStep(idx) { tempEditSteps.splice(idx, 1); renderEditSteps(); }

        function saveTTKChanges() {
            const n = document.getElementById('edit-ttk-name').value.trim(); if(!n) { showNotification(t('notif_enter_name')); return; }
            const img = currentTTKImageBase64 || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800'; 
            const type = document.getElementById('edit-ttk-type').value;
            const portions = parseInt(document.getElementById('edit-ttk-portions').value)||1;
            let costInput = parseFloat(document.getElementById('edit-ttk-cost').value) || 0;
            // v2.1: себестоимость не введена вручную — считаем автоматически из ингредиентов.
            // Раньше новая ТТК сохранялась с C$0 (FC 0.0%) до ручного «Применить».
            if (!(costInput > 0) && typeof costPerPortion === 'function') {
                const existing = editingTTKId ? menuDB.find(i => i.id === editingTTKId) : null;
                const auto = costPerPortion({ type, portions, ingredients: [...tempEditIngredients], subRecipes: (existing && existing.subRecipes) || [] }).perPortion;
                if (auto > 0) costInput = Math.round(auto * 100) / 100;
            }
            const data = { name: n, type: type, category: document.getElementById('edit-ttk-category').value, portions: portions, yield: parseInt(document.getElementById('edit-ttk-yield').value)||0, costPrice: costInput, menuPrice: parseFloat(document.getElementById('edit-ttk-price').value)||0, targetFoodCost: parseFloat(document.getElementById('edit-ttk-target-fc').value)||30, calories: parseInt(document.getElementById('edit-ttk-cal').value)||0, protein: parseInt(document.getElementById('edit-ttk-prot').value)||0, fat: parseInt(document.getElementById('edit-ttk-fat').value)||0, carbs: parseInt(document.getElementById('edit-ttk-carb').value)||0, img: img, ingredients: [...tempEditIngredients], steps: [...tempEditSteps], modifiers: [...tempEditModifiers] };
            if (editingTTKId) { const d = menuDB.find(i => i.id === editingTTKId); if(d) Object.assign(d, data); openTTKDetails(editingTTKId); } 
            else { menuDB.push({ id: Date.now(), isTTKActive: false, status: 'in_stock', glutenFree: false, lactoseFree: false, subRecipes: [], ...data }); }
            markDirty();
            filterTTK(); if(!document.getElementById('menu-modal').classList.contains('hidden')) filterMenu(); 
            closeModal('ttk-edit-modal'); showNotification(t('notif_ttk_saved'));
        }


        // --- АВТОКОСТИНГ + МАСШТАБИРОВАНИЕ В КАРТОЧКЕ ТТК (v1.6) ---
        function applyAutoCost(id) {
            const d = menuDB.find(i => i.id === id); if (!d) return;
            d.costPrice = Math.round(costPerPortion(d).perPortion * 100) / 100;
            markDirty();
            openTTKDetails(id); filterTTK();
            if (!document.getElementById('menu-modal').classList.contains('hidden')) filterMenu();
            showNotification(t('ttk_cost_applied'));
        }
        // --- Удаление ТТК (блюда и заготовки) — только с предупреждающим окном, только шеф ---
        function deleteTTK(id) {
            const d = menuDB.find(i => i.id === id); if (!d) return;
            showConfirm(t('ttk_delete_ttk'), '\u00AB' + d.name + '\u00BB ' + t('ttk_delete_warn'), () => {
                const i = menuDB.findIndex(x => x.id === id);
                if (i >= 0) menuDB.splice(i, 1);
                markDirty();
                closeModal('ttk-details-modal');
                filterTTK();
                if (!document.getElementById('menu-modal').classList.contains('hidden') && typeof filterMenu === 'function') filterMenu();
                showNotification(t('ttk_deleted'));
            });
        }
        function renderScaledLines(id) {
            const d = menuDB.find(i => i.id === id); if (!d) return;
            const inp = document.getElementById(`ttk-scale-input-${id}`);
            const n = Math.max(1, parseInt(inp.value) || 1);
            const c = costOfDish(d);
            const factor = (d.type === 'prep' && d.portions > 0) ? n / d.portions : n;
            const scaledRow = (l, f) => {
                const badge = l.noScale ? `<span class="text-[9px] text-gray-500 border border-white/10 rounded px-1 ml-1">1:1</span>` : '';
                const noPrice = l.found ? '' : ` <span class="text-[10px] text-amber-400">(${t('ttk_unknown_price')})</span>`;
                return `<div class="flex justify-between gap-2 border-b border-white/5 py-1.5 text-sm"><span class="text-gray-300 min-w-0 break-words">${l.name}${badge}${noPrice}</span><span class="font-medium text-white whitespace-nowrap shrink-0">${formatQty(l.qty * f, l.unit)}</span></div>`;
            };
            let html = '';
            c.lines.forEach(l => {
                if (l.isSub && l.subLines) {
                    html += `<p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-1">${l.name}</p>`;
                    l.subLines.forEach(sl => { html += scaledRow(sl, factor); });
                } else if (l.qty !== null) html += scaledRow(l, l.noScale ? 1 : factor);
            });
            document.getElementById(`ttk-scaled-lines-${id}`).innerHTML = html;
            document.getElementById(`ttk-scaled-cost-${id}`).textContent = `${t('ttk_scaled_cost')} ${currentCurrency}${trimNum(c.total * factor)}`;
        }
        function toggleEditIngredientNoScale(idx) { tempEditIngredients[idx].noScale = !tempEditIngredients[idx].noScale; renderEditIngredients(); }

        // --- ПЕЧАТЬ ТТК (v1.9.1): готовый лист техкарты ---
        // Карточка всегда открывается с сохранёнными данными (редактор пишет в menuDB через saveTTKChanges + markDirty).
        // Сначала спрашиваем галочки (себестоимость/КБЖУ), потом строим лист с фото и сразу вызываем window.print().
        let pendingPrintTTKId = null;
        function printTTKSheet(id) {
            pendingPrintTTKId = id;
            // Себестоимость — только для шефа, остальным галочку не показываем
            const costRow = document.getElementById('ttk-print-cost-row');
            if (costRow) costRow.style.display = currentAppRole === 'chef' ? '' : 'none';
            openModal('ttk-print-modal');
        }
        function confirmTTKPrint() {
            const d = menuDB.find(i => i.id === pendingPrintTTKId); pendingPrintTTKId = null;
            closeModal('ttk-print-modal');
            if (!d) return;
            const wantCost = currentAppRole === 'chef' && document.getElementById('ttk-print-cost').checked;
            const wantNutrition = document.getElementById('ttk-print-nutrition').checked;
            const alg = allergensOfDish(d);
            const ingRows = (d.ingredients || []).map(i => `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd;">${i.name}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right;">${i.weight}</td></tr>`).join('');
            const stepRows = (d.steps || []).map((s, idx) => `<div style="margin-bottom:6px;font-size:13px;"><b>${idx + 1}.</b> ${s}</div>`).join('');
            let subHtml = '';
            (d.subRecipes || []).forEach(sub => {
                subHtml += `<h3 style="font-size:15px;margin:14px 0 6px;">${sub.name} <span style="font-weight:normal;font-size:12px;">(${t('ttk_yield')} ${sub.yield})</span></h3>`;
                subHtml += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:6px;"><tbody>${(sub.ingredients || []).map(i => `<tr><td style="padding:3px 8px;border-bottom:1px solid #ddd;">${i}</td></tr>`).join('')}</tbody></table>`;
                subHtml += (sub.steps || []).map((s, idx) => `<div style="margin-bottom:4px;font-size:13px;"><b>${idx + 1}.</b> ${s}</div>`).join('');
            });
            const costHtml = wantCost ? `<div style="margin-top:10px;font-size:13px;"><b>${t('ttk_cost')}:</b> ${currentCurrency}${d.costPrice} &nbsp; <b>${t('ttk_price')}:</b> ${currentCurrency}${d.menuPrice} &nbsp; <b>${t('tile_fc')}:</b> ${d.menuPrice > 0 ? ((d.costPrice / d.menuPrice) * 100).toFixed(1) : 0}%</div>` : '';
            const nutrHtml = wantNutrition ? `<div style="margin-top:8px;font-size:13px;"><b>${t('ttk_cal')}:</b> ${d.calories || 0} · <b>${t('ttk_prot')}:</b> ${d.protein || 0}${t('unit_g')} · <b>${t('ttk_fat')}:</b> ${d.fat || 0}${t('unit_g')} · <b>${t('ttk_carb')}:</b> ${d.carbs || 0}${t('unit_g')}</div>` : '';
            const photoHtml = d.img ? `<img src="${d.img}" style="width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin-bottom:12px;">` : '';
            const today = new Date().toLocaleDateString();
            document.getElementById('print-area').innerHTML = `
                <div style="font-family:Arial,sans-serif;color:#000;background:#fff;padding:20px;max-width:700px;">
                    ${photoHtml}
                    <div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;">
                        <div style="font-size:22px;font-weight:bold;">${escapeHtml(d.name)}</div>
                        <div style="font-size:12px;color:#333;">${t('ttk_yield_lbl')}: ${d.yield} ${t('unit_g')} · ${t('ttk_portions')}: ${d.portions || 1} · ${today}</div>
                    </div>
                    ${alg.length ? `<div style="font-size:12px;margin-bottom:10px;"><b>${t('label_allergens')}:</b> ${alg.map(a => t('alg_' + a)).join(', ')}</div>` : ''}
                    <h3 style="font-size:15px;margin:0 0 6px;">${t('ttk_ingr')}</h3>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;"><tbody>${ingRows}</tbody></table>
                    <h3 style="font-size:15px;margin:0 0 6px;">${t('ttk_steps')}</h3>
                    ${stepRows}
                    ${subHtml}
                    ${nutrHtml}
                    ${costHtml}
                    <div style="font-size:10px;color:#555;margin-top:14px;">ChefOS</div>
                </div>`;
            setTimeout(() => window.print(), 50);
        }
