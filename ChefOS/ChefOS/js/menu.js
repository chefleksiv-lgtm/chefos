        // --- МЕНЮ ---
        function openMenuModal() { document.getElementById('menu-kitchen-subtitle').textContent = t(activeKitchen); document.getElementById('menu-search').value = ''; if (!_dropdowns['menu-allergen-dd']) ddBuild('menu-allergen-dd', { options: menuAllergenOptions(), value: activeMenuFilters.allergen || '', placeholder: t('menu_no_allergen'), onChange: setMenuAllergenFilter }); else syncMenuAllergenDropdown(); filterMenu(); openModal('menu-modal'); }
        function toggleFilter(filter) { activeMenuFilters[filter] = !activeMenuFilters[filter]; const b = document.getElementById(`filter-${filter}`); if(activeMenuFilters[filter]) { b.className = "h-8 px-4 rounded-full border border-orange-500 bg-orange-500/20 text-white text-xs font-medium transition-colors whitespace-nowrap"; } else { b.className = "h-8 px-4 rounded-full border border-white/20 text-gray-300 text-xs font-medium hover:bg-white/10 transition-colors whitespace-nowrap"; } filterMenu(); }
        function setMenuAllergenFilter(v) { activeMenuFilters.allergen = v || ''; filterMenu(); }
        function filterMenu() {
            const q = document.getElementById('menu-search').value.toLowerCase(), grid = document.getElementById('menu-grid'); grid.innerHTML = '';
            let f = menuDB.filter(d => d.type === 'dish' && d.isTTKActive);
            if(activeKitchen !== kitchens[0]) f = f.filter(d => d.category === activeKitchen);
            if(q) f = f.filter(d => d.name.toLowerCase().includes(q));
            if(activeMenuFilters.gluten) f = f.filter(d => d.glutenFree);
            if(activeMenuFilters.lactose) f = f.filter(d => d.lactoseFree);
            if(activeMenuFilters.allergen) f = f.filter(d => !allergensOfDish(d).includes(activeMenuFilters.allergen));
            f.forEach(d => {
                let sHtml = '';
                if (currentAppRole !== 'cashier') {
                    sHtml = d.status==='in_stock'?'<div class="absolute top-3 right-3 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-900 shadow-sm" title="'+t('menu_in_stock')+'"></div>':d.status==='low'?'<div class="absolute top-3 right-3 w-3 h-3 bg-yellow-500 rounded-full border-2 border-zinc-900 shadow-sm" title="'+t('menu_low')+'"></div>':'<div class="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-red-700">'+t('menu_stop')+'</div>';
                }
                const priceEdit = currentAppRole === 'chef'
                    ? `<button onclick="editDishPrice(event, ${d.id})" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors" title="Изменить цену"><i class="fa-solid fa-pen text-xs"></i></button>`
                    : '';
                let fcBadge = '';
                if (currentAppRole === 'chef' && d.targetFoodCost > 0) {
                    const fcPct = dishFoodCostPct(d);
                    fcBadge = `<span class="text-[10px] font-bold ${fcPct > d.targetFoodCost ? 'text-red-400' : 'text-green-400'}">FC ${fcPct.toFixed(1)}%</span>`;
                }
                const algBadges = allergenBadgesHTML(d, true);
                // v1.9: цену блюда видят только chef и cashier (PERMISSIONS.seeMenuPrices)
                const priceHtml = rolePerm(currentAppRole, 'seeMenuPrices')
                    ? `<span id="menu-price-${d.id}" class="text-emerald-400 font-bold">${currentCurrency}${d.menuPrice || 0}</span>`
                    : `<span class="text-gray-600 font-bold">—</span>`;
                grid.innerHTML += `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl overflow-hidden cursor-pointer hover:border-orange-500/50 transition-colors group" onclick="openDishDetails(${d.id})"><div class="h-32 w-full relative overflow-hidden"><img src="${d.img}" class="w-full h-full object-cover opacity-80 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500">${sHtml}</div><div class="p-4"><h3 class="font-semibold text-white leading-tight mb-1">${d.name}</h3>${algBadges}<div class="flex items-center justify-between mt-2"><span class="flex items-center gap-2">${priceHtml}${fcBadge}</span>${priceEdit}</div></div></div>`;
            });
            if(f.length === 0) grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10">${t('menu_not_found')}</div>`;
        }
        function openDishDetails(id) {
            if (currentViewingDishId !== id) { activeTabs.dish = 'assembly'; currentViewingDishId = id; }
            const d = menuDB.find(i => i.id === id); if(!d) return; const c = document.getElementById('dish-content'); const hasSub = d.subRecipes && d.subRecipes.length > 0;
            
            let statusBtns = '';
            if (currentAppRole !== 'cashier') {
                statusBtns = `<div class="flex bg-black rounded-xl p-1 w-full max-w-sm mt-4 border border-white/10"><button onclick="changeDishStatus(${id}, 'in_stock', event)" class="flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${d.status==='in_stock'?'bg-zinc-800 text-green-400 shadow-sm':'text-gray-500 hover:text-white'}">${t('menu_in_stock')}</button><button onclick="changeDishStatus(${id}, 'low', event)" class="flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${d.status==='low'?'bg-zinc-800 text-yellow-500 shadow-sm':'text-gray-500 hover:text-white'}">${t('menu_low')}</button><button onclick="changeDishStatus(${id}, 'stop', event)" class="flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${d.status==='stop'?'bg-red-500/20 text-red-500 shadow-sm':'text-gray-500 hover:text-red-400'}">${t('menu_stop')}</button></div>`;
            }

            let ingHtml = d.ingredients.map(i => `<div class="flex justify-between border-b border-white/5 py-2 text-sm"><span class="text-gray-300">${i.name}</span><span class="font-medium text-white">${i.weight}</span></div>`).join(''), stpHtml = d.steps.map((s, idx) => `<div class="flex gap-4 mb-4"><div class="w-6 h-6 shrink-0 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center text-xs font-bold">${idx+1}</div><p class="text-sm text-gray-300 pt-0.5">${s}</p></div>`).join(''), tHtml='', subHtml='';
            
            if(hasSub && currentAppRole !== 'cashier') {
                tHtml = `<div class="flex border-b border-white/10 mb-6" id="dish-tabs-container"><button onclick="switchDishTab('assembly')" id="tab-btn-assembly" class="px-6 py-3 text-sm font-medium border-b-2 ${activeTabs.dish === 'assembly' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-300'} transition-colors">${t('ttk_assembly')}</button><button onclick="switchDishTab('prep')" id="tab-btn-prep" class="px-6 py-3 text-sm font-medium border-b-2 ${activeTabs.dish === 'prep' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-300'} transition-colors">${t('ttk_preps_tab')} <span class="bg-zinc-800 text-xs px-1.5 py-0.5 rounded ml-1">${d.subRecipes.length}</span></button></div>`;
                subHtml = `<div id="dish-tab-prep" class="${activeTabs.dish === 'prep' ? '' : 'hidden'} space-y-8">`; d.subRecipes.forEach(sub => { subHtml += `<div class="bg-[#1C1C1E] rounded-2xl p-6 border border-white/5"><div class="flex justify-between items-end mb-4 pb-4 border-b border-white/5"><h3 class="text-lg font-semibold text-white">${escapeHtml(sub.name)}</h3></div><div class="grid grid-cols-1 md:grid-cols-2 gap-8"><div><h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Состав</h4>${sub.ingredients.map(i => `<div class="text-sm text-gray-300 py-1 flex justify-between border-b border-white/5 last:border-0"><span>${escapeHtml(i.split(' ')[0])}</span><span class="text-white">${escapeHtml(i.split(' ').pop())}</span></div>`).join('')}</div><div><h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Приготовление</h4>${sub.steps.map(s => `<p class="text-sm text-gray-300 mb-2 relative pl-4 before:content-['•'] before:absolute before:left-0 before:text-orange-500">${escapeHtml(s)}</p>`).join('')}</div></div></div>`; }); subHtml += `</div>`;
            }
            c.innerHTML = `<div><div class="h-48 sm:h-64 w-full rounded-3xl overflow-hidden relative shadow-2xl"><img src="${escapeHtml(d.img)}" class="w-full h-full object-cover"><div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6"><h2 class="text-2xl sm:text-3xl font-bold text-white shadow-sm leading-tight">${escapeHtml(d.name)}</h2></div></div>${statusBtns}${allergenBadgesHTML(d, false)}</div>${tHtml}<div id="dish-tab-assembly" class="${activeTabs.dish === 'assembly' || currentAppRole === 'cashier' ? '' : 'hidden'} grid grid-cols-1 md:grid-cols-2 gap-8"><div class="bg-[#1C1C1E] rounded-2xl p-6 border border-white/5"><h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">${t('ttk_ingr')}</h3>${ingHtml}</div><div><h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">${t('ttk_steps')}</h3>${stpHtml}</div></div>${subHtml}`;
            openModal('dish-modal');
            if(hasSub && currentAppRole !== 'cashier') new Sortable(document.getElementById('dish-tabs-container'), { animation: 150, delay: 200, delayOnTouchOnly: true });
        }
        function switchDishTab(t) {
            activeTabs.dish = t;
            const ta = document.getElementById('dish-tab-assembly'), tp = document.getElementById('dish-tab-prep'), ba = document.getElementById('tab-btn-assembly'), bp = document.getElementById('tab-btn-prep');
            if(t==='assembly') { 
                if(ta) ta.classList.remove('hidden'); 
                if(tp) tp.classList.add('hidden'); 
                if(ba) ba.className="px-6 py-3 text-sm font-medium border-b-2 border-orange-500 text-orange-500 transition-colors"; 
                if(bp) bp.className="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 transition-colors"; 
            } else { 
                if(ta) ta.classList.add('hidden'); 
                if(tp) tp.classList.remove('hidden'); 
                if(bp) bp.className="px-6 py-3 text-sm font-medium border-b-2 border-orange-500 text-orange-500 transition-colors"; 
                if(ba) ba.className="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-300 transition-colors"; 
            }
        }
        // Цена блюда прямо в «Актуальном меню» (только шеф). Касса подтягивает её в продажах.
        function editDishPrice(e, id) {
            e.stopPropagation();
            if (currentAppRole !== 'chef') return;
            const d = menuDB.find(i => i.id === id); if (!d) return;
            const span = document.getElementById(`menu-price-${id}`);
            if (!span || span.dataset.editing) return;
            span.dataset.editing = '1';
            span.innerHTML = `<input id="menu-price-input-${id}" type="number" min="0" step="1" value="${d.menuPrice || 0}" class="w-20 h-8 bg-[#2C2C2E] text-white rounded-lg px-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 font-bold">`;
            const input = document.getElementById(`menu-price-input-${id}`);
            if (!input) return;
            input.focus(); input.select();
            let done = false;
            const save = () => {
                if (done) return; done = true;
                const v = parseFloat(input.value);
                if (!isNaN(v) && v >= 0) { d.menuPrice = Math.round(v * 100) / 100; markDirty(); }
                filterMenu();
            };
            input.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') save(); });
            input.addEventListener('blur', save);
            input.addEventListener('click', ev => ev.stopPropagation());
        }
        function changeDishStatus(id, s, e) {            const d = menuDB.find(i => i.id === id); if(d) { d.status = s; markDirty(); }
            const b = e.currentTarget.parentElement.children;
            b[0].className=`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${s==='in_stock'?'bg-zinc-800 text-green-400 shadow-sm':'text-gray-500 hover:text-white'}`;
            b[1].className=`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${s==='low'?'bg-zinc-800 text-yellow-500 shadow-sm':'text-gray-500 hover:text-white'}`;
            b[2].className=`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${s==='stop'?'bg-red-500/20 text-red-500 shadow-sm':'text-gray-500 hover:text-red-400'}`;
            filterMenu(); 
        }

