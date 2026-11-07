        // --- ПЛИТКИ: порядок перетаскиванием, секции 2.1.20 ---
        // tileOrder объявлен в data.js, сохраняется через storage.js (markDirty).
        // На тачскрине — долгое нажатие (250мс) затем тянуть, на десктопе — тянуть сразу.
        // 2.1.20: три секции (Кухня / Деньги и учёт / Управление), плитку можно
        // перетащить и между секциями (общая группа Sortable 'tiles').
        const TILE_SECTIONS = ['kitchen', 'money', 'manage'];
        const TILE_SECTION_DEFAULTS = {
            'tile-menu': 'kitchen', 'tile-ttk': 'kitchen', 'tile-fc': 'kitchen',
            'tile-kds': 'kitchen', 'tile-foodsafety': 'kitchen',
            'tile-sales': 'money', 'tile-money': 'money', 'tile-inv': 'money',
            'tile-stocktake': 'money', 'tile-analytics': 'money',
            'tile-books': 'manage', 'tile-team': 'manage', 'tile-settings': 'manage'
        };

        function sectionGrid(sec) { return document.getElementById('tiles-grid-' + sec); }

        function applyTileOrder() {
            if (!sectionGrid('kitchen')) return;
            if (!Array.isArray(tileOrder)) return;
            if (typeof tileGroups !== 'object' || !tileGroups) tileGroups = { ...TILE_SECTION_DEFAULTS };
            const byId = {};
            TILE_SECTIONS.forEach(s => { const g = sectionGrid(s); if (g) [...g.children].forEach(el => { if (el.id) byId[el.id] = el; }); });
            tileOrder.forEach(id => {
                const el = byId[id]; if (!el) return;
                const sec = tileGroups[id] || TILE_SECTION_DEFAULTS[id] || 'manage';
                const g = sectionGrid(sec); if (g) g.appendChild(el);
            });
            // Плитки, которых нет в сохранённом порядке (новые версии) — в конец своей секции
            Object.keys(byId).forEach(id => {
                if (tileOrder.includes(id)) return;
                const sec = TILE_SECTION_DEFAULTS[id] || 'manage';
                const g = sectionGrid(sec); if (g) g.appendChild(byId[id]);
            });
        }

        function saveTileOrder() {
            if (typeof tileGroups !== 'object' || !tileGroups) tileGroups = {};
            tileOrder = [];
            TILE_SECTIONS.forEach(s => {
                const g = sectionGrid(s); if (!g) return;
                [...g.children].forEach(el => { if (!el.id) return; tileOrder.push(el.id); tileGroups[el.id] = s; });
            });
            markDirty();
        }

        function initTileSorting() {
            if (typeof Sortable === 'undefined') return;
            TILE_SECTIONS.forEach(s => {
                const grid = sectionGrid(s);
                if (!grid || grid._sortable) return;
                grid._sortable = new Sortable(grid, {
                    animation: 280,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    handle: '.tile-drag-handle', // тянуть только за ручку — тапы и скролл по плитке не перехватываются
                    delay: 250,             // долгое нажатие перед перетаскиванием...
                    delayOnTouchOnly: true, // ...только на тачскрине; мышью тянем сразу
                    forceFallback: true,    // свой плавный движок вместо нативного DnD
                    fallbackOnBody: true,
                    fallbackTolerance: 4,
                    group: 'tiles',         // 2.1.20: перетаскивание и между секциями
                    ghostClass: 'tile-drop-hint',   // пустой слот в сетке
                    chosenClass: 'tile-chosen',
                    dragClass: 'tile-drag-float',   // летящая плитка под пальцем
                    onEnd: saveTileOrder,
                });
            });
        }

        // 2.1.20: мини-цифры на плитках — ТТК (рецепты), Склад (позиции), Деньги (прибыль месяца)
        function ruPlural(n, one, few, many) {
            const m10 = Math.abs(n) % 10, m100 = Math.abs(n) % 100;
            if (m10 === 1 && m100 !== 11) return one;
            if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
            return many;
        }
        function updateTileCounts() {
            const ttkEl = document.getElementById('tile-ttk-count');
            if (ttkEl && Array.isArray(menuDB)) {
                const n = menuDB.length;
                ttkEl.textContent = n + ' ' + ruPlural(n, 'рецепт', 'рецепта', 'рецептов');
            }
            const invEl = document.getElementById('tile-inv-count');
            if (invEl && Array.isArray(inventoryDB)) {
                const n = inventoryDB.length;
                invEl.textContent = n + ' ' + ruPlural(n, 'позиция', 'позиции', 'позиций');
            }
            const moneyEl = document.getElementById('tile-money-count');
            if (moneyEl) {
                try {
                    const key = getCurrentMonthKey();
                    const data = (typeof financeDB !== 'undefined' && financeDB[key]) || { income: 0, cogs: 0, payroll: 0, losses: 0 };
                    const ms = (typeof moneySums === 'function') ? moneySums(key) : { inn: 0, out: 0 };
                    const monthPayroll = Array.isArray(payrollDB)
                        ? payrollDB.filter(p => (p.date || '').startsWith(key)).reduce((s, p) => s + (Number(p.amount) || 0), 0)
                        : 0;
                    const profit = (Number(data.income) || 0) + (ms.inn || 0) - (Number(data.cogs) || 0) - monthPayroll - (Number(data.losses) || 0) - (ms.out || 0);
                    const hasData = (Number(data.income) || 0) || (Number(data.cogs) || 0) || monthPayroll || (Number(data.losses) || 0) || (ms.inn || 0) || (ms.out || 0);
                    if (!hasData) { moneyEl.textContent = '—'; moneyEl.className = 'text-[10px] text-gray-500 leading-none'; }
                    else {
                        moneyEl.textContent = (profit >= 0 ? '+' : '−') + currentCurrency + Math.abs(Math.round(profit)).toLocaleString('ru-RU');
                        moneyEl.className = 'text-[10px] leading-none ' + (profit >= 0 ? 'text-green-400' : 'text-red-400');
                    }
                } catch (e) { moneyEl.textContent = '—'; }
            }
        }
