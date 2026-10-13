        // ============================================================
        // v1.9: ОБМЕН СМЕНАМИ / ВЫХОДНЫЕ / УВЕДОМЛЕНИЯ
        // Чистая логика — работает и в node (тесты): все обращения к document
        // обёрнуты в typeof-проверки. Мутации всегда завершаются markDirty().
        // ============================================================

        // --- общие хелперы ---
        function empById(id) { return teamDB.find(e => e.id === id) || null; }
        function myEmployeeId() { return (typeof currentEmployeeId !== 'undefined') ? currentEmployeeId : null; }
        function approverEmployees() { return teamDB.filter(e => e.accessRole === 'chef' || e.accessRole === 'souschef'); }
        function canApprove() { return rolePerm(currentAppRole, 'approve'); }
        function canEditSchedule() { return rolePerm(currentAppRole, 'editSchedule'); }
        function empName(id) { const e = empById(id); return e ? e.name : '?'; }

        function localDateStr(d) {
            const p = n => String(n).padStart(2, '0');
            return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        }
        // Даты Пн..Вс текущей календарной недели (колонки графика привязаны к ней)
        function currentWeekDates() {
            const now = new Date();
            const dow = (now.getDay() + 6) % 7; // 0 = понедельник
            const mon = new Date(now); mon.setDate(now.getDate() - dow);
            return WEEK_DAYS.map((_, i) => {
                const d = new Date(mon); d.setDate(mon.getDate() + i);
                return localDateStr(d);
            });
        }
        function weekDayIndexOfDate(dateStr) {
            const idx = currentWeekDates().indexOf(dateStr);
            return idx; // -1, если дата не в текущей неделе
        }

        // --- уведомления ---
        function notifyUser(empId, type, text, refId) {
            if (empId == null) return null;
            const n = { id: Date.now() + Math.floor(Math.random() * 1000), empId: empId, type: type, text: text, refId: refId || null, createdAt: Date.now(), read: false };
            notificationsDB.push(n);
            while (notificationsDB.length > 300) notificationsDB.shift();
            markDirty();
            if (typeof updateNotifBadge === 'function' && typeof document !== 'undefined') { try { updateNotifBadge(); } catch (e) {} }
            return n;
        }
        function notifyApprovers(type, text, refId, excludeId) {
            approverEmployees().forEach(e => { if (e.id !== excludeId) notifyUser(e.id, type, text, refId); });
        }
        function unreadCount(empId) { return notificationsDB.filter(n => n.empId === empId && !n.read).length; }
        function markAllNotificationsRead(empId) {
            notificationsDB.forEach(n => { if (n.empId === empId) n.read = true; });
            markDirty();
            if (typeof updateNotifBadge === 'function' && typeof document !== 'undefined') { try { updateNotifBadge(); } catch (e) {} }
        }
        function updateNotifBadge() {
            if (typeof document === 'undefined') return;
            const b = document.getElementById('notif-badge');
            if (!b) return;
            const id = myEmployeeId();
            if (id == null) { b.classList.add('hidden'); return; }
            const c = unreadCount(id);
            if (c > 0) { b.textContent = c > 99 ? '99+' : c; b.classList.remove('hidden'); }
            else b.classList.add('hidden');
        }

        // --- ОБМЕН СМЕНАМИ: стейт-машина ---
        // proposed -> peer_accepted -> pending_approval -> approved / rejected
        //        |-> peer_rejected        proposed/pending_approval -> cancelled (автор)
        function createSwapRequest(opts) {
            const o = opts || {};
            const fromEmp = empById(o.fromEmpId);
            if (!fromEmp) return { ok: false, error: 'no_from' };
            if (o.toEmpId != null && !empById(o.toEmpId)) return { ok: false, error: 'no_to' };
            if (!o.fromShift || !o.fromShift.day) return { ok: false, error: 'no_shift' };
            const req = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                kitchen: o.kitchen || activeKitchen,
                fromEmpId: o.fromEmpId,
                fromShift: { day: o.fromShift.day, start: o.fromShift.start, end: o.fromShift.end },
                toEmpId: o.toEmpId != null ? o.toEmpId : null,
                toShift: o.toShift ? { day: o.toShift.day, start: o.toShift.start, end: o.toShift.end } : null,
                status: 'proposed',
                createdBy: (o.createdBy != null ? o.createdBy : o.fromEmpId),
                createdAt: Date.now(),
                decidedBy: null, decidedAt: null,
                note: o.note || ''
            };
            swapRequestsDB.push(req);
            if (req.toEmpId != null) {
                notifyUser(req.toEmpId, 'swap_proposed', t('notif_swap_proposed') + ': ' + fromEmp.name + ' (' + req.fromShift.day + ' ' + req.fromShift.start + '-' + req.fromShift.end + ')', req.id);
            } else {
                teamDB.forEach(e => { if (e.id !== req.fromEmpId && e.accessRole !== 'chef') notifyUser(e.id, 'swap_open', t('notif_swap_open') + ': ' + fromEmp.name + ' (' + req.fromShift.day + ' ' + req.fromShift.start + '-' + req.fromShift.end + ')', req.id); });
            }
            markDirty();
            return { ok: true, request: req };
        }
        function peerRespondSwap(id, empId, accept) {
            const req = swapRequestsDB.find(r => r.id === id);
            if (!req || req.status !== 'proposed') return { ok: false, error: 'bad_status' };
            const open = req.toEmpId == null;
            if (!open && req.toEmpId !== empId) return { ok: false, error: 'not_peer' };
            if (open && req.fromEmpId === empId) return { ok: false, error: 'self' };
            if (!accept) {
                req.status = 'peer_rejected';
                req.decidedAt = Date.now();
                notifyUser(req.fromEmpId, 'swap_peer_rejected', t('notif_swap_peer_rejected') + ' (' + req.fromShift.day + ' ' + req.fromShift.start + '-' + req.fromShift.end + ')', req.id);
                markDirty();
                return { ok: true, request: req };
            }
            if (open) req.toEmpId = empId;
            req.status = 'pending_approval';
            notifyApprovers('swap_approval', t('notif_swap_approval') + ': ' + empName(req.fromEmpId) + ' ↔ ' + empName(req.toEmpId), req.id, empId);
            notifyUser(req.fromEmpId, 'swap_peer_accepted', t('notif_swap_peer_accepted') + ': ' + empName(req.toEmpId), req.id);
            markDirty();
            return { ok: true, request: req };
        }
        function findShiftEntry(kitchen, day, empId, start, end) {
            const arr = (scheduleDB[kitchen] && scheduleDB[kitchen][day]) || [];
            return arr.find(s => s.id === empId && s.start === start && s.end === end) || null;
        }
        // Применить утверждённый обмен к scheduleDB: смены меняются владельцами.
        // При открытом запросе (toShift null) смена from просто переходит взявшему.
        function applySwapToSchedule(req) {
            const arr = (scheduleDB[req.kitchen] && scheduleDB[req.kitchen][req.fromShift.day]) || [];
            const fromEntry = arr.find(s => s.id === req.fromEmpId && s.start === req.fromShift.start && s.end === req.fromShift.end);
            if (fromEntry) fromEntry.id = req.toEmpId;
            if (req.toShift) {
                const arr2 = (scheduleDB[req.kitchen] && scheduleDB[req.kitchen][req.toShift.day]) || [];
                const toEntry = arr2.find(s => s.id === req.toEmpId && s.start === req.toShift.start && s.end === req.toShift.end);
                if (toEntry) toEntry.id = req.fromEmpId;
            }
        }
        function decideSwap(id, approverId, approve) {
            const req = swapRequestsDB.find(r => r.id === id);
            if (!req || req.status !== 'pending_approval') return { ok: false, error: 'bad_status' };
            const approver = empById(approverId);
            if (!approver || (approver.accessRole !== 'chef' && approver.accessRole !== 'souschef')) return { ok: false, error: 'no_rights' };
            req.decidedBy = approverId;
            req.decidedAt = Date.now();
            if (approve) {
                applySwapToSchedule(req);
                req.status = 'approved';
                notifyUser(req.fromEmpId, 'swap_approved', t('notif_swap_approved'), req.id);
                notifyUser(req.toEmpId, 'swap_approved', t('notif_swap_approved'), req.id);
            } else {
                req.status = 'rejected';
                notifyUser(req.fromEmpId, 'swap_rejected', t('notif_swap_rejected'), req.id);
                notifyUser(req.toEmpId, 'swap_rejected', t('notif_swap_rejected'), req.id);
            }
            markDirty();
            return { ok: true, request: req };
        }
        function cancelSwap(id, empId) {
            const req = swapRequestsDB.find(r => r.id === id);
            if (!req) return { ok: false, error: 'no_req' };
            if (req.createdBy !== empId) return { ok: false, error: 'not_author' };
            if (req.status !== 'proposed' && req.status !== 'pending_approval') return { ok: false, error: 'bad_status' };
            req.status = 'cancelled';
            req.decidedAt = Date.now();
            if (req.toEmpId != null && req.status === 'pending_approval') notifyUser(req.toEmpId, 'swap_cancelled', t('notif_swap_cancelled'), req.id);
            markDirty();
            return { ok: true, request: req };
        }

        // --- ЗАПРОС НА ВЫХОДНОЙ ---
        function requestDayOff(opts) {
            const o = opts || {};
            if (!empById(o.empId)) return { ok: false, error: 'no_emp' };
            if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) return { ok: false, error: 'bad_date' };
            const dup = dayOffRequestsDB.find(r => r.empId === o.empId && r.date === o.date && r.status === 'pending');
            if (dup) return { ok: false, error: 'dup' };
            const req = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                kitchen: o.kitchen || activeKitchen,
                empId: o.empId,
                date: o.date,
                reason: o.reason || '',
                status: 'pending',
                decidedBy: null, decidedAt: null,
                createdAt: Date.now()
            };
            dayOffRequestsDB.push(req);
            notifyApprovers('dayoff_pending', t('notif_dayoff_pending') + ': ' + empName(o.empId) + ' — ' + o.date, req.id, o.empId);
            markDirty();
            return { ok: true, request: req };
        }
        // Есть ли у сотрудника смена в день даты (по дню недели) — для предупреждения при утверждении
        function dayOffShiftConflict(kitchen, empId, dateStr) {
            const idx = new Date(dateStr + 'T12:00:00').getDay(); // 0=вс
            const day = WEEK_DAYS[(idx + 6) % 7];
            const arr = (scheduleDB[kitchen] && scheduleDB[kitchen][day]) || [];
            return arr.some(s => s.id === empId);
        }
        function decideDayOff(id, approverId, approve) {
            const req = dayOffRequestsDB.find(r => r.id === id);
            if (!req || req.status !== 'pending') return { ok: false, error: 'bad_status' };
            const approver = empById(approverId);
            if (!approver || (approver.accessRole !== 'chef' && approver.accessRole !== 'souschef')) return { ok: false, error: 'no_rights' };
            req.decidedBy = approverId;
            req.decidedAt = Date.now();
            if (approve) {
                req.status = 'approved';
                dayOffDB.push({ kitchen: req.kitchen, date: req.date, empId: req.empId });
                notifyUser(req.empId, 'dayoff_approved', t('notif_dayoff_approved') + ': ' + req.date, req.id);
            } else {
                req.status = 'rejected';
                notifyUser(req.empId, 'dayoff_rejected', t('notif_dayoff_rejected') + ': ' + req.date, req.id);
            }
            markDirty();
            return { ok: true, request: req };
        }
        function upcomingDayOffs(kitchen, limit) {
            const today = localDateStr(new Date());
            return dayOffDB
                .filter(d => (!kitchen || d.kitchen === kitchen) && d.date >= today)
                .sort((a, b) => a.date < b.date ? -1 : 1)
                .slice(0, limit || 10);
        }
        function dayOffsByDate(kitchen) {
            const map = {};
            (dayOffDB || []).forEach(d => { if (d.kitchen === kitchen) { if (!map[d.date]) map[d.date] = []; map[d.date].push(d.empId); } });
            return map;
        }

        // --- UI: уведомления ---
        function openNotificationsModal() {
            const id = myEmployeeId();
            if (id == null) return;
            renderNotifications();
            openModal('notifications-modal');
            setTimeout(() => markAllNotificationsRead(id), 1500);
        }
        function renderNotifications() {
            const id = myEmployeeId();
            const l = document.getElementById('notifications-list');
            if (!l) return;
            l.innerHTML = '';
            const mine = notificationsDB.filter(n => n.empId === id).sort((a, b) => b.createdAt - a.createdAt);
            if (!mine.length) { l.innerHTML = `<p class="text-center text-gray-500 py-10 text-sm">${t('notif_empty')}</p>`; return; }
            mine.forEach(n => {
                const dt = new Date(n.createdAt).toLocaleString();
                l.innerHTML += `<div class="p-3 rounded-xl ${n.read ? 'bg-white/[0.03]' : 'bg-teal-500/10 border border-teal-500/20'} mb-2"><p class="text-sm text-white">${n.text}</p><p class="text-[10px] text-gray-500 mt-1">${dt}</p></div>`;
            });
        }

        // --- UI: вкладка «Запросы» (переключение табов — в team.js:switchTeamTab) ---
        function swapStatusLabel(s) {
            return t('swap_status_' + s) || s;
        }
        function renderRequests() {
            const list = document.getElementById('team-requests-list');
            if (!list) return;
            const me = myEmployeeId();
            list.innerHTML = '';
            const approver = canApprove();

            // --- Входящие ---
            let incoming = [];
            if (me != null) {
                // адресованные мне / открытые обмены
                swapRequestsDB.forEach(r => {
                    if (r.status === 'proposed' && r.fromEmpId !== me && (r.toEmpId === me || r.toEmpId == null)) incoming.push({ kind: 'swap', item: r });
                });
                // на утверждение — утверждающим
                if (approver) {
                    swapRequestsDB.forEach(r => { if (r.status === 'pending_approval') incoming.push({ kind: 'swap_approval', item: r }); });
                    dayOffRequestsDB.forEach(r => { if (r.status === 'pending') incoming.push({ kind: 'dayoff_approval', item: r }); });
                }
            }
            let html = `<h4 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">${t('notif_incoming')}</h4>`;
            if (!incoming.length) html += `<p class="text-sm text-gray-600 mb-6">${t('notif_empty')}</p>`;
            incoming.forEach(({ kind, item: r }) => { html += renderRequestCard(kind, r); });

            // --- Мои запросы ---
            let mine = [];
            if (me != null) {
                swapRequestsDB.forEach(r => { if (r.createdBy === me) mine.push({ kind: 'swap_mine', item: r }); });
                dayOffRequestsDB.forEach(r => { if (r.empId === me) mine.push({ kind: 'dayoff_mine', item: r }); });
                mine.sort((a, b) => b.item.createdAt - a.item.createdAt);
            }
            html += `<h4 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6">${t('notif_my')}</h4>`;
            if (!mine.length) html += `<p class="text-sm text-gray-600">${t('notif_empty')}</p>`;
            mine.forEach(({ kind, item: r }) => { html += renderRequestCard(kind, r); });
            list.innerHTML = html;
        }
        function renderRequestCard(kind, r) {
            const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
            if (kind === 'swap' || kind === 'swap_mine' || kind === 'swap_approval') {
                const toTxt = r.toEmpId == null ? `<span class="text-amber-400">${t('swap_open_badge')}</span>` : esc(empName(r.toEmpId));
                const toShiftTxt = r.toShift ? ` (${r.toShift.day} ${r.toShift.start}-${r.toShift.end})` : '';
                let actions = '';
                if (kind === 'swap') actions = `<button onclick="peerRespondSwapUI(${r.id}, true)" class="h-9 px-4 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium">${t('swap_accept')}</button><button onclick="peerRespondSwapUI(${r.id}, false)" class="h-9 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 text-xs font-medium">${t('swap_reject')}</button>`;
                if (kind === 'swap_approval') actions = `<button onclick="decideSwapUI(${r.id}, true)" class="h-9 px-4 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium">${t('swap_approve')}</button><button onclick="decideSwapUI(${r.id}, false)" class="h-9 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium">${t('swap_reject')}</button>`;
                if (kind === 'swap_mine' && (r.status === 'proposed' || r.status === 'pending_approval')) actions = `<button onclick="cancelSwapUI(${r.id})" class="h-9 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 text-xs font-medium">${t('swap_cancel')}</button>`;
                return `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4 mb-3"><div class="flex justify-between items-start gap-3"><div><p class="text-sm text-white font-medium"><i class="fa-solid fa-arrow-right-arrow-left text-teal-400 mr-2"></i>${esc(empName(r.fromEmpId))} <span class="text-gray-500">(${r.fromShift.day} ${r.fromShift.start}-${r.fromShift.end})</span> → ${toTxt}<span class="text-gray-500">${toShiftTxt}</span></p>${r.note ? `<p class="text-xs text-gray-500 mt-1">${esc(r.note)}</p>` : ''}</div><span class="text-[10px] font-bold px-2 py-1 rounded-md bg-white/5 text-gray-400 whitespace-nowrap">${swapStatusLabel(r.status)}</span></div><div class="flex gap-2 mt-3">${actions}</div></div>`;
            }
            // dayoff
            let actions = '';
            if (kind === 'dayoff_approval') actions = `<button onclick="decideDayOffUI(${r.id}, true)" class="h-9 px-4 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium">${t('dayoff_approve')}</button><button onclick="decideDayOffUI(${r.id}, false)" class="h-9 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium">${t('dayoff_reject')}</button>`;
            return `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4 mb-3"><div class="flex justify-between items-start gap-3"><div><p class="text-sm text-white font-medium"><i class="fa-solid fa-umbrella-beach text-teal-400 mr-2"></i>${esc(empName(r.empId))} — ${r.date}</p>${r.reason ? `<p class="text-xs text-gray-500 mt-1">${esc(r.reason)}</p>` : ''}</div><span class="text-[10px] font-bold px-2 py-1 rounded-md bg-white/5 text-gray-400 whitespace-nowrap">${t('dayoff_status_' + r.status)}</span></div><div class="flex gap-2 mt-3">${actions}</div></div>`;
        }
        function peerRespondSwapUI(id, accept) {
            const r = peerRespondSwap(myEmployeeId(), id, accept);
            if (!r.ok) { showNotification(t('notif_error')); return; }
            showNotification(accept ? t('swap_accepted') : t('swap_rejected'));
            renderRequests(); updateNotifBadge();
        }
        function decideSwapUI(id, approve) {
            const r = decideSwap(id, myEmployeeId(), approve);
            if (!r.ok) { showNotification(t('notif_error')); return; }
            showNotification(approve ? t('swap_approved_msg') : t('swap_rejected'));
            renderRequests(); renderSchedule(); updateNotifBadge();
        }
        function cancelSwapUI(id) {
            const r = cancelSwap(id, myEmployeeId());
            if (!r.ok) { showNotification(t('notif_error')); return; }
            showNotification(t('swap_cancelled_msg'));
            renderRequests();
        }
        function decideDayOffUI(id, approve) {
            const r = decideDayOff(id, myEmployeeId(), approve);
            if (!r.ok) { showNotification(t('notif_error')); return; }
            showNotification(approve ? t('dayoff_approved_msg') : t('dayoff_rejected_msg'));
            renderRequests(); renderSchedule();
        }

        // --- UI: график для сотрудника (подсветка своих смен, обмены, выходные) ---
        function myShiftsForWeek() {
            const me = myEmployeeId();
            if (me == null) return [];
            const out = [];
            const kSched = scheduleDB[activeKitchen] || {};
            WEEK_DAYS.forEach(day => {
                (kSched[day] || []).forEach(s => { if (s.id === me) out.push({ day: day, start: s.start, end: s.end }); });
            });
            return out;
        }
        // (renderSchedule пропатчен в team.js: подсветка своих смен, маркеры выходных, кнопки обмена)
        // --- UI: модалка обмена ---
        let swapDraftFrom = null; // {day, start, end}
        let swapTheirShifts = []; // смены выбранного пира (индекс = value в дропдауне)
        function openSwapModal(day, start, end) {
            const me = myEmployeeId();
            if (me == null || !rolePerm(currentAppRole, 'requestSwap')) return;
            swapDraftFrom = { day: day, start: start, end: end };
            const peerOpts = [{ value: '', label: t('swap_peer_open') }].concat(
                teamDB.filter(e => e.id !== me).map(e => ({ value: String(e.id), label: e.name + (e.role ? ' (' + e.role + ')' : '') }))
            );
            if (!_dropdowns['swap-peer-dd']) ddBuild('swap-peer-dd', { options: peerOpts, value: '', placeholder: t('swap_peer_open'), onChange: refreshSwapTheirShifts });
            else ddSetOptions('swap-peer-dd', peerOpts, '');
            if (!_dropdowns['swap-their-dd']) ddBuild('swap-their-dd', { options: [{ value: '', label: '—' }], value: '', placeholder: '—', onChange: null });
            else ddSetOptions('swap-their-dd', [{ value: '', label: '—' }], '');
            swapTheirShifts = [];
            const note = document.getElementById('swap-note');
            if (note) note.value = '';
            refreshSwapTheirShifts();
            openModal('swap-modal');
        }
        function refreshSwapTheirShifts() {
            const peerId = parseInt(ddGet('swap-peer-dd')) || 0;
            swapTheirShifts = [];
            if (peerId) {
                const kSched = scheduleDB[activeKitchen] || {};
                WEEK_DAYS.forEach(day => { (kSched[day] || []).forEach(s => { if (s.id === peerId) swapTheirShifts.push({ day: day, start: s.start, end: s.end }); }); });
            }
            const opts = [{ value: '', label: t('swap_no_their_shift') }].concat(
                swapTheirShifts.map((s, i) => ({ value: String(i), label: s.day + ' ' + s.start + '-' + s.end }))
            );
            if (_dropdowns['swap-their-dd']) ddSetOptions('swap-their-dd', opts, '');
        }
        function submitSwapRequest() {
            const me = myEmployeeId();
            if (me == null || !swapDraftFrom) return;
            const peerId = parseInt(ddGet('swap-peer-dd')) || null;
            const theirIdx = ddGet('swap-their-dd');
            let toShift = null;
            if (peerId && theirIdx !== '' && theirIdx != null) {
                const s = swapTheirShifts[parseInt(theirIdx)];
                if (s) toShift = { day: s.day, start: s.start, end: s.end };
            }
            const note = (document.getElementById('swap-note') || {}).value || '';
            const r = createSwapRequest({ kitchen: activeKitchen, fromEmpId: me, fromShift: swapDraftFrom, toEmpId: peerId, toShift: toShift, note: note.trim(), createdBy: me });
            if (!r.ok) { showNotification(t('notif_error')); return; }
            closeModal('swap-modal');
            showNotification(t('swap_created'));
            renderRequests(); updateNotifBadge();
        }

        // --- UI: модалка выходного ---
        function openDayOffModal() {
            const me = myEmployeeId();
            if (me == null || !rolePerm(currentAppRole, 'requestDayOff')) return;
            const inp = document.getElementById('dayoff-date');
            if (inp) { inp.value = ''; inp.min = localDateStr(new Date()); }
            const rs = document.getElementById('dayoff-reason');
            if (rs) rs.value = '';
            openModal('dayoff-modal');
        }
        function submitDayOffRequest() {
            const me = myEmployeeId();
            if (me == null) return;
            const date = (document.getElementById('dayoff-date') || {}).value || '';
            const reason = ((document.getElementById('dayoff-reason') || {}).value || '').trim();
            const r = requestDayOff({ kitchen: activeKitchen, empId: me, date: date, reason: reason });
            if (!r.ok) {
                showNotification(r.error === 'dup' ? t('dayoff_dup') : t('notif_error'));
                return;
            }
            closeModal('dayoff-modal');
            showNotification(t('dayoff_requested'));
            renderRequests();
        }

        // --- Карточка сотрудника: личный PIN и уровень доступа (шеф может менять вручную) ---
        function refreshEmpAccessRolePreview() {
            const el = document.getElementById('edit-emp-accessrole');
            if (!el) return;
            const role = (document.getElementById('edit-emp-role') || {}).value || '';
            const ar = deriveAccessRole(role);
            // Должность подсказывает уровень; ручной выбор шефа — в приоритете до следующего ввода должности
            if (!refreshEmpAccessRolePreview._touched) el.value = ar;
        }
        function markEmpAccessTouched() { refreshEmpAccessRolePreview._touched = true; }
