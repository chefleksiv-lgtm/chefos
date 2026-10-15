        // --- ЗАГОТОВКИ НА СМЕНУ (prep lists) ---
        // Шеф составляет список заготовок и ОТПРАВЛЯЕТ поварам, которые сейчас на смене.
        // Повара на смене видят список у себя и отмечают готовность галочками.
        // prepDB: [{id, date:'YYYY-MM-DD', shift:'утро'|'день'|'вечер', authorId, authorName,
        //          items:[{name, qty, unit, note, done}], status:'draft'|'sent'|'done',
        //          assignees:[{id, name}], createdAt, sentAt, doneAt}]
        function prepEsc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
        function prepCanView() {
            return (typeof PERMISSIONS !== 'undefined' && PERMISSIONS[currentAppRole] && PERMISSIONS[currentAppRole].prepCheck) === true;
        }
        function prepCanApprove() {
            return currentAppRole === 'chef' || currentAppRole === 'souschef';
        }
        function prepAuthorName() {
            const id = (typeof myEmployeeId === 'function') ? myEmployeeId() : null;
            if (id != null && typeof empName === 'function') { const n = empName(id); if (n && n !== '?') return n; }
            const labels = { chef: 'Шеф', souschef: 'Су-шеф', cook: 'Повар', cashier: 'Касса' };
            return labels[currentAppRole] || 'Сотрудник';
        }
        function prepAuthorId() {
            const id = (typeof myEmployeeId === 'function') ? myEmployeeId() : null;
            return (id != null) ? id : ('role:' + (currentAppRole || 'unknown'));
        }
        function prepFmtDate(ds) {
            if (!ds) return '';
            const p = String(ds).split('-');
            return (p.length === 3) ? (p[2] + '.' + p[1] + '.' + p[0]) : ds;
        }
        function prepShiftLabel(s) {
            return { 'утро': 'Утро', 'день': 'День', 'вечер': 'Вечер' }[s] || s || '';
        }
        function prepStatusBadge(st) {
            if (st === 'done') return '<span class="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Выполнен</span>';
            if (st === 'sent') return '<span class="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">На смене</span>';
            return '<span class="text-[11px] px-2.5 py-1 rounded-full bg-white/10 text-gray-400 border border-white/10">Черновик</span>';
        }

        // --- Кто сейчас на смене: сначала табель (отбиты и не закрыты), потом график ---
        function prepOnShiftCooks() {
            const tdb = (typeof teamDB !== 'undefined' && Array.isArray(teamDB)) ? teamDB : [];
            const byId = {};
            tdb.forEach(e => { byId[String(e.id)] = e; });
            const isCook = e => e && e.accessRole === 'cook';
            // 1) Табель: clockIn без clockOut за последние 16 часов
            try {
                const now = Date.now();
                const open = ((typeof timeclockDB !== 'undefined' && Array.isArray(timeclockDB)) ? timeclockDB : [])
                    .filter(e => e && !e.clockOut && e.clockIn && (now - new Date(e.clockIn).getTime()) < 16 * 3600 * 1000);
                const ids = [...new Set(open.map(e => String(e.employeeId)))];
                const cooks = ids.map(id => byId[id]).filter(isCook);
                if (cooks.length) return cooks.map(e => ({ id: e.id, name: e.name }));
            } catch (e) {}
            // 2) График: запланированные на сегодня
            try {
                const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date().getDay()];
                const sk = (typeof scheduleDB !== 'undefined') ? scheduleDB : {};
                const ak = (typeof activeKitchen !== 'undefined') ? activeKitchen : null;
                const dayArr = (sk && ak && sk[ak] && sk[ak][wd]) || [];
                const seen = {};
                const cooks = [];
                dayArr.forEach(s => {
                    const e = byId[String(s.id)];
                    if (isCook(e) && !seen[String(e.id)]) { seen[String(e.id)] = 1; cooks.push(e); }
                });
                return cooks.map(e => ({ id: e.id, name: e.name }));
            } catch (e) {}
            return [];
        }

        // --- Список ---
        function renderPrep() {
            const box = document.getElementById('prep-list');
            if (!box) return;
            if (!prepCanView()) { box.innerHTML = ''; return; }
            const dateInput = document.getElementById('prep-date');
            if (dateInput && !dateInput.value && typeof localDateStr === 'function') dateInput.value = localDateStr(new Date());
            const fDate = dateInput ? dateInput.value : '';
            const myId = prepAuthorId();
            let lists = (typeof prepDB !== 'undefined' ? prepDB : []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            if (fDate) lists = lists.filter(p => p.date === fDate);
            // Повар видит списки, назначенные ему (или свои черновики); шеф/су-шеф — все.
            if (!prepCanApprove()) lists = lists.filter(p =>
                String(p.authorId) === String(myId) ||
                (p.assignees || []).some(a => String(a.id) === String(myId)));

            if (!lists.length) {
                box.innerHTML = '<div class="text-center text-gray-500 py-10 text-sm">Нет заготовок на эту дату.<br>Нажмите «Новая заготовка», чтобы составить список на смену.</div>';
                return;
            }
            box.innerHTML = lists.map(p => {
                const items = Array.isArray(p.items) ? p.items : [];
                const done = items.filter(i => i.done).length;
                const pct = items.length ? Math.round(done / items.length * 100) : 0;
                const isMine = String(p.authorId) === String(myId);
                const canEditDraft = (p.status === 'draft') && (isMine || prepCanApprove());
                const canCheck = (p.status === 'sent' || (p.status === 'done' && prepCanApprove())) &&
                    ((p.assignees || []).some(a => String(a.id) === String(myId)) || prepCanApprove());
                const assignees = (p.assignees || []).map(a => a.name).join(', ');
                const itemsHtml = items.map((it, idx) => {
                    return `<label class="flex items-center gap-3 py-2 ${canCheck ? 'cursor-pointer' : ''}">
                        <input type="checkbox" ${it.done ? 'checked' : ''} ${canCheck ? '' : 'disabled'} onchange="prepToggleItem(${p.id}, ${idx})" class="w-5 h-5 accent-teal-500 shrink-0 ${canCheck ? 'cursor-pointer' : 'opacity-40'}">
                        <span class="flex-1 text-sm ${it.done ? 'line-through text-gray-500' : 'text-gray-200'}">${prepEsc(it.name)}${it.qty ? ' <span class="text-gray-400">— ' + prepEsc(it.qty) + (it.unit ? ' ' + prepEsc(it.unit) : '') + '</span>' : ''}${it.note ? '<div class="text-xs text-gray-500">' + prepEsc(it.note) + '</div>' : ''}</span>
                    </label>`;
                }).join('');
                let actions = '';
                if (p.status === 'draft' && canEditDraft) {
                    actions = `<div class="flex gap-2 mt-3">
                        <button onclick="openPrepEditor(${p.id})" class="flex-1 h-10 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"><i class="fa-solid fa-pen mr-2"></i>Редактировать</button>
                        <button onclick="prepSend(${p.id})" class="flex-1 h-10 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium transition-colors"><i class="fa-solid fa-paper-plane mr-2"></i>Поварам на смене</button>
                        <button onclick="prepDelete(${p.id})" class="h-10 w-10 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-colors" title="Удалить"><i class="fa-solid fa-trash-can"></i></button>
                    </div>`;
                } else if (p.status === 'draft') {
                    actions = `<div class="mt-3 text-xs text-gray-500"><i class="fa-solid fa-pen mr-1.5"></i>Черновик автора, ещё не отправлен.</div>`;
                } else if (p.status === 'done') {
                    actions = `<div class="mt-3 flex items-center justify-between gap-2"><span class="text-xs text-emerald-300/80"><i class="fa-solid fa-check-double mr-1.5"></i>Выполнен — все позиции готовы.</span>${prepCanApprove() ? `<button onclick="prepDelete(${p.id})" class="h-9 w-9 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-colors shrink-0" title="Удалить"><i class="fa-solid fa-trash-can text-sm"></i></button>` : ''}</div>`;
                } else if (p.status === 'sent') {
                    actions = prepCanApprove() ? `<div class="mt-3 flex justify-end"><button onclick="prepDelete(${p.id})" class="h-9 px-4 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white text-xs font-medium transition-colors"><i class="fa-solid fa-trash-can mr-1.5"></i>Удалить список</button></div>` : '';
                }
                const assignHtml = (p.status !== 'draft' && assignees)
                    ? `<div class="text-xs text-gray-500 mb-1"><i class="fa-solid fa-users mr-1.5 text-teal-400"></i>${prepEsc(assignees)}</div>` : '';
                return `<div class="bg-[#1C1C1E] border border-white/10 rounded-2xl p-4">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <div class="font-medium text-white text-sm">${prepEsc(p.authorName)} <span class="text-gray-500 font-normal">· ${prepFmtDate(p.date)} · ${prepEsc(prepShiftLabel(p.shift))}</span></div>
                        ${prepStatusBadge(p.status)}
                    </div>
                    ${assignHtml}
                    ${items.length ? `<div class="h-1.5 bg-white/10 rounded-full mt-2 mb-1 overflow-hidden"><div class="h-full bg-teal-500 rounded-full transition-all" style="width:${pct}%"></div></div>
                    <div class="text-[11px] text-gray-500 mb-1">Готово ${done} из ${items.length}</div>` : '<div class="text-xs text-gray-600 my-2">Список пуст</div>'}
                    <div class="divide-y divide-white/5">${itemsHtml}</div>
                    ${actions}
                </div>`;
            }).join('');
        }

        function prepToggleItem(id, idx) {
            const p = (typeof prepDB !== 'undefined' ? prepDB : []).find(x => x.id === id);
            if (!p || !Array.isArray(p.items) || !p.items[idx]) return;
            if (p.status !== 'sent' && !(p.status === 'done' && prepCanApprove())) { renderPrep(); return; }
            const myId = prepAuthorId();
            const isAssignee = (p.assignees || []).some(a => String(a.id) === String(myId));
            if (!isAssignee && !prepCanApprove()) { renderPrep(); return; }
            p.items[idx].done = !p.items[idx].done;
            // Снятие галочки с выполненного списка (шеф) — список снова «отправлен».
            if (p.status === 'done' && !p.items[idx].done) {
                p.status = 'sent';
                delete p.doneAt;
            }
            if (p.items.length && p.items.every(i => i.done)) {
                p.status = 'done';
                p.doneAt = Date.now();
                markDirty();
                renderPrep();
                showNotification('Заготовка выполнена — все позиции готовы');
                if (typeof notifyUser === 'function' && p.authorId != null && String(p.authorId).indexOf('role:') !== 0 && String(p.authorId) !== String(myId)) {
                    notifyUser(p.authorId, 'prep', 'Заготовка выполнена (' + prepFmtDate(p.date) + ', ' + prepShiftLabel(p.shift) + '): все позиции готовы', p.id);
                }
                return;
            }
            markDirty();
            renderPrep();
        }

        function prepSend(id) {
            const p = (typeof prepDB !== 'undefined' ? prepDB : []).find(x => x.id === id);
            if (!p || p.status !== 'draft') return;
            if (!p.items || !p.items.length) { showNotification('Список пуст — добавьте позиции'); return; }
            const cooks = prepOnShiftCooks();
            if (!cooks.length) { showNotification('Нет поваров на смене: отметьте приход в Табеле или проверьте график'); return; }
            const names = cooks.map(c => c.name).join(', ');
            showConfirm('Отправить поварам на смене?',
                '«' + prepFmtDate(p.date) + ' · ' + prepShiftLabel(p.shift) + '» (' + p.items.length + ' поз.) получат: ' + names + '. После отправки список уйдёт в работу.',
                () => {
                    p.status = 'sent';
                    p.sentAt = Date.now();
                    p.assignees = cooks;
                    markDirty();
                    if (typeof notifyUser === 'function') {
                        cooks.forEach(c => notifyUser(c.id, 'prep',
                            'Новая заготовка на смену (' + prepFmtDate(p.date) + ', ' + prepShiftLabel(p.shift) + ', ' + p.items.length + ' поз.) от ' + p.authorName, p.id));
                    }
                    renderPrep();
                    showNotification('Отправлено поварам: ' + names);
                });
        }

        function prepDelete(id) {
            const p = (typeof prepDB !== 'undefined' ? prepDB : []).find(x => x.id === id);
            if (!p) return;
            const myId = prepAuthorId();
            const isDraft = p.status === 'draft';
            // Черновик — автор или шеф; отправленный/выполненный — только шеф/су-шеф.
            if (isDraft ? (String(p.authorId) !== String(myId) && !prepCanApprove()) : !prepCanApprove()) return;
            showConfirm('Удалить заготовку?', isDraft ? 'Черновик будет удалён без возможности восстановления.' : 'Список будет удалён без возможности восстановления.', () => {
                const i = prepDB.findIndex(x => x.id === id);
                if (i >= 0) prepDB.splice(i, 1);
                markDirty();
                renderPrep();
            });
        }

        // --- Редактор ---
        let _prepEditId = null;
        let _prepEditItems = [];

        function openPrepEditor(id) {
            if (!prepCanView()) return;
            _prepEditId = id || null;
            const p = id ? prepDB.find(x => x.id === id) : null;
            _prepEditItems = p && Array.isArray(p.items) ? JSON.parse(JSON.stringify(p.items)) : [];
            const d = document.getElementById('prep-edit-date');
            if (d) d.value = (p && p.date) ? p.date : ((typeof localDateStr === 'function') ? localDateStr(new Date()) : '');
            const s = document.getElementById('prep-edit-shift');
            if (s) s.value = (p && p.shift) ? p.shift : 'утро';
            document.getElementById('prep-edit-title').textContent = p ? 'Редактировать заготовку' : 'Новая заготовка';
            renderPrepEditItems();
            openModal('prep-modal');
        }

        function renderPrepEditItems() {
            const box = document.getElementById('prep-edit-items');
            if (!box) return;
            if (!_prepEditItems.length) {
                box.innerHTML = '<div class="text-center text-gray-500 text-sm py-6">Пока пусто — добавьте первую позицию кнопкой ниже.</div>';
                return;
            }
            box.innerHTML = _prepEditItems.map((it, i) => `
                <div class="flex gap-2 items-start bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <div class="flex-1 grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Что заготовить" value="${prepEsc(it.name)}" oninput="_prepEditItems[${i}].name = this.value" class="col-span-2 h-10 bg-[#2C2C2E] border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-teal-500">
                        <input type="text" placeholder="Кол-во" value="${prepEsc(it.qty)}" oninput="_prepEditItems[${i}].qty = this.value" class="h-10 bg-[#2C2C2E] border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-teal-500">
                        <input type="text" placeholder="Ед. (кг, шт, л)" value="${prepEsc(it.unit)}" oninput="_prepEditItems[${i}].unit = this.value" class="h-10 bg-[#2C2C2E] border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-teal-500">
                        <input type="text" placeholder="Примечание (необязательно)" value="${prepEsc(it.note)}" oninput="_prepEditItems[${i}].note = this.value" class="col-span-2 h-10 bg-[#2C2C2E] border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-teal-500">
                    </div>
                    <button onclick="_prepEditItems.splice(${i},1); renderPrepEditItems();" class="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-colors" title="Убрать"><i class="fa-solid fa-xmark"></i></button>
                </div>`).join('');
        }

        function prepCollectEdit() {
            const d = document.getElementById('prep-edit-date');
            const s = document.getElementById('prep-edit-shift');
            const items = _prepEditItems
                .map(it => ({ name: String(it.name || '').trim(), qty: String(it.qty || '').trim(), unit: String(it.unit || '').trim(), note: String(it.note || '').trim(), done: !!it.done }))
                .filter(it => it.name);
            return { date: d ? d.value : '', shift: s ? s.value : 'утро', items: items };
        }

        function prepSaveDraft() {
            const v = prepCollectEdit();
            if (!v.date) { showNotification('Укажите дату смены'); return null; }
            if (!v.items.length) { showNotification('Добавьте хотя бы одну позицию'); return null; }
            if (_prepEditId) {
                const p = prepDB.find(x => x.id === _prepEditId);
                if (!p || p.status !== 'draft') return null;
                p.date = v.date; p.shift = v.shift; p.items = v.items;
            } else {
                _prepEditId = Date.now();
                prepDB.push({
                    id: _prepEditId, date: v.date, shift: v.shift,
                    authorId: prepAuthorId(), authorName: prepAuthorName(),
                    items: v.items, status: 'draft', assignees: [],
                    createdAt: Date.now()
                });
            }
            markDirty();
            closeModal('prep-modal');
            renderPrep();
            showNotification('Черновик сохранён');
            return _prepEditId;
        }

        function prepSaveAndSend() {
            const id = prepSaveDraft();
            if (id) prepSend(id);
        }
