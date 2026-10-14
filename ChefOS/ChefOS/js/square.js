        // --- ИМПОРТ ПРОДАЖ ИЗ SQUARE (v2.7) ---
        let sqLastItems = [];

        function sqNorm(n) { return String(n || '').trim().toLowerCase(); }
        function sqMatchDish(name) {
            const mdb = (typeof menuDB !== 'undefined' && Array.isArray(menuDB)) ? menuDB : [];
            return mdb.find(d => sqNorm(d.name) === sqNorm(name)) || null;
        }
        async function sqLoadDay() {
            const inp = document.getElementById('square-date');
            const date = inp.value;
            if (!date) { showNotification(t('sq_pick_date')); return; }
            const box = document.getElementById('square-preview');
            box.innerHTML = `<div class="text-sm text-gray-500 py-3">${t('loading')}</div>`;
            sqLastItems = [];
            try {
                const r = await fetch('/api/square-import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof syncAuthToken === 'function' ? syncAuthToken() : '') },
                    body: JSON.stringify({ date })
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok || !j.ok) {
                    box.innerHTML = `<div class="text-sm text-red-400 py-3">${t(j.error === 'no_square' ? 'sq_no_key' : 'sq_failed')}</div>`;
                    return;
                }
                sqLastItems = (j.items || []).map(it => ({ name: it.name, qty: it.qty, dish: sqMatchDish(it.name) }));
                if (!sqLastItems.length) { box.innerHTML = `<div class="text-sm text-gray-500 py-3">${t('sq_empty')}</div>`; return; }
                const matched = sqLastItems.filter(x => x.dish).length;
                box.innerHTML = `<div class="text-xs text-gray-500 mb-2">${t('sq_orders')}: ${j.orders || 0} · ${t('sq_matched')}: ${matched}/${sqLastItems.length}</div>`
                    + sqLastItems.map(x => `<div class="bg-[#1C1C1E] border border-white/5 rounded-xl p-3 flex items-center gap-3">
                        <div class="flex-1 min-w-0"><p class="text-sm font-medium text-white truncate">${escapeHtml(x.name)}</p>
                        <p class="text-[11px] ${x.dish ? 'text-emerald-400' : 'text-amber-400'}">${x.dish ? '✓ ' + escapeHtml(x.dish.name) : t('sq_unmatched')}</p></div>
                        <span class="text-sm font-bold text-white whitespace-nowrap">× ${x.qty}</span></div>`).join('')
                    + (matched ? `<button onclick="sqCommit()" class="mt-3 h-12 w-full rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold transition-colors">${t('sq_commit')}</button>` : '');
            } catch (e) {
                box.innerHTML = `<div class="text-sm text-red-400 py-3">${t('sq_failed')}</div>`;
            }
        }
        function sqCommit() {
            const items = {};
            sqLastItems.forEach(x => { if (x.dish && x.qty > 0) items[x.dish.id] = (items[x.dish.id] || 0) + x.qty; });
            if (!Object.keys(items).length) return;
            const date = document.getElementById('square-date').value;
            const n = commitSale(items, { skipKds: true, monthKey: date.slice(0, 7) });
            sqLastItems = [];
            document.getElementById('square-preview').innerHTML = '';
            renderFinanceTab();
            showNotification(t('sq_done') + ': ' + n);
        }
