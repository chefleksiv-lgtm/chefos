        // --- АНАЛИТИКА МЕНЮ (v1.7): ABC-анализ + факт vs теория ---
        // Источник: salesDB[month][dishId] = qty (пишет processSales при оплате)

        // Статистика продаж по блюдам за месяц
        function dishSalesStats(monthKey) {
            const sales = (salesDB && salesDB[monthKey]) || {};
            return menuDB.filter(d => d.type === 'dish').map(d => {
                const qty = sales[d.id] || 0;
                const cost = costPerPortion(d).perPortion;
                const price = Number(d.menuPrice) || 0;
                const marginUnit = price - cost;
                return {
                    dish: d, qty, cost, price,
                    revenue: price * qty,
                    margin: marginUnit * qty,          // суммарная маржа
                    marginUnit,
                    marginPct: price > 0 ? (marginUnit / price) * 100 : 0
                };
            }).filter(s => s.qty > 0);
        }

        function _median(arr) {
            if (!arr.length) return 0;
            const s = [...arr].sort((a, b) => a - b);
            const m = Math.floor(s.length / 2);
            return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
        }

        // ABC-классификация Кассаваны и Смита по медианам: популярность × маржа на порцию
        function abcClassify(items) {
            const popMed = _median(items.map(i => i.qty));
            const marMed = _median(items.map(i => i.marginUnit));
            return items.map(i => {
                const pop = i.qty >= popMed, mar = i.marginUnit >= marMed;
                const cat = (pop && mar) ? 'star' : (pop && !mar) ? 'plowhorse' : (!pop && mar) ? 'puzzle' : 'dog';
                return { ...i, cat };
            });
        }

        // Фактический фудкост = теоретический (продажи × себестоимость) + списания/недостачи
        function factVsTheory(monthKey) {
            const stats = dishSalesStats(monthKey);
            const theoryCogs = stats.reduce((s, x) => s + x.cost * x.qty, 0);
            const income = stats.reduce((s, x) => s + x.revenue, 0);
            const losses = ((financeDB[monthKey] || {}).losses) || 0;
            const actualCogs = theoryCogs + losses;
            return {
                theoryCogs, actualCogs, losses, income,
                theoryFc: income > 0 ? theoryCogs / income * 100 : 0,
                actualFc: income > 0 ? actualCogs / income * 100 : 0
            };
        }

        // --- UI ---
        let analyticsMonth = null;

        function openAnalyticsModal() {
            analyticsMonth = getCurrentMonthKey();
            document.getElementById('analytics-month').value = analyticsMonth;
            renderAnalytics();
            openModal('analytics-modal');
        }

        const ABC_META = {
            star:      { icon: 'fa-star',        cls: 'text-yellow-400',   bg: 'border-yellow-500/40' },
            plowhorse: { icon: 'fa-horse',       cls: 'text-blue-400',     bg: 'border-blue-500/40' },
            puzzle:    { icon: 'fa-puzzle-piece',cls: 'text-purple-400',   bg: 'border-purple-500/40' },
            dog:       { icon: 'fa-dog',         cls: 'text-gray-500',     bg: 'border-gray-600/40' }
        };

        function renderAnalytics() {
            const mk = analyticsMonth || getCurrentMonthKey();
            const stats = abcClassify(dishSalesStats(mk));
            const groups = { star: [], plowhorse: [], puzzle: [], dog: [] };
            stats.forEach(s => groups[s.cat].push(s));
            ['star', 'plowhorse', 'puzzle', 'dog'].forEach(c => groups[c].sort((a, b) => b.qty - a.qty));

            const qHtml = (cat) => {
                const m = ABC_META[cat];
                const items = groups[cat];
                const body = items.length
                    ? items.map(s => `
                        <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-white truncate">${s.dish.name}</p>
                                <p class="text-xs text-gray-500">${s.qty} ${t('an_sold')} · ${t('an_margin')} ${fmtMoney(s.marginUnit, 2)}</p>
                            </div>
                            <span class="text-xs font-semibold ${s.marginPct >= 0 ? 'text-green-400' : 'text-red-400'}">${s.marginPct.toFixed(0)}%</span>
                        </div>`).join('')
                    : `<p class="text-xs text-gray-600 py-3 text-center">—</p>`;
                return `
                    <div class="bg-black/40 border ${m.bg} rounded-2xl p-4">
                        <div class="flex items-center gap-2 mb-1">
                            <i class="fa-solid ${m.icon} ${m.cls}"></i>
                            <h4 class="font-bold text-sm text-white">${t('abc_' + cat)}</h4>
                            <span class="ml-auto text-xs text-gray-500 font-semibold">${items.length}</span>
                        </div>
                        <p class="text-[11px] text-gray-500 mb-2">${t('abc_' + cat + '_tip')}</p>
                        <div>${body}</div>
                    </div>`;
            };
            document.getElementById('analytics-abc').innerHTML = stats.length
                ? ['star', 'plowhorse', 'puzzle', 'dog'].map(qHtml).join('')
                : `<div class="col-span-2 text-center py-10 text-gray-500 text-sm">${t('an_no_data')}</div>`;

            const f = factVsTheory(mk);
            const deltaFc = f.actualFc - f.theoryFc;
            document.getElementById('analytics-fvt').innerHTML = `
                <div class="bg-black/40 border border-white/10 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    ${[
                        [t('an_theory_cogs'), fmtMoney(f.theoryCogs, 2), 'text-white'],
                        [t('an_theory_fc'), f.theoryFc.toFixed(1) + '%', 'text-white'],
                        [t('an_losses'), fmtMoney(f.losses, 2), f.losses > 0 ? 'text-red-400' : 'text-white'],
                        [t('an_actual_fc'), f.actualFc.toFixed(1) + '%', deltaFc > 1 ? 'text-red-400' : deltaFc > 0 ? 'text-yellow-400' : 'text-green-400'],
                    ].map(([l, v, c]) => `
                        <div><p class="text-[11px] text-gray-500 mb-1">${l}</p><p class="text-xl font-bold ${c}">${v}</p></div>`).join('')}
                </div>
                ${f.losses > 0 ? `<p class="text-xs text-gray-500 mt-3"><i class="fa-solid fa-circle-info mr-1"></i>${t('an_fvt_tip')}</p>` : ''}`;
        }
