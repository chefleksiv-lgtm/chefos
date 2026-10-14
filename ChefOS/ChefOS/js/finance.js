        // --- ФИНАНСЫ (Отчеты) ---
        function renderFinanceTab() {
            const dateSel = document.getElementById('finance-month-selector');
            if(!dateSel.value) dateSel.value = getCurrentMonthKey();
            const key = dateSel.value;
            
            const data = financeDB[key] || { income: 0, cogs: 0, payroll: 0, losses: 0 };

            // Точный учёт зарплаты (v2.1): сумма записей журнала за месяц.
            // Старая оценка «недельные часы × 4» убрана — цифры должны сходиться с выплатами.
            if (!Array.isArray(payrollDB)) payrollDB = [];
            const monthPayroll = payrollDB
                .filter(p => (p.date || '').startsWith(key))
                .reduce((s, p) => s + (Number(p.amount) || 0), 0);
            data.payroll = Math.round(monthPayroll * 100) / 100;

            let totalAssets = 0;
            inventoryDB.forEach(i => { totalAssets += i.quantity * i.price; });

            document.getElementById('finance-income').textContent = `${currentCurrency}${data.income.toLocaleString('ru-RU')}`;
            document.getElementById('finance-cogs').textContent = `${currentCurrency}${data.cogs.toLocaleString('ru-RU')}`;
            document.getElementById('finance-payroll').textContent = `${currentCurrency}${data.payroll.toLocaleString('ru-RU')}`;
            document.getElementById('finance-losses').textContent = `${currentCurrency}${data.losses.toLocaleString('ru-RU')}`;

            // Деньги v2.5: ручные доходы/расходы за месяц
            const ms = moneySums(key);
            const otherInEl = document.getElementById('finance-other-in');
            if (otherInEl) otherInEl.textContent = `${currentCurrency}${ms.inn.toLocaleString('ru-RU')}`;
            const otherOutEl = document.getElementById('finance-other-out');
            if (otherOutEl) otherOutEl.textContent = `${currentCurrency}${ms.out.toLocaleString('ru-RU')}`;
            renderMoneyTxList(key);
            
            // v2.2: Labor cost % и Prime cost — ключевые метрики ресторана
            const laborPct = data.income > 0 ? (data.payroll / data.income) * 100 : 0;
            const primePct = data.income > 0 ? ((data.cogs + data.payroll) / data.income) * 100 : 0;
            document.getElementById('finance-labor-pct').textContent = data.income > 0 ? laborPct.toFixed(1) + '%' : '—';
            document.getElementById('finance-prime-cost').textContent = data.income > 0 ? primePct.toFixed(1) + '%' : '—';
            
            const profit = data.income + ms.inn - data.cogs - data.payroll - data.losses - ms.out;
            document.getElementById('finance-profit').textContent = `${currentCurrency}${profit.toLocaleString('ru-RU')}`;
            document.getElementById('finance-profit').className = `text-3xl font-bold ${profit >= 0 ? 'text-white' : 'text-red-400'}`;
            
            document.getElementById('finance-assets').textContent = `${currentCurrency}${totalAssets.toLocaleString('ru-RU')}`;
        }

        // --- ЖУРНАЛ ЗАРПЛАТЫ (v2.1): точный учёт выплат ---
        function payrollMonthKey() {
            const sel = document.getElementById('finance-month-selector');
            return (sel && sel.value) || getCurrentMonthKey();
        }

        // v2.2: Экспорт P&L в CSV для бухгалтера (все месяцы, UTF-8 BOM для Excel)
        function exportFinanceCSV() {
            const months = Object.keys(financeDB || {}).sort();
            if (!months.length) { showNotification(t('fin_export_empty')); return; }
            const rows = [['Month', 'Income', 'OtherIncome', 'COGS', 'Payroll', 'Losses', 'OtherExpenses', 'Profit', 'Labor %', 'Prime cost %', 'Food cost %']];
            months.forEach(m => {
                const d = financeDB[m];
                const ms = moneySums(m);
                const profit = (d.income || 0) + ms.inn - (d.cogs || 0) - (d.payroll || 0) - (d.losses || 0) - ms.out;
                const pct = (v) => d.income > 0 ? (v / d.income * 100).toFixed(1) : '';
                rows.push([m,
                    (d.income || 0).toFixed(2), ms.inn.toFixed(2), (d.cogs || 0).toFixed(2), (d.payroll || 0).toFixed(2), (d.losses || 0).toFixed(2), ms.out.toFixed(2),
                    profit.toFixed(2), pct(d.payroll || 0), pct((d.cogs || 0) + (d.payroll || 0)), pct(d.cogs || 0)]);
            });
            const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'chefos-pnl-' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showNotification(t('fin_export_done'));
        }
        function openPayrollModal() {
            if (!Array.isArray(payrollDB)) payrollDB = [];
            const sel = document.getElementById('payroll-emp');
            sel.innerHTML = (teamDB || []).map(e =>
                `<option value="${e.id}">${e.name} — ${currentCurrency}${e.rate || 0}/ч</option>`).join('');
            document.getElementById('payroll-date').value = new Date().toISOString().slice(0, 10);
            document.getElementById('payroll-hours').value = '';
            document.getElementById('payroll-rate').value = '';
            document.getElementById('payroll-amount').value = '';
            document.getElementById('payroll-note').value = '';
            payrollPrefill();
            renderPayrollList();
            openModal('payroll-modal');
        }

        // Подставить ставку и часы из графика при выборе сотрудника
        function payrollPrefill() {
            const id = document.getElementById('payroll-emp').value;
            const e = (teamDB || []).find(x => String(x.id) === String(id));
            if (!e) return;
            document.getElementById('payroll-rate').value = e.rate || 0;
            if (!document.getElementById('payroll-hours').value) {
                const wh = (typeof getEmployeeWeeklyStats === 'function') ? getEmployeeWeeklyStats(e.id) : 0;
                if (wh > 0) document.getElementById('payroll-hours').value = Math.round(wh * 2) / 2;
            }
            payrollRecalc();
        }

        function payrollRecalc() {
            const h = parseFloat(document.getElementById('payroll-hours').value) || 0;
            const r = parseFloat(document.getElementById('payroll-rate').value) || 0;
            const amtInp = document.getElementById('payroll-amount');
            // Сумму можно править вручную (премии, удержания) — пересчитываем, только если она пустая или совпадает с часы×ставка
            const auto = Math.round(h * r * 100) / 100;
            const cur = parseFloat(amtInp.value);
            if (!amtInp.value || Math.abs(cur - (payrollRecalc._lastAuto || 0)) < 0.005) amtInp.value = auto;
            payrollRecalc._lastAuto = auto;
        }

        function addPayrollEntry() {
            const empId = document.getElementById('payroll-emp').value;
            const e = (teamDB || []).find(x => String(x.id) === String(empId));
            const date = document.getElementById('payroll-date').value || new Date().toISOString().slice(0, 10);
            const hours = parseFloat(document.getElementById('payroll-hours').value) || 0;
            const rate = parseFloat(document.getElementById('payroll-rate').value) || 0;
            const amount = Math.round((parseFloat(document.getElementById('payroll-amount').value) || 0) * 100) / 100;
            const note = document.getElementById('payroll-note').value.trim();
            if (!e) { showNotification(t('payroll_no_emp')); return; }
            if (!(amount > 0)) { showNotification(t('payroll_no_amount')); return; }
            payrollDB.unshift({ id: Date.now(), date, employeeId: e.id, employeeName: e.name, hours, rate, amount, note });
            markDirty();
            document.getElementById('payroll-hours').value = '';
            document.getElementById('payroll-amount').value = '';
            document.getElementById('payroll-note').value = '';
            payrollRecalc._lastAuto = 0;
            renderPayrollList();
            renderFinanceTab();
            showNotification(t('payroll_added'));
        }

        function deletePayrollEntry(id) {
            payrollDB = payrollDB.filter(p => p.id !== id);
            markDirty();
            renderPayrollList();
            renderFinanceTab();
        }

        function renderPayrollList() {
            const key = payrollMonthKey();
            const list = document.getElementById('payroll-list');
            const rows = payrollDB.filter(p => (p.date || '').startsWith(key));
            const total = rows.reduce((s, p) => s + (Number(p.amount) || 0), 0);
            document.getElementById('payroll-month-label').textContent = key;
            document.getElementById('payroll-total').textContent = `${currentCurrency}${total.toLocaleString('ru-RU')}`;
            list.innerHTML = rows.length ? rows.map(p => `
                <div class="flex items-center gap-3 bg-black/40 border border-white/5 rounded-xl px-4 py-3">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-white truncate">${p.employeeName}</p>
                        <p class="text-xs text-gray-500">${p.date}${p.hours ? ` · ${p.hours} ч × ${currentCurrency}${p.rate}` : ''}${p.note ? ` · ${p.note}` : ''}</p>
                    </div>
                    <span class="text-sm font-bold text-blue-400 whitespace-nowrap">${currentCurrency}${Number(p.amount).toLocaleString('ru-RU')}</span>
                    <button onclick="deletePayrollEntry(${p.id})" class="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors shrink-0"><i class="fa-solid fa-trash-can text-xs"></i></button>
                </div>`).join('')
                : `<p class="text-center text-gray-500 text-sm py-8">${t('payroll_empty')}</p>`;
        }


        // --- ДЕНЬГИ v2.5: ручные доходы/расходы ---
        const MONEY_CATS = {
            out: ['mcat_rent', 'mcat_util', 'mcat_transport', 'mcat_equip', 'mcat_marketing', 'mcat_tax', 'mcat_other'],
            in: ['mcat_other']
        };
        function moneyTxMonth(key) {
            if (!Array.isArray(moneyTxDB)) moneyTxDB = [];
            return moneyTxDB.filter(x => (x.date || '').startsWith(key));
        }
        function moneySums(key) {
            let inn = 0, out = 0;
            moneyTxMonth(key).forEach(x => {
                const a = Math.round((Number(x.amount) || 0) * 100) / 100;
                if (x.type === 'in') inn += a; else out += a;
            });
            return { inn: Math.round(inn * 100) / 100, out: Math.round(out * 100) / 100 };
        }
        let moneyTxType = 'out';
        function openMoneyTxModal(type) {
            moneyTxType = type === 'in' ? 'in' : 'out';
            document.getElementById('money-tx-amount').value = '';
            document.getElementById('money-tx-note').value = '';
            document.getElementById('money-tx-date').value = new Date().toISOString().slice(0, 10);
            document.getElementById('money-tx-cat').innerHTML =
                MONEY_CATS[moneyTxType].map(c => `<option value="${c}">${escapeHtml(t(c))}</option>`).join('');
            document.getElementById('money-tx-title').textContent = t(moneyTxType === 'in' ? 'money_add_in' : 'money_add_out');
            document.getElementById('money-tx-save').textContent = t('save');
            openModal('money-tx-modal');
        }
        function saveMoneyTx() {
            const amount = parseFloat(document.getElementById('money-tx-amount').value);
            if (!(amount > 0)) { showNotification(t('money_bad_amount')); return; }
            if (!Array.isArray(moneyTxDB)) moneyTxDB = [];
            moneyTxDB.push({
                id: Date.now(),
                date: document.getElementById('money-tx-date').value || new Date().toISOString().slice(0, 10),
                type: moneyTxType,
                amount: Math.round(amount * 100) / 100,
                cat: document.getElementById('money-tx-cat').value,
                note: document.getElementById('money-tx-note').value.trim().slice(0, 120)
            });
            markDirty();
            closeModal('money-tx-modal');
            renderFinanceTab();
            showNotification(t('money_saved'));
        }
        function deleteMoneyTx(id) {
            showConfirm(t('confirm_title'), t('money_delete'), () => {
                moneyTxDB = moneyTxDB.filter(x => x.id !== id);
                markDirty();
                renderFinanceTab();
            });
        }
        function renderMoneyTxList(key) {
            key = key || ((document.getElementById('finance-month-selector') || {}).value) || getCurrentMonthKey();
            const list = document.getElementById('money-tx-list');
            if (!list) return;
            const items = moneyTxMonth(key).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const emptyEl = document.getElementById('money-tx-empty');
            if (emptyEl) emptyEl.style.display = items.length ? 'none' : '';
            list.innerHTML = items.map(x => `
                <div class="flex items-center gap-3 bg-[#1C1C1E] border border-white/5 rounded-xl px-4 py-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${x.type === 'in' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}">
                        <i class="fa-solid ${x.type === 'in' ? 'fa-arrow-down' : 'fa-arrow-up'} text-xs"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-white truncate">${escapeHtml(t(x.cat) || '')}${x.note ? ` <span class="text-gray-500 font-normal">· ${escapeHtml(x.note)}</span>` : ''}</p>
                        <p class="text-xs text-gray-500">${escapeHtml(x.date || '')}</p>
                    </div>
                    <p class="text-sm font-bold shrink-0 whitespace-nowrap ${x.type === 'in' ? 'text-green-400' : 'text-red-400'}">${x.type === 'in' ? '+' : '−'}${currentCurrency}${Number(x.amount).toLocaleString('ru-RU')}</p>
                    <button onclick="deleteMoneyTx(${x.id})" class="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"><i class="fa-solid fa-trash-can text-xs"></i></button>
                </div>`).join('');
        }
        // Плитка «Деньги»: отдельная модалка финансов (Отчёты + Списания)
        function openMoneyModal() {
            const sub = document.getElementById('finance-kitchen-subtitle');
            if (sub) sub.textContent = t(activeKitchen);
            openModal('finance-modal');
            renderFinanceTab();
            if (typeof renderWasteTab === 'function') renderWasteTab();
            if (typeof sqRenderAuth === 'function') { try { sqRenderAuth(); } catch (e) {} }
        }
