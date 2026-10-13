        // --- FOOD SAFETY (v2.2): температурный журнал + HACCP-чеклисты ---
        let fsTab = 'temp';

        function openFoodSafetyModal() {
            switchFSTab('temp');
            openModal('food-safety-modal');
        }
        function switchFSTab(tab) {
            fsTab = tab;
            ['temp', 'check'].forEach(i => {
                const btn = document.getElementById(`fs-tab-btn-${i}`);
                const content = document.getElementById(`fs-tab-${i}`);
                if (btn) btn.className = `px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${i === tab ? 'border-lime-500 text-lime-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`;
                if (content) content.classList.toggle('hidden', i !== tab);
            });
            if (tab === 'temp') renderFSTemp();
            if (tab === 'check') renderFSCheck();
        }
        function fsDateKey(inputId) {
            const inp = document.getElementById(inputId);
            if (inp && inp.value) return inp.value;
            return new Date().toISOString().slice(0, 10);
        }
        // --- Точки контроля ---
        function addFSPoint() {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const name = (document.getElementById('fs-point-name').value || '').trim();
            if (!name) return;
            const min = parseFloat(document.getElementById('fs-point-min').value);
            const max = parseFloat(document.getElementById('fs-point-max').value);
            if (!Array.isArray(fsPointsDB)) fsPointsDB = [];
            fsPointsDB.push({ id: Date.now(), name, min: isNaN(min) ? null : min, max: isNaN(max) ? null : max });
            document.getElementById('fs-point-name').value = '';
            document.getElementById('fs-point-min').value = '';
            document.getElementById('fs-point-max').value = '';
            markDirty();
            renderFSTemp();
        }
        function deleteFSPoint(id) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            fsPointsDB = fsPointsDB.filter(p => p.id !== id);
            markDirty();
            renderFSTemp();
        }
        function fsTempOk(point, temp) {
            if (point.min !== null && point.min !== undefined && temp < point.min) return false;
            if (point.max !== null && point.max !== undefined && temp > point.max) return false;
            return true;
        }
        function logTemp(pointId) {
            const inp = document.getElementById('fs-temp-' + pointId);
            const temp = parseFloat((inp.value || '').replace(',', '.'));
            if (isNaN(temp)) return;
            const point = fsPointsDB.find(p => p.id === pointId);
            if (!Array.isArray(fsTempDB)) fsTempDB = [];
            const now = new Date();
            fsTempDB.unshift({
                id: Date.now(), date: fsDateKey('fs-temp-date'),
                time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
                pointId, pointName: point ? point.name : '', temp: Math.round(temp * 10) / 10, note: ''
            });
            markDirty();
            renderFSTemp();
        }
        function deleteTempEntry(id) {
            fsTempDB = fsTempDB.filter(e => e.id !== id);
            markDirty();
            renderFSTemp();
        }
        function renderFSTemp() {
            if (!Array.isArray(fsPointsDB)) fsPointsDB = [];
            if (!Array.isArray(fsTempDB)) fsTempDB = [];
            const key = fsDateKey('fs-temp-date');
            const dateInp = document.getElementById('fs-temp-date');
            const today = new Date().toISOString().slice(0, 10);
            if (dateInp && !dateInp.value) dateInp.value = today;
            const isChef = currentAppRole === 'chef';
            const isToday = key === today;
            // Карточки точек: последний замер за день + быстрый ввод
            const pointsHtml = fsPointsDB.length ? fsPointsDB.map(p => {
                const entries = fsTempDB.filter(e => e.pointId === p.id && e.date === key);
                const last = entries[0];
                const range = (p.min !== null && p.min !== undefined) || (p.max !== null && p.max !== undefined)
                    ? `<span class="text-[10px] text-gray-500">${p.min ?? '–'}…${p.max ?? '–'}°C</span>` : '';
                const lastBadge = last
                    ? `<span class="text-sm font-bold ${fsTempOk(p, last.temp) ? 'text-green-400' : 'text-red-400'}">${last.temp}°C <span class="text-[10px] text-gray-500 font-normal">${last.time}</span></span>`
                    : `<span class="text-xs text-gray-600">${t('fs_no_data')}</span>`;
                return `<div class="bg-black/30 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-1">
                        <p class="text-sm font-semibold text-white truncate mr-2">${p.name}</p>
                        ${isChef ? `<button onclick="deleteFSPoint(${p.id})" class="text-red-400/50 hover:text-red-400 text-xs shrink-0"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                    <div class="flex items-center justify-between mb-3">${range}${lastBadge}</div>
                    ${isToday ? `<div class="flex gap-2">
                        <input type="number" id="fs-temp-${p.id}" step="0.1" placeholder="°C" class="flex-1 min-w-0 h-10 bg-[#2C2C2E] border border-white/10 rounded-xl px-3 text-white text-sm outline-none focus:border-lime-500">
                        <button onclick="logTemp(${p.id})" class="h-10 px-4 rounded-xl bg-lime-500/20 text-lime-400 hover:bg-lime-500 hover:text-white text-sm font-medium transition-colors shrink-0">${t('fs_log')}</button>
                    </div>` : ''}
                </div>`;
            }).join('') : `<p class="text-sm text-gray-500 col-span-full">${t('fs_no_points')}</p>`;
            document.getElementById('fs-points').innerHTML = pointsHtml;
            // История замеров за день
            const hist = fsTempDB.filter(e => e.date === key);
            document.getElementById('fs-temp-history').innerHTML = hist.length ? hist.map(e => {
                const p = fsPointsDB.find(x => x.id === e.pointId);
                const ok = !p || fsTempOk(p, e.temp);
                return `<div class="flex items-center justify-between bg-black/30 rounded-xl px-3 py-2 text-sm">
                    <span class="text-gray-300 truncate mr-2">${e.pointName} <span class="text-gray-600 text-xs">${e.time}</span></span>
                    <span class="flex items-center gap-2 shrink-0"><span class="font-bold ${ok ? 'text-green-400' : 'text-red-400'}">${e.temp}°C</span>
                    <button onclick="deleteTempEntry(${e.id})" class="text-red-400/50 hover:text-red-400 text-xs"><i class="fa-solid fa-xmark"></i></button></span>
                </div>`;
            }).join('') : `<p class="text-xs text-gray-600">${t('fs_no_entries')}</p>`;
            const addBlock = document.getElementById('fs-add-point-block');
            if (addBlock) addBlock.style.display = isChef ? '' : 'none';
        }
        // --- HACCP-чеклист ---
        function fsChecklistFor(date) {
            if (!Array.isArray(fsCheckDB)) fsCheckDB = [];
            let rec = fsCheckDB.find(c => c.date === date);
            if (!rec) {
                rec = { id: Date.now(), date, checks: (fsCheckTemplate || []).map(x => ({ label: x.label, done: false })), by: '' };
                fsCheckDB.unshift(rec);
                markDirty();
            }
            return rec;
        }
        function toggleFSCheck(date, idx) {
            const rec = fsChecklistFor(date);
            if (rec.checks[idx]) {
                rec.checks[idx].done = !rec.checks[idx].done;
                markDirty();
                renderFSCheck();
            }
        }
        function addFSTemplateItem() {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            const inp = document.getElementById('fs-tpl-new');
            const label = (inp.value || '').trim();
            if (!label) return;
            if (!Array.isArray(fsCheckTemplate)) fsCheckTemplate = [];
            fsCheckTemplate.push({ label });
            inp.value = '';
            markDirty();
            renderFSCheck();
        }
        function deleteFSTemplateItem(idx) {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            fsCheckTemplate.splice(idx, 1);
            markDirty();
            renderFSCheck();
        }
        function renderFSCheck() {
            const key = fsDateKey('fs-check-date');
            const dateInp = document.getElementById('fs-check-date');
            const today = new Date().toISOString().slice(0, 10);
            if (dateInp && !dateInp.value) dateInp.value = today;
            const isChef = currentAppRole === 'chef';
            const rec = fsChecklistFor(key);
            const done = rec.checks.filter(c => c.done).length;
            const total = rec.checks.length;
            const pct = total ? Math.round(done / total * 100) : 0;
            document.getElementById('fs-check-progress').innerHTML = `
                <div class="flex justify-between text-xs text-gray-400 mb-2"><span>${t('fs_checklist_for')} ${key}</span><span class="font-bold ${pct === 100 ? 'text-green-400' : 'text-white'}">${done}/${total}</span></div>
                <div class="h-2 bg-white/10 rounded-full overflow-hidden"><div class="h-full ${pct === 100 ? 'bg-green-500' : 'bg-lime-500'} transition-all" style="width:${pct}%"></div></div>`;
            document.getElementById('fs-check-list').innerHTML = rec.checks.length ? rec.checks.map((c, idx) => `
                <button onclick="toggleFSCheck('${key}', ${idx})" class="w-full flex items-center gap-3 bg-black/30 hover:bg-black/50 rounded-xl px-4 py-3 text-left transition-colors">
                    <span class="w-6 h-6 rounded-lg border-2 ${c.done ? 'bg-green-500 border-green-500' : 'border-white/20'} flex items-center justify-center shrink-0 transition-colors">
                        ${c.done ? '<i class="fa-solid fa-check text-white text-xs"></i>' : ''}
                    </span>
                    <span class="text-sm ${c.done ? 'text-gray-500 line-through' : 'text-white'}">${c.label}</span>
                </button>`).join('') : `<p class="text-sm text-gray-500">${t('fs_no_items')}</p>`;
            // Редактор шаблона (шеф)
            const tplBox = document.getElementById('fs-template-list');
            if (tplBox) {
                tplBox.innerHTML = (fsCheckTemplate || []).map((x, idx) => `
                    <div class="flex items-center justify-between bg-black/30 rounded-xl px-3 py-2 text-sm">
                        <span class="text-gray-300 truncate mr-2">${x.label}</span>
                        ${isChef ? `<button onclick="deleteFSTemplateItem(${idx})" class="text-red-400/50 hover:text-red-400 text-xs shrink-0"><i class="fa-solid fa-xmark"></i></button>` : ''}
                    </div>`).join('');
                document.getElementById('fs-template-block').style.display = isChef ? '' : 'none';
            }
        }
