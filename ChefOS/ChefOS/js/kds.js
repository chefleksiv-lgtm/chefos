        // --- KDS: ЭКРАН КУХНИ (v2.2) ---
        // Тикеты создаются автоматически при внесении продаж (sales.js).
        let kdsTimer = null;

        function openKDSModal() {
            renderKDS();
            openModal('kds-modal');
            if (kdsTimer) clearInterval(kdsTimer);
            kdsTimer = setInterval(() => {
                const m = document.getElementById('kds-modal');
                if (!m || m.classList.contains('hidden')) { clearInterval(kdsTimer); kdsTimer = null; return; }
                renderKDS();
            }, 20000);
        }
        function kdsThreshold() {
            const d = { green: 5, amber: 10 };
            try {
                if (kdsThresholds && typeof kdsThresholds === 'object') {
                    if (kdsThresholds.green > 0) d.green = kdsThresholds.green;
                    if (kdsThresholds.amber > d.green) d.amber = kdsThresholds.amber;
                    else d.amber = d.green + 5;
                }
            } catch (e) {}
            return d;
        }
        function toggleKDSSettings() {
            const b = document.getElementById('kds-settings-block');
            if (!b) return;
            const open = b.classList.toggle('hidden');
            if (!open) {
                const th = kdsThreshold();
                document.getElementById('kds-th-green').value = th.green;
                document.getElementById('kds-th-amber').value = th.amber;
            }
        }
        function saveKDSThresholds() {
            if (currentAppRole !== 'chef') { showNotification(t('chef_only')); return; }
            let g = Math.max(1, parseInt(document.getElementById('kds-th-green').value) || 5);
            let a = Math.max(g + 1, parseInt(document.getElementById('kds-th-amber').value) || 10);
            kdsThresholds = { green: g, amber: a };
            markDirty();
            document.getElementById('kds-settings-block').classList.add('hidden');
            renderKDS();
            showNotification(t('notif_saved'));
        }
        function kdsElapsedMin(ts) {
            return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000));
        }
        function kdsElapsedTxt(ts) {
            const m = kdsElapsedMin(ts);
            if (m < 60) return m + ' ' + t('kds_min');
            return Math.floor(m / 60) + ' ' + t('kds_hr') + ' ' + (m % 60) + ' ' + t('kds_min');
        }
        function bumpTicket(id) {
            const tk = (kdsDB || []).find(x => x.id === id);
            if (!tk) return;
            tk.status = 'done';
            markDirty();
            renderKDS();
        }
        function clearDoneTickets() {
            kdsDB = (kdsDB || []).filter(x => x.status !== 'done');
            markDirty();
            renderKDS();
        }
        function renderKDS() {
            if (!Array.isArray(kdsDB)) kdsDB = [];
            const active = kdsDB.filter(x => x.status === 'new').sort((a, b) => new Date(a.ts) - new Date(b.ts));
            const done = kdsDB.filter(x => x.status === 'done').sort((a, b) => new Date(b.ts) - new Date(a.ts));
            const box = document.getElementById('kds-tickets');
            document.getElementById('kds-active-count').textContent = active.length;
            const clearBtn = document.getElementById('kds-clear-btn');
            if (clearBtn) clearBtn.style.display = done.length ? '' : 'none';
            const setBtn = document.getElementById('kds-settings-btn');
            if (setBtn) setBtn.style.display = currentAppRole === 'chef' ? '' : 'none';
            const sndBtn = document.getElementById('kds-sound-btn');
            if (sndBtn) sndBtn.innerHTML = `<i class="fa-solid ${kdsSound === false ? 'fa-volume-xmark' : 'fa-volume-high'} text-sm"></i>`;
            if (!active.length && !done.length) {
                box.innerHTML = `<div class="col-span-full text-center py-16"><i class="fa-solid fa-bell-concierge text-4xl text-gray-700 mb-4"></i><p class="text-gray-500 text-sm">${t('kds_empty')}</p></div>`;
                return;
            }
            const doneHtml = done.map(tk => `
                <div class="bg-[#1C1C1E] border border-green-500/40 rounded-2xl p-5 flex flex-col opacity-60">
                    <div class="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                        <span class="text-lg font-bold text-white">#${tk.num}${tk.table ? ` <span class="text-amber-400 text-sm font-semibold">· ${escapeHtml(tk.table)}</span>` : ""}</span>
                        <span class="text-sm font-bold text-green-400"><i class="fa-solid fa-check mr-1"></i>${t('kds_done')}</span>
                    </div>
                    <div class="flex-1 space-y-2">
                        ${(tk.items || []).map(it => `<div class="flex items-baseline gap-2"><span class="text-2xl font-bold text-green-400/70 w-10 shrink-0">${it.qty}×</span><span class="text-gray-300 font-medium leading-snug">${escapeHtml(it.name)}</span></div>`).join('')}
                    </div>
                </div>`).join('');
            box.innerHTML = active.map(tk => {
                const mins = kdsElapsedMin(tk.ts);
                const th = kdsThreshold();
                const state = mins < th.green ? 'ok' : (mins <= th.amber ? 'warn' : 'late');
                const border = state === 'ok' ? 'border-teal-500/40' : (state === 'warn' ? 'border-amber-500/40' : 'border-red-500/60');
                const timeCls = state === 'ok' ? 'text-teal-400' : (state === 'warn' ? 'text-amber-400' : 'text-red-400');
                const tint = state === 'ok' ? '' : (state === 'warn' ? ' bg-amber-500/5' : ' bg-red-500/10');
                const chipCls = state === 'ok' ? 'bg-teal-500/20 text-teal-300' : (state === 'warn' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/25 text-red-300');
                const chipTxt = t('kds_state_' + state);
                return `
                <div class="bg-[#1C1C1E] border ${border}${tint} rounded-2xl p-5 flex flex-col">
                    <div class="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                        <span class="text-lg font-bold text-white">#${tk.num}${tk.table ? ` <span class="text-amber-400 text-sm font-semibold">· ${escapeHtml(tk.table)}</span>` : ""}${tk.takeaway ? ` <span class="ml-1 px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/50 text-sky-300 text-[11px] font-bold align-middle">${t('takeaway_tag')}${tk.customer ? ' · ' + escapeHtml(tk.customer) : ''}</span>` : ""}</span>
                        <span class="flex items-center gap-2"><span class="text-[11px] font-bold px-2 py-1 rounded-full ${chipCls}">${chipTxt}</span><span class="text-xl font-bold ${timeCls} ${state === 'late' ? 'animate-pulse' : ''}"><i class="fa-regular fa-clock mr-1"></i>${kdsElapsedTxt(tk.ts)}</span></span>
                    </div>
                    ${tk.allergies && tk.allergies.length ? `<div class="mb-3 px-3 py-2 rounded-xl bg-red-500/20 border-2 border-red-500/70 text-red-300 text-sm font-bold flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation"></i><span>${t('kds_allergies')}: ${tk.allergies.map(a => t('alg_' + a)).join(', ')}</span></div>` : ''}
                    <div class="flex-1 space-y-2 mb-4">
                        ${tk.items.map(it => `<div class="flex items-baseline gap-2"><span class="text-2xl font-bold text-orange-400 w-10 shrink-0">${it.qty}×</span><span class="text-white font-medium leading-snug">${escapeHtml(it.name)}</span></div>`).join('')}
                    </div>
                    <button onclick="bumpTicket(${tk.id})" class="w-full h-12 rounded-xl bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white font-bold text-sm transition-colors"><i class="fa-solid fa-check mr-2"></i>${t('kds_done')}</button>
                </div>`;
            }).join('') + doneHtml;
        }

        // 2.1.24: звук нового заказа (WebAudio, без файлов) + переключатель
        function kdsBeep() {
            try {
                if (typeof kdsSound !== 'undefined' && kdsSound === false) return;
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                const ctx = new AC();
                [0, 0.25].forEach((delay, i) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'sine'; o.frequency.value = i === 0 ? 880 : 1174;
                    g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
                    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + delay + 0.02);
                    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.22);
                    o.connect(g); g.connect(ctx.destination);
                    o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.25);
                });
            } catch (e) {}
        }
        function toggleKDSSound() {
            kdsSound = (typeof kdsSound === 'undefined' || kdsSound === true) ? false : true;
            markDirty(); renderKDS();
            showNotification(t(kdsSound ? 'kds_sound_on' : 'kds_sound_off'));
        }
