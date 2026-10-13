        // --- ФИНАНСЫ (Отчеты) ---
        function renderFinanceTab() {
            const dateSel = document.getElementById('finance-month-selector');
            if(!dateSel.value) dateSel.value = getCurrentMonthKey();
            const key = dateSel.value;
            
            const data = financeDB[key] || { income: 0, cogs: 0, payroll: 0, losses: 0 };
            
            if (key === getCurrentMonthKey()) {
                let totalWeeklyPayroll = 0;
                teamDB.forEach(e => {
                    totalWeeklyPayroll += getEmployeeWeeklyStats(e.id) * e.rate;
                });
                data.payroll = totalWeeklyPayroll * 4; 
            }

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

