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
            
            const profit = data.income - data.cogs - data.payroll - data.losses;
            document.getElementById('finance-profit').textContent = `${currentCurrency}${profit.toLocaleString('ru-RU')}`;
            document.getElementById('finance-profit').className = `text-3xl font-bold ${profit >= 0 ? 'text-white' : 'text-red-400'}`;
            
            document.getElementById('finance-assets').textContent = `${currentCurrency}${totalAssets.toLocaleString('ru-RU')}`;
        }

        // --- ЖУРНАЛ ЗАРПЛАТЫ (v2.1): точный учёт выплат ---
        function payrollMonthKey() {
            const sel = document.getElementById('finance-month-selector');
            return (sel && sel.value) || getCurrentMonthKey();
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

