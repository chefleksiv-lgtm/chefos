        // --- КАСТОМНЫЕ UI-КОМПОНЕНТЫ в стиле приложения ---
        // Тёмный дропдаун-пилюля. Нативный <select> рисует белый список средствами ОС —
        // этот компонент держит всё в DOM и наследует тёмную тему.
        //
        // ddBuild(mountId, { options: [{value, label}], value, onChange, placeholder, activeClass })
        // ddGet(id) -> текущее value | ddSet(id, value) | ddSetOptions(id, options, value)
        const _dropdowns = {};
        let _ddGlobalHook = false;

        function ddBuild(mountId, cfg) {
            const mount = document.getElementById(mountId);
            if (!mount) return null;
            const id = mountId;
            const st = { options: cfg.options || [], value: cfg.value !== undefined ? cfg.value : '', onChange: cfg.onChange || null, placeholder: cfg.placeholder || '', btnClass: cfg.btnClass || '', open: false };
            _dropdowns[id] = st;

            mount.innerHTML = `
                <div class="dd-root relative" id="dd-root-${id}">
                    <button type="button" id="dd-btn-${id}" class="h-8 px-3 rounded-full border border-white/20 text-xs font-medium text-gray-300 bg-[#1C1C1E] hover:bg-white/10 transition-colors whitespace-nowrap flex items-center gap-2 outline-none ${st.btnClass}">
                        <span id="dd-label-${id}"></span>
                        <i class="fa-solid fa-chevron-down text-[10px] text-gray-500 transition-transform" id="dd-chev-${id}"></i>
                    </button>
                    <div id="dd-list-${id}" class="hidden absolute z-[80] mt-2 left-0 min-w-[180px] max-h-64 overflow-y-auto bg-[#2C2C2E] border border-white/10 rounded-xl shadow-2xl shadow-black/60 py-1"></div>
                </div>`;
            ddRenderList(id);
            ddSyncLabel(id);

            document.getElementById(`dd-btn-${id}`).addEventListener('click', (e) => { e.stopPropagation(); ddToggle(id); });

            if (!_ddGlobalHook) {
                _ddGlobalHook = true;
                document.addEventListener('click', () => ddCloseAll());
                document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ddCloseAll(); });
            }
            return id;
        }

        function ddRenderList(id) {
            const st = _dropdowns[id]; if (!st) return;
            const list = document.getElementById(`dd-list-${id}`); if (!list) return;
            list.innerHTML = st.options.map(o => `
                <button type="button" data-dd-val="${String(o.value).replace(/"/g, '&quot;')}" class="dd-opt w-full text-left px-4 py-2.5 text-sm transition-colors ${String(o.value) === String(st.value) ? 'bg-white/10 text-white font-medium' : 'text-gray-300 hover:bg-white/5 hover:text-white'}">${o.label}</button>
            `).join('');
            list.querySelectorAll('.dd-opt').forEach(b => b.addEventListener('click', (e) => {
                e.stopPropagation();
                ddSet(id, b.getAttribute('data-dd-val'));
                ddCloseAll();
                if (st.onChange) st.onChange(st.value);
            }));
        }

        function ddSyncLabel(id) {
            const st = _dropdowns[id]; if (!st) return;
            const labelEl = document.getElementById(`dd-label-${id}`), btn = document.getElementById(`dd-btn-${id}`);
            if (!labelEl || !btn) return;
            const opt = st.options.find(o => String(o.value) === String(st.value));
            labelEl.textContent = opt ? opt.label : (st.placeholder || '');
            // Активное значение (не пустое) подсвечиваем как активную пилюлю
            const active = String(st.value) !== '';
            btn.classList.toggle('border-orange-500', active);
            btn.classList.toggle('bg-orange-500/20', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('border-white/20', !active);
            btn.classList.toggle('text-gray-300', !active);
        }

        function ddToggle(id) {
            const st = _dropdowns[id]; if (!st) return;
            const willOpen = !st.open;
            ddCloseAll();
            if (willOpen) {
                st.open = true;
                document.getElementById(`dd-list-${id}`).classList.remove('hidden');
                const chev = document.getElementById(`dd-chev-${id}`); if (chev) chev.style.transform = 'rotate(180deg)';
            }
        }

        function ddCloseAll() {
            for (const id in _dropdowns) {
                const st = _dropdowns[id]; if (!st.open) continue;
                st.open = false;
                const list = document.getElementById(`dd-list-${id}`); if (list) list.classList.add('hidden');
                const chev = document.getElementById(`dd-chev-${id}`); if (chev) chev.style.transform = '';
            }
        }

        function ddGet(id) { return _dropdowns[id] ? _dropdowns[id].value : null; }
        function ddSet(id, value) {
            const st = _dropdowns[id]; if (!st) return;
            st.value = value === undefined || value === null ? '' : String(value);
            ddRenderList(id);
            ddSyncLabel(id);
        }
        function ddSetOptions(id, options, value) {
            const st = _dropdowns[id]; if (!st) return;
            st.options = options || [];
            if (value !== undefined) st.value = String(value);
            ddRenderList(id);
            ddSyncLabel(id);
        }

        // Опции фильтра аллергенов для меню (перестраиваются при смене языка)
        function menuAllergenOptions() {
            return [
                { value: '', label: t('menu_no_allergen') },
                { value: 'milk', label: t('alg_milk') },
                { value: 'eggs', label: t('alg_eggs') },
                { value: 'fish', label: t('alg_fish') },
                { value: 'shellfish', label: t('alg_shellfish') },
                { value: 'nuts', label: t('alg_nuts') },
                { value: 'peanuts', label: t('alg_peanuts') },
                { value: 'wheat', label: t('alg_wheat') },
                { value: 'soy', label: t('alg_soy') },
                { value: 'sesame', label: t('alg_sesame') },
            ];
        }
        function syncMenuAllergenDropdown() {
            if (_dropdowns['menu-allergen-dd']) {
                ddSetOptions('menu-allergen-dd', menuAllergenOptions(), activeMenuFilters.allergen || '');
            }
        }
