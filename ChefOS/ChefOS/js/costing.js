        // --- АВТОКОСТИНГ / МАСШТАБИРОВАНИЕ / АЛЛЕРГЕНЫ (v1.6) ---
        // Чистые функции расчёта. Используют inventoryDB / menuDB на момент вызова.

        const ALLERGENS = ['milk', 'eggs', 'fish', 'shellfish', 'nuts', 'peanuts', 'wheat', 'soy', 'sesame', 'gluten', 'mustard', 'sulphites'];
        const PRICE_RISE_ALERT_PCT = 5;

        // Группы совместимых единиц и коэффициенты к базовой (кг / л / шт)
        const UNIT_GROUPS = { g: 'mass', kg: 'mass', ml: 'vol', l: 'vol', pcs: 'pcs' };
        const UNIT_TO_BASE = { g: 0.001, kg: 1, ml: 0.001, l: 1, pcs: 1 };

        function normUnit(u) {
            u = String(u || '').trim().toLowerCase();
            const map = { 'г': 'g', 'гр': 'g', 'грамм': 'g', 'кг': 'kg', 'мл': 'ml', 'л': 'l', 'литр': 'l', 'шт': 'pcs', 'pc': 'pcs', 'piece': 'pcs', 'pieces': 'pcs' };
            return map[u] || u;
        }

        // '100g' / '1.5 кг' / '2 шт' -> {qty, unit} ; null если не распарсилось
        function parseQtyUnit(str) {
            const m = String(str || '').trim().match(/^([\d.,]+)\s*([a-zA-Zа-яА-Я]*)$/);
            if (!m) return null;
            const qty = parseFloat(m[1].replace(',', '.'));
            if (!(qty >= 0)) return null;
            return { qty, unit: normUnit(m[2] || 'g') };
        }

        // Перевод количества из from в to. null — несовместимые единицы.
        function convertQty(qty, from, to) {
            from = normUnit(from); to = normUnit(to);
            if (from === to) return qty;
            if (UNIT_GROUPS[from] && UNIT_GROUPS[from] === UNIT_GROUPS[to]) {
                return qty * UNIT_TO_BASE[from] / UNIT_TO_BASE[to];
            }
            return null;
        }

        function findInventoryByName(name) {
            const n = String(name || '').trim().toLowerCase();
            return inventoryDB.find(i => String(i.name || '').trim().toLowerCase() === n) || null;
        }

        // Стоимость одной строки рецепта. {cost, found}
        function costOfLine(name, qty, unit) {
            const inv = findInventoryByName(name);
            if (!inv) return { cost: 0, found: false };
            const q = convertQty(qty, unit, inv.unit);
            if (q === null) return { cost: 0, found: false };
            const yieldPct = (inv.yieldPct > 0 ? inv.yieldPct : 100) / 100;
            return { cost: q * inv.price / yieldPct, found: true };
        }

        // 'Майонез 40g' -> {name, qty, unit}
        function parseSubIngredient(str) {
            const m = String(str || '').trim().match(/^(.*?)\s+([\d.,]+)\s*([a-zA-Zа-яА-Я]*)$/);
            if (!m) return { name: String(str || '').trim(), qty: 0, unit: 'g' };
            return { name: m[1].trim(), qty: parseFloat(m[2].replace(',', '.')) || 0, unit: normUnit(m[3] || 'g') };
        }

        // Полная себестоимость блюда.
        // Для type 'dish': ingredients — на 1 порцию, subRecipes — расход на порцию.
        // Для type 'prep': ingredients — весь батч (делить на portions).
        function costOfDish(d) {
            let total = 0;
            const missing = [];
            const lines = [];
            (d.ingredients || []).forEach(ing => {
                const p = parseQtyUnit(ing.weight);
                if (!p) return;
                const r = costOfLine(ing.name, p.qty, p.unit);
                total += r.cost;
                lines.push({ name: ing.name, qty: p.qty, unit: p.unit, cost: r.cost, found: r.found, noScale: !!ing.noScale });
                if (!r.found && !missing.includes(ing.name)) missing.push(ing.name);
            });
            (d.subRecipes || []).forEach(sub => {
                let subCost = 0;
                const subLines = [];
                (sub.ingredients || []).forEach(s => {
                    const p = parseSubIngredient(s);
                    const r = costOfLine(p.name, p.qty, p.unit);
                    subCost += r.cost;
                    subLines.push({ name: p.name, qty: p.qty, unit: p.unit, cost: r.cost, found: r.found });
                    if (!r.found && !missing.includes(p.name)) missing.push(p.name);
                });
                total += subCost;
                lines.push({ name: sub.name, qty: null, unit: null, cost: subCost, found: subCost > 0, isSub: true, subLines });
            });
            return { total, lines, missing };
        }

        // Себестоимость одной порции (для prep делит батч на portions)
        function costPerPortion(d) {
            const c = costOfDish(d);
            const portions = (d.type === 'prep' && d.portions > 0) ? d.portions : 1;
            return { total: c.total, perPortion: c.total / portions, lines: c.lines, missing: c.missing };
        }

        function trimNum(n) {
            return String(Math.round(n * 100) / 100);
        }

        // Красивый вывод: 1500 g -> '1.5 кг', 0.5 kg -> '500 г'
        function formatQty(qty, unit) {
            unit = normUnit(unit);
            const label = t('unit_' + unit) !== ('unit_' + unit) ? t('unit_' + unit) : unit;
            if (UNIT_GROUPS[unit] === 'mass') {
                if (unit === 'g' && qty >= 1000) return `${trimNum(qty / 1000)} ${t('unit_kg')}`;
                if (unit === 'kg' && qty > 0 && qty < 1) return `${trimNum(qty * 1000)} ${t('unit_g')}`;
            }
            if (UNIT_GROUPS[unit] === 'vol') {
                if (unit === 'ml' && qty >= 1000) return `${trimNum(qty / 1000)} ${t('unit_l')}`;
                if (unit === 'l' && qty > 0 && qty < 1) return `${trimNum(qty * 1000)} ${t('unit_ml')}`;
            }
            return `${trimNum(qty)} ${label}`;
        }

        // Аллергены блюда = объединение аллергенов ингредиентов и суб-рецептов
        function allergensOfDish(d) {
            const set = new Set();
            const add = name => {
                const inv = findInventoryByName(name);
                if (inv && Array.isArray(inv.allergens)) inv.allergens.forEach(a => set.add(a));
            };
            (d.ingredients || []).forEach(ing => add(ing.name));
            (d.subRecipes || []).forEach(sub => (sub.ingredients || []).forEach(s => add(parseSubIngredient(s).name)));
            return [...set];
        }

        function allergenBadgesHTML(d, small) {
            const a = allergensOfDish(d);
            if (!a.length) return '';
            const cls = small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';
            return `<div class="flex flex-wrap gap-1 mt-1">` + a.map(k =>
                `<span class="${cls} font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/40" title="${t('alg_' + k)}">${t('alg_short_' + k)}</span>`
            ).join('') + `</div>`;
        }

        // Food cost % по авторасчёту (fallback — ручной costPrice)
        function dishFoodCostPct(d) {
            const auto = costPerPortion(d).perPortion;
            const cost = auto > 0 ? auto : (d.costPrice || 0);
            return d.menuPrice > 0 ? (cost / d.menuPrice) * 100 : 0;
        }

        // Блюда, использующие ингредиент (для алерта о росте цены)
        function dishesUsingIngredient(name) {
            const n = String(name || '').trim().toLowerCase();
            return menuDB.filter(d => {
                const inMain = (d.ingredients || []).some(i => String(i.name || '').trim().toLowerCase() === n);
                const inSub = (d.subRecipes || []).some(s => (s.ingredients || []).some(x => parseSubIngredient(x).name.toLowerCase() === n));
                return inMain || inSub;
            });
        }

        // Миграция старых сохранений: дефолты новых полей v1.6
        function migrateV16() {
            inventoryDB.forEach(i => {
                if (!Array.isArray(i.allergens)) i.allergens = [];
                if (!(i.yieldPct > 0)) i.yieldPct = 100;
                if (!Array.isArray(i.priceHistory)) i.priceHistory = [];
            });
            menuDB.forEach(d => (d.ingredients || []).forEach(ing => {
                if (typeof ing.noScale !== 'boolean') ing.noScale = false;
            }));
        }

        // Миграция v1.7: валюта ₴ -> C$, дефолты новых полей
        function migrateV17() {
            if (v17migrated) return;
            if (currentCurrency === '₴') {
                currentCurrency = 'C$';
                setTimeout(() => showNotification(t('cur_migrated')), 1200);
            }
            inventoryDB.forEach(i => { if (!(i.minQty >= 0)) i.minQty = 0; });
            if (!salesDB || typeof salesDB !== 'object') salesDB = {};
            if (!Array.isArray(ordersDB)) ordersDB = [];
            v17migrated = true;
            markDirty();
        }

        // Миграция v1.9: дефолты новых коллекций (обмены смен, выходные) + pin/accessRole сотрудников.
        // Правило accessRole (единственное место, где оно задано):
        //   должность содержит «су-шеф»/«сушеф» -> 'souschef';
        //   содержит «шеф» -> 'chef'; иначе -> 'cook'.
        function migrateV19() {
            if (v19migrated) return;
            if (!Array.isArray(swapRequestsDB)) swapRequestsDB = [];
            if (!Array.isArray(notificationsDB)) notificationsDB = [];
            if (!Array.isArray(dayOffRequestsDB)) dayOffRequestsDB = [];
            if (!Array.isArray(dayOffDB)) dayOffDB = [];
            teamDB.forEach(e => {
                if (!('pin' in e) || e.pin === undefined) e.pin = null;
                if (!e.accessRole) e.accessRole = deriveAccessRole(e.role);
            });
            v19migrated = true;
            markDirty();
        }

        // Миграция v1.8: дефолты новых коллекций (счета OCR, синхронизация)
        function migrateV18() {
            if (!Array.isArray(invoicesDB)) invoicesDB = [];
            if (!Array.isArray(syncLog)) syncLog = [];
            const syncDefaults = { enabled: false, serverUrl: '', secret: '', deviceId: '', keyTs: {}, lastSync: null, lastError: null };
            if (!syncMeta || typeof syncMeta !== 'object') syncMeta = Object.assign({}, syncDefaults);
            else for (const k of Object.keys(syncDefaults)) if (!(k in syncMeta)) syncMeta[k] = syncDefaults[k];
            markDirty();
        }
