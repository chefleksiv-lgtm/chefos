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

        // Фактический фудкост: берём доход и себестоимость из financeDB (те же цифры,
        // что видит шеф на вкладке «Финансы», зафиксированные в момент продажи).
        // Пересчёт по текущим ценам здесь был бы неверным: после смены цены блюда
        // выручка аналитики расходилась бы с доходом в финансах.
        function factVsTheory(monthKey) {
            const fin = (financeDB && financeDB[monthKey]) || {};
            const income = fin.income || 0;
            const theoryCogs = fin.cogs || 0;
            const losses = fin.losses || 0;
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

        // 2.1.23: выручка по дням за 7 дней (из чеков) + сравнение с прошлой неделей
        function weekDayTotals(offsetWeeks) {
            const out = [];
            const now = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i - offsetWeeks * 7);
                const key = (typeof localDateKey === 'function') ? localDateKey(d) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                let total = 0;
                Object.keys(receiptsDB || {}).forEach(m => (receiptsDB[m] || []).forEach(r => {
                    if (!r || !r.ts) return;
                    const rDay = (typeof localDateKey === 'function') ? localDateKey(new Date(r.ts)) : String(r.ts).slice(0, 10);
                    if (rDay === key) total += (Number(r.total) || 0) - (Number(r.returned) || 0);
                }));
                out.push({ date: d, total: Math.round(total * 100) / 100 });
            }
            return out;
        }
        function renderWeekly() {
            const box = document.getElementById('analytics-weekly'); if (!box) return;
            const cur = weekDayTotals(0), prev = weekDayTotals(1);
            const sum = a => a.reduce((s, x) => s + x.total, 0);
            const curSum = sum(cur), prevSum = sum(prev);
            const max = Math.max(1, ...cur.map(x => x.total));
            const dayName = d => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
            const bars = cur.map(x => {
                const h = Math.max(4, Math.round((x.total / max) * 72));
                const isToday = x.date.toDateString() === new Date().toDateString();
                return `<div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span class="text-[10px] ${x.total > 0 ? 'text-gray-300' : 'text-gray-600'} whitespace-nowrap">${x.total > 0 ? fmtMoney(x.total, 0) : ''}</span>
                    <div class="w-full max-w-[28px] rounded-t-md ${x.total > 0 ? (isToday ? 'bg-cyan-400' : 'bg-cyan-500/70') : 'bg-white/5'}" style="height:${h}px"></div>
                    <span class="text-[10px] ${isToday ? 'text-cyan-400 font-bold' : 'text-gray-500'}">${dayName(x.date)}</span>
                </div>`;
            }).join('');
            let cmp = '';
            if (prevSum > 0) {
                const pct = Math.round(((curSum - prevSum) / prevSum) * 100);
                cmp = `<p class="text-xs mt-3 ${pct >= 0 ? 'text-green-400' : 'text-red-400'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% ${t('an_vs_prev_week')} (${fmtMoney(prevSum, 0)})</p>`;
            } else if (curSum > 0) {
                cmp = `<p class="text-xs mt-3 text-gray-500">${t('an_first_week')}</p>`;
            }
            box.innerHTML = `<div class="bg-black/40 border border-white/10 rounded-2xl p-4">
                <div class="flex items-end gap-1 h-[104px]">${bars}</div>
                <div class="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                    <span class="text-xs text-gray-500">${t('an_week_total')}</span>
                    <span class="text-lg font-bold text-white">${fmtMoney(curSum, 0)}</span>
                </div>${cmp}</div>`;
        }
        // 2.1.23: цель выручки месяца с прогрессом
        function renderTarget() {
            const box = document.getElementById('analytics-target'); if (!box) return;
            const mk = analyticsMonth || getCurrentMonthKey();
            const fin = (financeDB && financeDB[mk]) || {};
            const ms = (typeof moneySums === 'function') ? moneySums(mk) : { inn: 0, out: 0 };
            const income = (Number(fin.income) || 0) + (ms.inn || 0);
            const target = Number(salesTarget) || 0;
            const pct = target > 0 ? Math.min(100, Math.round((income / target) * 100)) : 0;
            box.innerHTML = `<div class="bg-black/40 border border-white/10 rounded-2xl p-4">
                <div class="flex flex-wrap items-center gap-3">
                    <label class="text-xs text-gray-500">${t('an_target_lbl')}</label>
                    <input type="number" min="0" step="100" value="${target || ''}" placeholder="0" onchange="setSalesTarget(this.value)" class="w-28 h-9 bg-[#2C2C2E] text-white rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500">
                    <span class="text-xs text-gray-500">${currentCurrency}</span>
                    <span class="ml-auto text-sm font-bold text-white">${fmtMoney(income, 0)} / ${target > 0 ? fmtMoney(target, 0) : '—'}</span>
                </div>
                <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden mt-3"><div class="h-full rounded-full ${pct >= 100 ? 'bg-green-400' : 'bg-cyan-400'}" style="width:${pct}%"></div></div>
                <p class="text-xs text-gray-500 mt-2">${target > 0 ? pct + '% · ' + (income >= target ? t('an_target_done') : t('an_target_left') + ' ' + fmtMoney(target - income, 0)) : t('an_target_hint')}</p>
            </div>`;
        }
        function setSalesTarget(v) { salesTarget = Math.max(0, parseFloat(v) || 0); markDirty(); renderAnalytics(); }
        function renderAnalytics() {
            const mk = analyticsMonth || getCurrentMonthKey();
            renderWeekly(); renderTarget();
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
            if (typeof renderForecast === 'function') renderForecast();
        }

        // --- ПРОГНОЗ СПРОСА (v2.2): средние продажи × горизонт → что докупить ---
        // v2.4: сезонный индекс — корректирует прогноз по истории продаж
        function seasonalFactor(dishId, monthKey) {
            if (typeof salesDB === 'undefined' || !salesDB) return 1;
            const clamp = (v) => Math.max(0.5, Math.min(2, v));
            const parts = String(monthKey).split('-');
            const y = parseInt(parts[0]), m = parseInt(parts[1]);
            const key = (yy, mm) => yy + '-' + String(mm).padStart(2, '0');
            // 1) Тот же месяц год назад vs средний месяц того года
            const ly = {};
            for (let mm = 1; mm <= 12; mm++) ly[mm] = ((salesDB[key(y - 1, mm)] || {})[dishId]) || 0;
            const lyMonths = Object.values(ly).filter(q => q > 0);
            if (ly[m] > 0 && lyMonths.length >= 3) {
                return clamp(ly[m] / (lyMonths.reduce((a, b) => a + b, 0) / lyMonths.length));
            }
            // 2) Fallback: последний месяц с данными vs среднее за 3 последних месяца с данными
            const recent = [];
            for (let i = 1; i <= 12 && recent.length < 3; i++) {
                let yy = y, mm = m - i;
                while (mm < 1) { mm += 12; yy--; }
                const q = ((salesDB[key(yy, mm)] || {})[dishId]) || 0;
                if (q > 0) recent.push(q);
            }
            if (recent.length >= 2) {
                return clamp(recent[0] / (recent.reduce((a, b) => a + b, 0) / recent.length));
            }
            return 1;
        }
        let forecastHorizon = 7;
        function setForecastHorizon(d) { forecastHorizon = d; renderForecast(); }
        function forecastDishNeeds(dish, portions) {
            const needs = {};
            const add = (name, weightStr) => {
                const r = (typeof parseIngredientAmount === 'function') ? parseIngredientAmount(name, weightStr) : null;
                if (!r) return;
                if (!needs[r.item.id]) needs[r.item.id] = { item: r.item, amount: 0 };
                needs[r.item.id].amount += r.amount * portions;
            };
            (dish.ingredients || []).forEach(ing => add(ing.name, ing.weight));
            (dish.subRecipes || []).forEach(sub => {
                (sub.ingredients || []).forEach(si => {
                    const p = (typeof parseSubIngredient === 'function') ? parseSubIngredient(si) : null;
                    if (p && p.name && p.qty > 0) add(p.name, String(p.qty) + (p.unit || ''));
                });
            });
            return Object.values(needs);
        }
        function forecastData() {
            const mk = analyticsMonth || getCurrentMonthKey();
            const sales = (salesDB[mk] || {});
            const parts = String(mk).split('-'); const y = parseInt(parts[0]), m = parseInt(parts[1]);
            const now = new Date();
            const daysElapsed = (y === now.getFullYear() && m === now.getMonth() + 1) ? now.getDate() : new Date(y, m, 0).getDate();
            const dishes = [];
            Object.keys(sales).forEach(id => {
                const d = (menuDB || []).find(x => String(x.id) === String(id));
                if (!d) return;
                const qty = sales[id] || 0;
                const avg = daysElapsed > 0 ? qty / daysElapsed : 0;
                const sf = seasonalFactor(id, mk);
                const fqty = Math.ceil(avg * forecastHorizon * sf);
                if (fqty > 0) dishes.push({ dish: d, sold: qty, avg, fqty, sf });
            });
            dishes.sort((a, b) => b.fqty - a.fqty);
            const needs = {};
            dishes.forEach(({ dish, fqty }) => {
                forecastDishNeeds(dish, fqty).forEach(n => {
                    if (!needs[n.item.id]) needs[n.item.id] = { item: n.item, amount: 0 };
                    needs[n.item.id].amount += n.amount;
                });
            });
            const shopping = Object.values(needs)
                .map(n => ({ item: n.item, amount: n.amount, stock: n.item.quantity || 0, deficit: Math.max(0, n.amount - (n.item.quantity || 0)) }))
                .filter(n => n.deficit > 0.0005)
                .sort((a, b) => (b.deficit * (b.item.price || 0)) - (a.deficit * (a.item.price || 0)));
            return { dishes, shopping };
        }
        function renderForecast() {
            const box = document.getElementById('analytics-forecast');
            if (!box) return;
            document.querySelectorAll('[data-fh]').forEach(b => {
                const on = parseInt(b.dataset.fh) === forecastHorizon;
                b.className = 'h-9 px-4 rounded-xl text-sm font-medium transition-colors ' + (on ? 'bg-teal-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10');
            });
            const { dishes, shopping } = forecastData();
            if (!dishes.length) { box.innerHTML = '<p class="text-sm text-gray-500">' + t('fc_empty') + '</p>'; return; }
            const fmt = (v) => (typeof trimNum === 'function') ? trimNum(Math.round(v * 100) / 100) : (Math.round(v * 100) / 100);
            box.innerHTML =
                '<p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">' + t('fc_dishes_title') + '</p>' +
                '<div class="space-y-1 mb-6">' + dishes.slice(0, 12).map(x =>
                    '<div class="flex justify-between items-center bg-black/30 rounded-xl px-3 py-2 text-sm">' +
                    '<span class="text-gray-200 truncate mr-2">' + x.dish.name + '</span>' +
                    '<span class="text-xs text-gray-500 whitespace-nowrap">' + t('fc_sold') + ' ' + x.sold + ' · ~' + x.avg.toFixed(1) + '/' + t('fc_day') + (x.sf && Math.abs(x.sf - 1) > 0.05 ? ' <span class="text-sky-400" title="' + t('fc_seasonal') + '">×' + x.sf.toFixed(1) + '</span>' : '') + ' → <span class="text-teal-400 font-bold">' + x.fqty + '</span></span></div>'
                ).join('') + '</div>' +
                '<p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">' + t('fc_shop_title') + '</p>' +
                (shopping.length ? '<div class="space-y-1">' + shopping.map(n =>
                    '<div class="flex justify-between items-center bg-black/30 rounded-xl px-3 py-2 text-sm">' +
                    '<span class="text-gray-200 truncate mr-2">' + n.item.name + '</span>' +
                    '<span class="text-xs whitespace-nowrap"><span class="text-gray-500">' + t('fc_need') + ' ' + fmt(n.amount) + ' ' + (t('unit_' + n.item.unit) || n.item.unit) + '</span> <span class="text-orange-400 font-bold">+ ' + fmt(n.deficit) + '</span></span></div>'
                ).join('') + '</div>'
                : '<p class="text-sm text-gray-500">' + t('fc_shop_ok') + '</p>');
        }
