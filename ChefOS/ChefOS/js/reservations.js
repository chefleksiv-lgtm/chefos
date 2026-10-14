        // --- БРОНИРОВАНИЕ СТОЛИКОВ (v2.6) ---
        let resvDate = '';
        let editingResvId = null;

        function resvToday() { return new Date().toISOString().slice(0, 10); }
        function renderReservations() {
            const box = document.getElementById('reservations-list');
            if (!box) return;
            if (!resvDate) resvDate = resvToday();
            const inp = document.getElementById('resv-date');
            if (inp && !inp.value) inp.value = resvDate;
            const rows = (typeof reservationsDB !== 'undefined' ? reservationsDB : [])
                .filter(r => r.date === resvDate)
                .sort((a, b) => String(a.time).localeCompare(String(b.time)));
            if (!rows.length) { box.innerHTML = `<div class="text-sm text-gray-500 py-3">${t('resv_empty')}</div>`; return; }
            const tname = id => { const tb = (typeof tablesDB !== 'undefined' ? tablesDB : []).find(x => String(x.id) === String(id)); return tb ? escapeHtml(tb.name || ('#' + tb.id)) : '—'; };
            box.innerHTML = rows.map(r => {
                const st = r.status === 'done'
                    ? `<span class="text-[11px] font-semibold text-emerald-400">${t('resv_done')}</span>`
                    : r.status === 'cancelled'
                    ? `<span class="text-[11px] font-semibold text-gray-500">${t('resv_cancelled')}</span>`
                    : `<span class="text-[11px] font-semibold text-amber-400">${t('resv_new')}</span>`;
                const acts = r.status === 'new'
                    ? `<button onclick="resvSetStatus('${r.id}','done')" class="h-8 px-3 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white text-xs font-semibold transition-colors">${t('resv_seat')}</button>
                       <button onclick="resvSetStatus('${r.id}','cancelled')" class="h-8 px-3 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 text-xs font-medium transition-colors">${t('cancel')}</button>`
                    : '';
                return `<div class="bg-[#1C1C1E] border border-white/5 rounded-xl p-3 flex items-center gap-3 ${r.status === 'cancelled' ? 'opacity-50' : ''}">
                    <div class="w-12 shrink-0 text-center"><p class="text-sm font-bold text-white">${escapeHtml(r.time || '')}</p></div>
                    <div class="flex-1 min-w-0"><p class="text-sm font-medium text-white truncate">${escapeHtml(r.name || '')} · ${r.guests || 1} ${t('resv_guests')}</p>
                    <p class="text-[11px] text-gray-500 truncate">${t('resv_table')}: ${tname(r.tableId)}${r.phone ? ' · ' + escapeHtml(r.phone) : ''}${r.note ? ' · ' + escapeHtml(r.note) : ''}</p></div>
                    ${st}<div class="flex gap-1.5 shrink-0">${acts}
                    <button onclick="resvDelete('${r.id}')" class="w-8 h-8 rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button></div>
                </div>`;
            }).join('');
        }
        function openReservationModal(id) {
            editingResvId = id || null;
            const r = id ? reservationsDB.find(x => String(x.id) === String(id)) : null;
            document.getElementById('resv-f-date').value = r ? r.date : (resvDate || resvToday());
            document.getElementById('resv-f-time').value = r ? r.time : '';
            document.getElementById('resv-f-name').value = r ? r.name : '';
            document.getElementById('resv-f-phone').value = r ? (r.phone || '') : '';
            document.getElementById('resv-f-guests').value = r ? r.guests : 2;
            document.getElementById('resv-f-note').value = r ? (r.note || '') : '';
            const sel = document.getElementById('resv-f-table');
            sel.innerHTML = `<option value="">${t('resv_no_table')}</option>` + (typeof tablesDB !== 'undefined' ? tablesDB : []).map(tb => `<option value="${tb.id}"${r && String(r.tableId) === String(tb.id) ? ' selected' : ''}>${escapeHtml(tb.name || ('#' + tb.id))}</option>`).join('');
            document.getElementById('resv-modal-title').textContent = r ? t('resv_edit') : t('resv_new_title');
            openModal('reservation-modal');
        }
        function saveReservation() {
            const date = document.getElementById('resv-f-date').value;
            const time = document.getElementById('resv-f-time').value;
            const name = document.getElementById('resv-f-name').value.trim();
            if (!date || !time || !name) { showNotification(t('resv_fill')); return; }
            const data = {
                date: date, time: time, name: name,
                phone: document.getElementById('resv-f-phone').value.trim(),
                guests: Math.max(1, parseInt(document.getElementById('resv-f-guests').value) || 1),
                tableId: document.getElementById('resv-f-table').value || null,
                note: document.getElementById('resv-f-note').value.trim()
            };
            if (editingResvId) {
                const r = reservationsDB.find(x => String(x.id) === String(editingResvId));
                if (r) Object.assign(r, data);
            } else {
                reservationsDB.push(Object.assign({ id: 'r' + Date.now(), status: 'new' }, data));
            }
            markDirty(); closeModal('reservation-modal'); renderReservations();
            showNotification(t('notif_saved'));
        }
        function resvSetStatus(id, st) {
            const r = reservationsDB.find(x => String(x.id) === String(id));
            if (!r) return;
            r.status = st; markDirty(); renderReservations();
        }
        function resvDelete(id) {
            showConfirm(t('confirm_title'), t('confirm_msg'), () => {
                reservationsDB = reservationsDB.filter(x => String(x.id) !== String(id));
                markDirty(); renderReservations(); showNotification(t('notif_deleted'));
            });
        }
        function resvDateChange(v) { resvDate = v || resvToday(); renderReservations(); }
