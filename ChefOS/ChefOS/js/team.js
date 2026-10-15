        // --- Вспомогательная функция для расчета часов ---
        function getEmployeeWeeklyStats(id) {
            let hours = 0;
            Object.values(scheduleDB).forEach(k => {
                Object.values(k).forEach(dayArr => {
                    dayArr.forEach(shift => {
                        if(shift.id === id) {
                            const [sh, sm] = shift.start.split(':').map(Number);
                            const [eh, em] = shift.end.split(':').map(Number);
                            let duration = (eh + em/60) - (sh + sm/60);
                            if (duration < 0) duration += 24;
                            hours += duration;
                        }
                    })
                })
            });
            return hours;
        }

        // --- КОМАНДА ---
        function openTeamModal() {
            document.getElementById('team-kitchen-subtitle').textContent = t(activeKitchen);
            document.getElementById('schedule-kitchen-name').textContent = t(activeKitchen);
            switchTeamTab(activeTabs.team);
            openModal('team-modal');
        }

        function switchTeamTab(tabName) {
            activeTabs.team = tabName;
            // Таб «Заготовки» — только для ролей с правом prepCheck (шеф/су-шеф/повар)
            const _prepBtn = document.getElementById('team-tab-btn-prep');
            if (_prepBtn) _prepBtn.style.display = ((typeof PERMISSIONS !== 'undefined' && PERMISSIONS[currentAppRole] && PERMISSIONS[currentAppRole].prepCheck) ? '' : 'none');
            ['staff', 'schedule', 'requests', 'timeclock', 'prep'].forEach(i => { 
                const btn = document.getElementById(`team-tab-btn-${i}`);
                const content = document.getElementById(`team-tab-${i}`);
                if(btn) btn.className = `px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${i === tabName ? 'border-teal-500 text-teal-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`;
                if(content) {
                    if(i === tabName) content.classList.remove('hidden');
                    else content.classList.add('hidden');
                }
            });
            if (tabName === 'staff') renderTeamList(); 
            if (tabName === 'schedule') renderSchedule();
            if (tabName === 'requests' && typeof renderRequests === 'function') renderRequests();
            if (tabName === 'timeclock') renderTimeclock();
            if (tabName === 'prep' && typeof renderPrep === 'function') renderPrep();
        }

        // --- ТАБЕЛЬ (v2.2): отметки прихода/ухода, факт vs план ---
        function timeclockDateKey() {
            const inp = document.getElementById('timeclock-date');
            if (inp && inp.value) return inp.value;
            return new Date().toISOString().slice(0, 10);
        }
        function shiftDurationHours(start, end) {
            const [sh, sm] = String(start || '0:0').split(':').map(Number);
            const [eh, em] = String(end || '0:0').split(':').map(Number);
            let d = (eh + em / 60) - (sh + sm / 60);
            if (d < 0) d += 24;
            return Math.max(0, d);
        }
        function scheduledDayHours(empId, dateKey) {
            const d = new Date(dateKey + 'T12:00:00');
            const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
            const dayArr = (scheduleDB[activeKitchen] && scheduleDB[activeKitchen][wd]) || [];
            return dayArr.filter(s => String(s.id) === String(empId))
                .reduce((sum, s) => sum + shiftDurationHours(s.start, s.end), 0);
        }
        function clockedDayHours(entries) {
            return entries.reduce((s, e) => {
                if (!e.clockIn) return s;
                const out = e.clockOut ? new Date(e.clockOut) : new Date();
                return s + Math.max(0, (out - new Date(e.clockIn)) / 3600000);
            }, 0);
        }
        function fmtClockTime(iso) {
            if (!iso) return '—';
            const d = new Date(iso);
            return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        function clockToggle(empId) {
            if (!Array.isArray(timeclockDB)) timeclockDB = [];
            const key = timeclockDateKey();
            const today = new Date().toISOString().slice(0, 10);
            if (key !== today) return; // отметки — только за сегодня, история только для просмотра
            const open = timeclockDB.find(e => String(e.employeeId) === String(empId) && e.date === key && !e.clockOut);
            const now = new Date().toISOString();
            if (open) {
                open.clockOut = now;
            } else {
                const emp = (teamDB || []).find(e => String(e.id) === String(empId));
                timeclockDB.unshift({ id: Date.now(), employeeId: empId, employeeName: emp ? emp.name : '', date: key, clockIn: now, clockOut: null });
            }
            markDirty();
            renderTimeclock();
        }
        function deleteClockEntry(id) {
            timeclockDB = timeclockDB.filter(e => e.id !== id);
            markDirty();
            renderTimeclock();
        }
        function renderTimeclock() {
            if (!Array.isArray(timeclockDB)) timeclockDB = [];
            const key = timeclockDateKey();
            const today = new Date().toISOString().slice(0, 10);
            const isToday = key === today;
            const dateInp = document.getElementById('timeclock-date');
            if (dateInp && !dateInp.value) dateInp.value = today;
            const list = document.getElementById('timeclock-list');
            const isChef = currentAppRole === 'chef';
            const meId = (typeof currentEmployeeId !== 'undefined') ? currentEmployeeId : null;
            let totPlan = 0, totFact = 0;
            const rows = (teamDB || []).map(e => {
                const entries = timeclockDB.filter(x => String(x.employeeId) === String(e.id) && x.date === key);
                const plan = scheduledDayHours(e.id, key);
                const fact = clockedDayHours(entries);
                totPlan += plan; totFact += fact;
                const open = entries.find(x => !x.clockOut);
                const canClock = isToday && (isChef || String(meId) === String(e.id));
                const btn = canClock
                    ? (open
                        ? `<button onclick="clockToggle(${e.id})" class="h-10 px-5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white font-medium text-sm transition-colors">${t('tc_clock_out')} · ${fmtClockTime(open.clockIn)}</button>`
                        : `<button onclick="clockToggle(${e.id})" class="h-10 px-5 rounded-xl bg-teal-500/20 text-teal-400 hover:bg-teal-500 hover:text-white font-medium text-sm transition-colors">${t('tc_clock_in')}</button>`)
                    : (open ? `<span class="text-xs font-medium text-teal-400">${t('tc_on_shift')}</span>` : `<span class="text-xs text-gray-600">—</span>`);
                const initials = e.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const entriesHtml = entries.map(x => `
                    <div class="flex items-center gap-2 text-xs text-gray-400">
                        <i class="fa-regular fa-clock"></i>
                        <span>${fmtClockTime(x.clockIn)} → ${x.clockOut ? fmtClockTime(x.clockOut) : '…'}</span>
                        ${isChef ? `<button onclick="deleteClockEntry(${x.id})" class="text-red-400/60 hover:text-red-400"><i class="fa-solid fa-xmark"></i></button>` : ''}
                    </div>`).join('');
                const delta = fact - plan;
                const deltaCls = plan > 0 ? (Math.abs(delta) < 0.25 ? 'text-gray-500' : (delta > 0 ? 'text-amber-400' : 'text-sky-400')) : 'text-gray-600';
                return `
                <div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="w-10 h-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm shrink-0">${initials}</div>
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-white truncate">${e.name}</p>
                            <p class="text-xs text-gray-500">${t('tc_plan')}: ${plan.toFixed(1)} ${t('unit_h')} · ${t('tc_fact')}: <span class="text-white font-medium">${fact.toFixed(1)} ${t('unit_h')}</span> <span class="${deltaCls}">(${delta >= 0 ? '+' : ''}${delta.toFixed(1)})</span></p>
                            ${entriesHtml ? `<div class="mt-1 flex flex-col gap-1">${entriesHtml}</div>` : ''}
                        </div>
                    </div>
                    <div class="shrink-0">${btn}</div>
                </div>`;
            }).join('');
            document.getElementById('timeclock-summary').innerHTML =
                `<span class="text-gray-400">${t('tc_day_total')}:</span> <span class="text-white font-bold">${t('tc_plan')} ${totPlan.toFixed(1)} ${t('unit_h')}</span> <span class="text-gray-600">/</span> <span class="text-teal-400 font-bold">${t('tc_fact')} ${totFact.toFixed(1)} ${t('unit_h')}</span>`;
            list.innerHTML = rows || `<p class="text-center text-gray-500 text-sm py-8">${t('team_no_staff')}</p>`;
        }


        function renderTeamList() {
            const l = document.getElementById('team-staff-list'); l.innerHTML = '';
            if (teamDB.length === 0) {
                l.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10">${t('team_no_staff')}</div>`;
                return;
            }
            teamDB.forEach(e => {
                const weeklyHours = getEmployeeWeeklyStats(e.id);
                const weeklySalary = weeklyHours * e.rate;
                
                l.innerHTML += `
                    <div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-5 hover:border-teal-500/50 transition-all cursor-pointer group flex flex-col" onclick="openEmployeeEditModal(${e.id})">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h4 class="font-semibold text-white text-lg leading-tight">${e.name}</h4>
                                <span class="text-xs text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded-md mt-1 inline-block">${e.role}</span>
                            </div>
                            <div class="w-8 h-8 rounded-full bg-zinc-800 text-gray-400 flex items-center justify-center group-hover:bg-teal-500 group-hover:text-white transition-colors">
                                <i class="fa-solid fa-pen text-xs"></i>
                            </div>
                        </div>
                        <div class="space-y-2 text-sm mt-auto">
                            <div class="flex items-center text-gray-400"><i class="fa-solid fa-coins w-5"></i><span class="text-gray-300 ml-2">${e.rate} ${currentCurrency}/${t('unit_h') || 'ч'}</span></div>
                            <div class="flex items-center text-teal-400"><i class="fa-regular fa-clock w-5"></i><span class="font-medium ml-2">${weeklyHours.toFixed(1)} ${t('unit_h') || 'ч'} / нед.</span></div>
                            <div class="flex items-center text-white"><i class="fa-solid fa-wallet w-5"></i><span class="font-bold ml-2">${weeklySalary.toFixed(0)} ${currentCurrency}</span></div>
                        </div>
                    </div>`;
            });
        }

        function updateEmpSalaryPreview() {
            if (!editingEmployeeId) return;
            const rate = parseFloat(document.getElementById('edit-emp-rate').value) || 0;
            const hours = getEmployeeWeeklyStats(editingEmployeeId);
            document.getElementById('emp-weekly-salary').innerHTML = `${(hours * rate).toFixed(0)} ${currentCurrency} <span class="text-sm font-normal text-gray-400">/ ${hours.toFixed(1)} ${t('unit_h') || 'ч'}</span>`;
        }

        function openEmployeeEditModal(id) {
            // v1.9: карточку сотрудника видит только шеф (вкладка «Сотрудники» скрыта у остальных)
            if (!rolePerm(currentAppRole, 'personnel')) return;
            const salInfo = document.getElementById('emp-salary-info');
            if(id === null) { 
                editingEmployeeId = null; 
                document.getElementById('delete-emp-btn').classList.add('hidden'); 
                document.getElementById('edit-emp-name').value = ''; 
                document.getElementById('edit-emp-role').value = ''; 
                document.getElementById('edit-emp-phone').value = ''; 
                document.getElementById('edit-emp-rate').value = ''; 
                document.getElementById('edit-emp-pin').value = '';
                salInfo.classList.add('hidden');
            } else { 
                const e = teamDB.find(i => i.id === id); if(!e) return; 
                editingEmployeeId = id; 
                document.getElementById('delete-emp-btn').classList.remove('hidden'); 
                document.getElementById('edit-emp-name').value = e.name; 
                document.getElementById('edit-emp-role').value = e.role; 
                document.getElementById('edit-emp-phone').value = e.phone; 
                document.getElementById('edit-emp-rate').value = e.rate; 
                document.getElementById('edit-emp-pin').value = e.pin || '';
                
                const hours = getEmployeeWeeklyStats(id);
                document.getElementById('emp-weekly-salary').innerHTML = `${(hours * e.rate).toFixed(0)} ${currentCurrency} <span class="text-sm font-normal text-gray-400">/ ${hours.toFixed(1)} ${t('unit_h') || 'ч'}</span>`;
                salInfo.classList.remove('hidden');
            }
            document.getElementById('edit-emp-currency').textContent = currentCurrency; 
            // Уровень доступа: стартуем с сохранённого (или выведенного из должности), дальше — за шефом
            refreshEmpAccessRolePreview._touched = false;
            const arSel = document.getElementById('edit-emp-accessrole');
            if (arSel) {
                const stored = (id !== null && (teamDB.find(i => i.id === id) || {}).accessRole);
                const initial = (stored && ['chef', 'souschef', 'cook', 'cashier'].includes(stored))
                    ? stored
                    : deriveAccessRole(document.getElementById('edit-emp-role').value);
                arSel.value = initial;
            }
            openModal('employee-edit-modal');
        }

        function deleteEmployee() { 
            showConfirm(t('confirm_title'), t('confirm_msg'), () => { 
                teamDB = teamDB.filter(i => i.id !== editingEmployeeId); 
                Object.values(scheduleDB).forEach(k => {
                    Object.keys(k).forEach(day => {
                        k[day] = k[day].filter(shift => shift.id !== editingEmployeeId);
                    });
                });
                // v1.9: чистим связанные записи — отменяем активные обмены, удаляем выходные и уведомления
                swapRequestsDB.forEach(r => {
                    if ((r.fromEmpId === editingEmployeeId || r.toEmpId === editingEmployeeId) &&
                        (r.status === 'proposed' || r.status === 'pending_approval')) r.status = 'cancelled';
                });
                dayOffDB = dayOffDB.filter(d => d.empId !== editingEmployeeId);
                dayOffRequestsDB = dayOffRequestsDB.filter(r => r.empId !== editingEmployeeId);
                notificationsDB = notificationsDB.filter(n => n.empId !== editingEmployeeId);
                closeModal('employee-edit-modal'); 
                renderTeamList(); 
                markDirty();
                showNotification(t('notif_emp_deleted')); 
            }); 
        }

        function saveEmployeeChanges() {
            const n = document.getElementById('edit-emp-name').value.trim(); if(!n) return;
            const pinRaw = (document.getElementById('edit-emp-pin').value || '').trim();
            const pin = /^\d{4}$/.test(pinRaw) ? pinRaw : null; // личный PIN: 4 цифры или пусто
            const roleText = document.getElementById('edit-emp-role').value;
            // Уровень доступа выбирает шеф вручную (селект); fallback — вывод из должности
            const arSel = document.getElementById('edit-emp-accessrole');
            const accessRole = (arSel && ['chef', 'souschef', 'cook', 'cashier'].includes(arSel.value))
                ? arSel.value
                : deriveAccessRole(roleText);
            if (editingEmployeeId) { 
                const e = teamDB.find(i => i.id === editingEmployeeId); 
                if(e) { 
                    e.name = n; 
                    e.role = roleText; 
                    e.phone = document.getElementById('edit-emp-phone').value; 
                    e.rate = parseFloat(document.getElementById('edit-emp-rate').value) || 0; 
                    e.pin = pin;
                    e.accessRole = accessRole;
                } 
            } else { 
                teamDB.push({ id: Date.now(), name: n, role: roleText, phone: document.getElementById('edit-emp-phone').value, rate: parseFloat(document.getElementById('edit-emp-rate').value) || 0, pin: pin, accessRole: accessRole }); 
            }
            markDirty();
            renderTeamList(); closeModal('employee-edit-modal'); showNotification(t('notif_emp_saved'));
        }

        // v1.9: подсветка «мои смены» (вход по личному PIN), маркеры выходных на неделе,
        // кнопки «Предложить обмен» на своих сменах, правка — только с правом editSchedule.
        function renderSchedule() {
            const grid = document.getElementById('team-schedule-grid'); grid.innerHTML = '';
            if (!scheduleDB[activeKitchen]) scheduleDB[activeKitchen] = { 'Пн':[], 'Вт':[], 'Ср':[], 'Чт':[], 'Пт':[], 'Сб':[], 'Вс':[] };
            const kSched = scheduleDB[activeKitchen];
            const me = (typeof myEmployeeId === 'function') ? myEmployeeId() : null;
            const editor = (typeof canEditSchedule === 'function') ? canEditSchedule() : (currentAppRole === 'chef');
            const weekDates = (typeof currentWeekDates === 'function') ? currentWeekDates() : WEEK_DAYS.map(() => '');
            const dayOffMap = (typeof dayOffsByDate === 'function') ? dayOffsByDate(activeKitchen) : {};

            WEEK_DAYS.forEach((day, di) => {
                const dayKey = `day_${day.toLowerCase() === 'пн' ? 'mon' : day.toLowerCase() === 'вт' ? 'tue' : day.toLowerCase() === 'ср' ? 'wed' : day.toLowerCase() === 'чт' ? 'thu' : day.toLowerCase() === 'пт' ? 'fri' : day.toLowerCase() === 'сб' ? 'sat' : 'sun'}`;
                let col = `<div class="flex flex-col gap-2"><div class="text-center font-medium text-gray-400 py-2 border-b border-white/10 mb-2">${t(dayKey)}${weekDates[di] ? `<div class="text-[10px] text-gray-600 font-normal">${weekDates[di].slice(5)}</div>` : ''}</div>`;
                // маркер выходного, если дата попадает в отображаемую неделю
                (dayOffMap[weekDates[di]] || []).forEach(empId => {
                    col += `<div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 text-center"><p class="text-[10px] text-amber-400 font-medium"><i class="fa-solid fa-umbrella-beach mr-1"></i>${empName(empId)} — ${t('dayoff_marker')}</p></div>`;
                });
                kSched[day].forEach(shift => {
                    const emp = teamDB.find(e => e.id === shift.id); if(!emp) return;
                    const mine = (me != null && shift.id === me);
                    let actions = '';
                    if (editor) {
                        actions = `<button onclick="removeShift('${day}', ${emp.id})" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-xmark text-[10px]"></i></button>`;
                    }
                    const hl = mine ? ' border-teal-500/60 bg-teal-500/5' : '';
                    const swapBtn = (mine && rolePerm(currentAppRole, 'requestSwap'))
                        ? `<button onclick="openSwapModal('${day}', '${shift.start}', '${shift.end}')" class="mt-2 w-full h-7 rounded-lg bg-white/5 hover:bg-teal-500/20 text-[10px] text-teal-400 font-medium transition-colors"><i class="fa-solid fa-arrow-right-arrow-left mr-1"></i>${t('swap_offer_btn')}</button>` : '';
                    col += `<div class="bg-black/40 border border-white/5${hl} rounded-xl p-3 relative group">${mine ? '<div class="absolute top-2 left-2 w-2 h-2 rounded-full bg-teal-400"></div>' : ''}<p class="text-xs font-semibold text-white mb-1 truncate ${mine ? 'pl-4' : ''}">${emp.name}</p><p class="text-[10px] text-teal-400"><i class="fa-regular fa-clock mr-1"></i>${shift.start} - ${shift.end}</p>${actions}${swapBtn}</div>`;
                });
                if (editor) {
                    col += `<button onclick="openScheduleSelect('${day}')" class="w-full h-10 rounded-xl border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/50 hover:bg-white/5 transition-all text-xs flex items-center justify-center mt-2"><i class="fa-solid fa-plus"></i></button>`;
                }
                col += `</div>`;
                grid.innerHTML += col;
            });
            if (typeof renderUpcomingDayOffs === 'function') renderUpcomingDayOffs();
        }

        // v1.9: блок «Ближайшие выходные» под графиком
        function renderUpcomingDayOffs() {
            const box = document.getElementById('team-dayoff-block');
            if (!box) return;
            const list = upcomingDayOffs(activeKitchen, 5);
            const canReq = rolePerm(currentAppRole, 'requestDayOff') && myEmployeeId() != null;
            let html = `<div class="flex justify-between items-center mb-3"><h4 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">${t('dayoff_upcoming')}</h4>${canReq ? `<button onclick="openDayOffModal()" class="h-9 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-medium transition-colors"><i class="fa-solid fa-umbrella-beach mr-1"></i>${t('dayoff_request_btn')}</button>` : ''}</div>`;
            if (!list.length) html += `<p class="text-sm text-gray-600">${t('dayoff_none')}</p>`;
            list.forEach(d => {
                html += `<div class="flex justify-between items-center bg-[#1C1C1E] border border-white/5 rounded-xl p-3 mb-2"><div><p class="text-sm text-white font-medium">${empName(d.empId)}</p><p class="text-[11px] text-gray-500">${d.date}</p></div><i class="fa-solid fa-umbrella-beach text-amber-500/60"></i></div>`;
            });
            box.innerHTML = html;
        }

        function openScheduleSelect(day) {
            scheduleTargetDay = day;
            const kSched = scheduleDB[activeKitchen][day];
            const list = document.getElementById('schedule-emp-list'); list.innerHTML = '';
            
            const availableStaff = teamDB.filter(e => !kSched.find(s => s.id === e.id));
            
            if (availableStaff.length === 0) {
                list.innerHTML = `<p class="text-center text-sm text-gray-500 py-4">${t('sched_all_assigned')}</p>`;
            } else {
                availableStaff.forEach(e => {
                    list.innerHTML += `<div class="flex justify-between items-center p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer border border-white/5" onclick="assignShift(${e.id})"><div><p class="text-sm font-medium text-white">${e.name}</p><p class="text-[10px] text-gray-400">${e.role}</p></div><i class="fa-solid fa-plus text-teal-500"></i></div>`;
                });
            }
            openModal('schedule-select-modal');
        }

        function assignShift(empId) {
            const start = document.getElementById('shift-start-time').value;
            const end = document.getElementById('shift-end-time').value;
            scheduleDB[activeKitchen][scheduleTargetDay].push({ id: empId, start: start, end: end });
            
            // Сортировка по времени начала
            scheduleDB[activeKitchen][scheduleTargetDay].sort((a, b) => a.start.localeCompare(b.start));
            
            markDirty();
            renderSchedule();
            closeModal('schedule-select-modal');
        }

        function removeShift(day, empId) {
            scheduleDB[activeKitchen][day] = scheduleDB[activeKitchen][day].filter(s => s.id !== empId);
            markDirty();
            renderSchedule();
        }

