        // --- ПРЕДЗАКАЗЫ (v2.7): публичная страница + приём заказов ---
        let poMyUserId = null;

        function poUserId() {
            if (poMyUserId) return poMyUserId;
            try { const u = (typeof accountUser === 'function') ? accountUser() : null; if (u && u.userId) poMyUserId = u.userId; } catch (e) {}
            return poMyUserId;
        }
        function poAuthHeaders() {
            return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof syncAuthToken === 'function' ? syncAuthToken() : '') };
        }
        function poLocationId() { return (typeof activeLocationId !== 'undefined' && activeLocationId) ? activeLocationId : ''; }

        function poLink() {
            const uid = poUserId();
            if (!uid) return '';
            return location.origin + '/order.html?u=' + encodeURIComponent(uid) + '&loc=' + encodeURIComponent(poLocationId());
        }
        function poCopyLink() {
            const link = poLink();
            if (!link) return;
            const done = () => showNotification(t('po_copied'));
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(done);
            else { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); }
        }

        async function openPreordersModal() {
            // locationsDB нужен публичной странице (название локации); LWW мог его не отправить,
            // если он не менялся после baseline, — помечаем для следующего синка.
            try {
                if (typeof syncMeta !== 'undefined' && syncMeta.keyTs && !syncMeta.keyTs.locationsDB) {
                    syncMeta.keyTs.locationsDB = Date.now();
                    if (typeof markDirty === 'function') markDirty();
                    if (typeof saveState === 'function') saveState();
                }
            } catch (e) {}
            const link = poLink();
            const linkBox = document.getElementById('po-link');
            if (linkBox) linkBox.textContent = link || '—';
            openModal('preorders-modal');
            await poRefreshList();
            poRefreshBadge();
        }
        async function poRefreshList() {
            const box = document.getElementById('po-list');
            if (!box) return;
            box.innerHTML = `<div class="text-sm text-gray-500 py-6 text-center">${t('loading')}</div>`;
            try {
                const r = await fetch('/api/preorders', { headers: poAuthHeaders() });
                const j = await r.json();
                if (!j.ok) throw 0;
                const loc = poLocationId();
                const orders = (j.orders || []).filter(o => !loc || !o.location_id || String(o.location_id) === String(loc));
                if (!orders.length) { box.innerHTML = `<div class="text-sm text-gray-500 py-10 text-center">${t('po_empty')}</div>`; return; }
                const stBadge = s => s === 'new' ? `<span class="text-[11px] font-bold text-amber-400">${t('po_new')}</span>`
                    : s === 'accepted' ? `<span class="text-[11px] font-bold text-blue-400">${t('po_accepted')}</span>`
                    : s === 'done' ? `<span class="text-[11px] font-bold text-emerald-400">${t('po_done')}</span>`
                    : `<span class="text-[11px] font-bold text-gray-500">${t('po_cancelled')}</span>`;
                box.innerHTML = orders.map(o => {
                    const p = o.payload || {};
                    const items = (p.items || []).map(it => `<div class="flex justify-between text-sm"><span class="text-gray-300">${escapeHtml(it.name)} × ${it.qty}</span><span class="text-white font-medium">${typeof currentCurrency !== 'undefined' ? currentCurrency : '$'}${it.qty * it.price}</span></div>`).join('');
                    const dt = new Date(o.created_at);
                    const when = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const btns = o.status === 'new'
                        ? `<button onclick="poSetStatus('${o.id}','accepted')" class="h-9 px-4 rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500 hover:text-white text-xs font-bold transition-colors">${t('po_accept')}</button>
                           <button onclick="poSetStatus('${o.id}','cancelled')" class="h-9 px-4 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 text-xs font-medium transition-colors">${t('cancel')}</button>`
                        : o.status === 'accepted'
                        ? `<button onclick="poComplete('${o.id}')" class="h-9 px-4 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-white text-xs font-bold transition-colors">${t('po_complete')}</button>
                           <button onclick="poSetStatus('${o.id}','cancelled')" class="h-9 px-4 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 text-xs font-medium transition-colors">${t('cancel')}</button>`
                        : '';
                    return `<div class="bg-[#1C1C1E] border border-white/5 rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-2">
                            <p class="font-bold text-white">${escapeHtml(p.name || '')} ${p.phone ? `<span class="font-normal text-xs text-gray-500">${escapeHtml(p.phone)}</span>` : ''}</p>
                            ${stBadge(o.status)}
                        </div>
                        <div class="flex flex-col gap-1 mb-2">${items}</div>
                        <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
                            <span>${p.pickupTime ? `<i class="fa-regular fa-clock mr-1"></i>${escapeHtml(p.pickupTime)}` : ''} ${p.note ? ' · ' + escapeHtml(p.note) : ''}</span>
                            <span class="font-bold text-white text-sm">${typeof currentCurrency !== 'undefined' ? currentCurrency : '$'}${p.total || 0}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] text-gray-600">${when} · #${escapeHtml(String(o.id).slice(-6))}</span>
                            <div class="flex gap-2">${btns}</div>
                        </div>
                    </div>`;
                }).join('');
            } catch (e) {
                box.innerHTML = `<div class="text-sm text-red-400 py-6 text-center">${t('po_failed')}</div>`;
            }
        }
        async function poSetStatus(id, st) {
            try {
                await fetch('/api/preorders/status', { method: 'POST', headers: poAuthHeaders(), body: JSON.stringify({ id, status: st }) });
            } catch (e) {}
            await poRefreshList(); poRefreshBadge();
        }
        // "Готов": заказ уходит в продажи (склад, финансы), без KDS-тикета
        async function poComplete(id) {
            try {
                const r = await fetch('/api/preorders', { headers: poAuthHeaders() });
                const j = await r.json();
                const o = (j.orders || []).find(x => String(x.id) === String(id));
                if (o && o.payload && Array.isArray(o.payload.items)) {
                    const items = {};
                    o.payload.items.forEach(it => { if (it.id && it.qty > 0) items[it.id] = (items[it.id] || 0) + it.qty; });
                    if (Object.keys(items).length && typeof commitSale === 'function') commitSale(items, { skipKds: true });
                }
            } catch (e) {}
            await poSetStatus(id, 'done');
            showNotification(t('po_done_msg'));
        }
        async function poRefreshBadge() {
            const badge = document.getElementById('tile-preorders-badge');
            if (!badge) return;
            try {
                const r = await fetch('/api/preorders', { headers: poAuthHeaders() });
                const j = await r.json();
                const loc = poLocationId();
                const n = (j.orders || []).filter(o => o.status === 'new' && (!loc || !o.location_id || String(o.location_id) === String(loc))).length;
                badge.textContent = n > 99 ? '99+' : n;
                badge.classList.toggle('hidden', !n);
            } catch (e) {}
        }
        // Бейдж при старте и раз в минуту (палатка ждёт заказы)
        setTimeout(() => { try { poRefreshBadge(); } catch (e) {} setInterval(() => { try { poRefreshBadge(); } catch (e) {} }, 60000); }, 5000);
