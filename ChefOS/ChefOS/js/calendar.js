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
        function updateEmojiUI() { document.querySelectorAll('.emoji-btn').forEach(b => { if (b.dataset.emoji === selectedEmoji) b.className="emoji-btn w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center transition-all text-sm bg-orange-500/30 border border-orange-500/50"; else b.className="emoji-btn w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center transition-all text-sm bg-white/5 hover:bg-white/10"; }); }
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

