        // --- КАЛЕНДАРЬ ---
        function formatDataKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
        function renderCalendar() {
            const grid = document.getElementById('calendar-grid'); grid.innerHTML = '';
            const y = currentMonthDate.getFullYear(), m = currentMonthDate.getMonth();
            const langCode = currentLanguage === 'en' ? 'en-US' : 'ru-RU';
            document.querySelector('#calendar-month-year span').textContent = currentMonthDate.toLocaleDateString(langCode, { month: 'long', year: 'numeric' });
            const startDay = new Date(y, m, 1).getDay() === 0 ? 6 : new Date(y, m, 1).getDay() - 1; 
            const daysInMonth = new Date(y, m + 1, 0).getDate(); const today = new Date();
            for (let i = 0; i < startDay; i++) grid.appendChild(document.createElement('div'));
            for (let i = 1; i <= daysInMonth; i++) {
                const cell = document.createElement('div'), cellDate = new Date(y, m, i), key = formatDataKey(cellDate);
                const nData = chefNotes[activeKitchen] && chefNotes[activeKitchen][key];
                let nText = '', nEmo = null;
                if(nData) { if(typeof nData==='string') nText=nData; else { nText=nData.text||''; nEmo=nData.emoji||null; } }
                let classes = 'relative aspect-square flex items-center justify-center rounded-full cursor-pointer transition-all duration-200 ';
                if (key === formatDataKey(selectedDate)) classes += 'bg-red-500 text-white shadow-md shadow-red-500/30';
                else if (key === formatDataKey(today)) classes += 'border border-red-500 text-red-400 hover:bg-white/10';
                else classes += 'text-gray-300 hover:bg-white/10 hover:text-white';
                cell.className = classes; cell.innerHTML = `<span>${i}</span>`;
                if(nEmo) cell.innerHTML += `<div class="absolute -top-1 -right-1 text-[11px] drop-shadow-md z-20">${nEmo}</div>`;
                else if(nText.trim() !== '') cell.innerHTML += `<div class="w-1 h-1 rounded-full absolute bottom-1 ${key===formatDataKey(selectedDate)?'bg-white':'bg-red-400'}"></div>`;
                cell.onclick = () => { selectedDate = new Date(y, m, i); renderCalendar(); updateSelectedDateLabel(); loadWidgetNote(); };
                grid.appendChild(cell);
            }
        }
        function changeMonth(o) { currentMonthDate.setMonth(currentMonthDate.getMonth() + o); renderCalendar(); }
        function updateSelectedDateLabel() { 
            const langCode = currentLanguage === 'en' ? 'en-US' : 'ru-RU';
            const todayStr = currentLanguage === 'en' ? 'Today, ' : 'Сегодня, ';
            document.getElementById('selected-date-label').textContent = (formatDataKey(selectedDate) === formatDataKey(new Date()) ? todayStr : '') + selectedDate.toLocaleDateString(langCode, { weekday: 'long', day: 'numeric', month: 'long' }); 
        }
        function toggleEmoji(e) { selectedEmoji = selectedEmoji === e ? null : e; updateEmojiUI(); }
        function updateEmojiUI() { document.querySelectorAll('.emoji-btn').forEach(b => { if (b.dataset.emoji === selectedEmoji) b.className="emoji-btn w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-all text-lg bg-orange-500/30 border border-orange-500/50"; else b.className="emoji-btn w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-all text-lg bg-white/5 hover:bg-white/10"; }); }
        function loadWidgetNote() { 
            const nData = chefNotes[activeKitchen] && chefNotes[activeKitchen][formatDataKey(selectedDate)];
            if(nData) { if(typeof nData==='string') { document.getElementById('widget-notes-input').value = nData; selectedEmoji=null; } else { document.getElementById('widget-notes-input').value = nData.text||''; selectedEmoji = nData.emoji||null; } } 
            else { document.getElementById('widget-notes-input').value = ''; selectedEmoji = null; }
            updateEmojiUI();
        }
        function saveWidgetNote() {
            if (!chefNotes[activeKitchen]) chefNotes[activeKitchen] = {};
            chefNotes[activeKitchen][formatDataKey(selectedDate)] = { text: document.getElementById('widget-notes-input').value, emoji: selectedEmoji };
            markDirty();
            renderCalendar(); const b = document.getElementById('widget-save-btn');
            b.innerHTML = `<i class="fa-solid fa-check"></i> ${t('saved')}`; b.classList.replace('text-red-400', 'text-green-400'); setTimeout(() => { b.innerHTML = t('save'); b.classList.replace('text-green-400', 'text-red-400'); }, 2000);
        }


        // 2.1.21: список задач в виджете + полоса «Сегодня» (смены и заметка на сегодня)
        function renderTasks() {
            const list = document.getElementById('tasks-list'); if (!list) return;
            if (!Array.isArray(tasksDB)) tasksDB = [];
            const open = tasksDB.filter(x => !x.done).length;
            const c = document.getElementById('tasks-open-count');
            if (c) c.textContent = open > 0 ? ` · ${open} открыто` : '';
            const items = [...tasksDB].sort((a, b) => (a.done - b.done) || (b.created - a.created));
            list.innerHTML = items.map(x => `<div class="flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2">
                <button onclick="toggleTask(${x.id})" class="w-5 h-5 rounded-full border ${x.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-500 text-transparent'} flex items-center justify-center text-[10px] shrink-0"><i class="fa-solid fa-check"></i></button>
                <span class="flex-1 text-sm ${x.done ? 'text-gray-500 line-through' : 'text-white'} break-words">${escapeHtml(x.text)}</span>
                <button onclick="deleteTask(${x.id})" class="text-gray-600 hover:text-red-400 text-xs shrink-0"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join('') || `<p class="text-xs text-gray-600">${t('tasks_empty')}</p>`;
        }
        function addTask() {
            const inp = document.getElementById('task-input'); if (!inp) return;
            const v = (inp.value || '').trim(); if (!v) return;
            if (!Array.isArray(tasksDB)) tasksDB = [];
            tasksDB.push({ id: Date.now(), text: v, done: false, created: Date.now() });
            inp.value = ''; markDirty(); renderTasks();
        }
        function toggleTask(id) { const x = (tasksDB || []).find(t => t.id === id); if (x) { x.done = !x.done; markDirty(); renderTasks(); } }
        function deleteTask(id) { tasksDB = (tasksDB || []).filter(t => t.id !== id); markDirty(); renderTasks(); }
        function renderTodayStrip() {
            const dEl = document.getElementById('today-strip-date'); if (!dEl) return;
            const now = new Date();
            const langCode = currentLanguage === 'en' ? 'en-US' : 'ru-RU';
            dEl.textContent = now.toLocaleDateString(langCode, { weekday: 'long', day: 'numeric', month: 'long' });
            const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
            const shifts = (scheduleDB[activeKitchen] && scheduleDB[activeKitchen][days[now.getDay()]]) || [];
            const sEl = document.getElementById('today-strip-shifts');
            if (sEl) {
                sEl.innerHTML = shifts.length
                    ? shifts.map(s => { const m = (teamDB || []).find(t => t.id === s.id); const name = m ? m.name.split(' ')[0] : ('#' + s.id); return `<span class="text-gray-300">${escapeHtml(name)}</span> <span class="text-gray-500">${s.start}–${s.end}</span>`; }).join('<span class="text-gray-600 mx-1">·</span>')
                    : `<span class="text-gray-500">${t('today_no_shifts')}</span>`;
            }
            const nEl = document.getElementById('today-strip-note');
            if (nEl) {
                const nData = chefNotes[activeKitchen] && chefNotes[activeKitchen][formatDataKey(now)];
                const txt = nData ? (typeof nData === 'string' ? nData : (nData.text || '')) : '';
                const emo = nData && typeof nData === 'object' ? (nData.emoji || '') : '';
                nEl.textContent = txt ? `${emo ? emo + ' ' : ''}${txt}` : '';
            }
        }
