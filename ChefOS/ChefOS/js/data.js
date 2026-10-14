        // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И БД ---
        let currentAppRole = null; // 'chef', 'souschef', 'cook', 'cashier'
        let currentPin = '';
        // ID сотрудника, вошедшего по личному PIN (сессия; НЕ персистится)
        let currentEmployeeId = null;

        // v1.9: матрица прав ролей. Единственный источник правды о RBAC:
        // applyRolePermissions() в auth.js строит UI строго по ней.
        const PERMISSIONS = {
            chef: {
                label: 'chef',
                tiles: ['menu', 'ttk', 'fc', 'analytics', 'inv', 'sales', 'stocktake', 'books', 'team', 'settings', 'widget', 'kds', 'foodsafety'],
                seePrices: true,          // цены блюд/ТТК/склада
                seeMenuPrices: true,       // цена блюда в меню
                finance: true,             // фуд-кост, аналитика, отчёты
                sales: true,               // внесение продаж
                settings: true,            // настройки, смена ролевых PIN
                invoices: true,            // накладные, поставщики, цены поставщиков
                stock: true,               // склад: ингредиенты/остатки
                personnel: true,           // найм/увольнение/правка сотрудников
                employeePins: true,        // выдача/смена личных PIN сотрудников
                editSchedule: true,        // правка графика смен (+/-)
                approve: true,             // утверждение обменов и выходных
                requestSwap: true,
                requestDayOff: true,
                prepCheck: true
            },
            souschef: {
                label: 'souschef',
                tiles: ['menu', 'ttk', 'inv', 'stocktake', 'team', 'widget', 'kds', 'foodsafety'],
                seePrices: false,
                seeMenuPrices: false,
                finance: false,
                sales: false,
                settings: false,
                invoices: false,
                stock: true,
                personnel: false,
                employeePins: false,
                editSchedule: true,
                approve: true,
                requestSwap: true,
                requestDayOff: true,
                prepCheck: true
            },
            cook: {
                label: 'cook',
                tiles: ['menu', 'ttk', 'stocktake', 'team', 'widget', 'kds', 'foodsafety'],
                seePrices: false,
                seeMenuPrices: false,
                finance: false,
                sales: false,
                settings: false,
                invoices: false,
                stock: false,
                personnel: false,
                employeePins: false,
                editSchedule: false,
                approve: false,
                requestSwap: true,
                requestDayOff: true,
                prepCheck: true
            },
            cashier: {
                label: 'cashier',
                tiles: ['menu', 'sales'],
                seePrices: false,
                seeMenuPrices: true,      // кассе цена блюда нужна для продаж
                finance: false,
                sales: true,
                settings: false,
                invoices: false,
                stock: false,
                personnel: false,
                employeePins: false,
                editSchedule: false,
                approve: false,
                requestSwap: false,
                requestDayOff: false,
                prepCheck: false
            }
        };
        function rolePerm(role, key) {
            const p = PERMISSIONS[role];
            return !!(p && p[key]);
        }
        // v1.9: вывод accessRole из строки должности (правило задокументировано в README).
        // Порядок важен: сначала проверяем «су-шеф», потом «шеф».
        function deriveAccessRole(roleText) {
            const s = String(roleText || '').toLowerCase();
            if (s.includes('су-шеф') || s.includes('сушеф')) return 'souschef';
            if (s.includes('шеф')) return 'chef';
            return 'cook';
        }

        // PIN-коды входа (меняются в Настройках, сохраняются в localStorage)
        let pinCodes = { chef: '1111', cook: '2222', cashier: '3333' };

        // Порядок плиток на главном экране (перетаскивание, сохраняется в localStorage)
        let tileOrder = ['tile-menu', 'tile-ttk', 'tile-fc', 'tile-analytics', 'tile-inv', 'tile-sales', 'tile-kds', 'tile-foodsafety', 'tile-stocktake', 'tile-books', 'tile-team', 'tile-settings'];

        let kitchens = ['Основная кухня', 'Горячий цех', 'Бар'];
        let activeKitchen = 'Основная кухня';
        let currentCurrency = 'C$'; 
        let currentCountry = 'CA';
        let currentLanguage = 'ru';
        let currentFoodCosts = { 'Основная кухня': 28.5, 'Горячий цех': 32.1, 'Бар': 21.0 };
        let targetFoodCosts = { 'Основная кухня': 30, 'Горячий цех': 30, 'Бар': 25 };
        let currentMonthDate = new Date();
        let selectedDate = new Date();
        let chefNotes = {}; 
        let selectedEmoji = null; 
        let kitchenToRename = null;
        
        // Вкладки
        let activeTabs = { inventory: 'ingredients', team: 'staff', dish: 'assembly', ttk: 'assembly' };
        let currentViewingDishId = null;
        let currentViewingTTKId = null;

        // Меню и ТТК
        let activeMenuFilters = { gluten: false, lactose: false, allergen: '' };
        let activeTTKFilter = 'dishes';
        let editingTTKId = null;
        let currentTTKImageBase64 = '';
        let tempEditIngredients = [];
        let tempEditSteps = [];
        
        // Склад
        let editingIngredientId = null;
        let editingSupplierId = null;
        const INGREDIENT_CATEGORIES = ['Мясо', 'Птица', 'Рыба и морепродукты', 'Овощи и фрукты', 'Молочная продукция', 'Сыры', 'Бакалея', 'Бакалея премиум', 'Специи и соусы', 'Зелень', 'Алкоголь', 'Безалкогольные напитки', 'Хлебобулочные изделия', 'Заморозка', 'Хозтовары', 'Другое'];
        const SUPPLIER_CATEGORIES = ['Универсальный', 'Мясо', 'Птица', 'Рыба и морепродукты', 'Овощи и фрукты', 'Молочная продукция', 'Бакалея', 'Алкоголь', 'Безалкогольные напитки', 'Хозтовары', 'Оборудование', 'Другое'];
        
        // Команда
        const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        let scheduleTargetDay = null;
        let editingEmployeeId = null;

        // Финансы
        function getCurrentMonthKey() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }

        const menuDB = [
            { id: 1, type: 'dish', name: 'Салат Цезарь с курицей', category: 'Холодный цех', isTTKActive: true, status: 'in_stock', portions: 1, yield: 220, costPrice: 4.5, menuPrice: 24, targetFoodCost: 20.5, calories: 350, protein: 25, fat: 18, carbs: 12, glutenFree: false, lactoseFree: false, img: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&q=80&w=800', ingredients: [ {name: 'Ромен', weight: '100g'}, {name: 'Куриное филе', weight: '80g'} ], steps: ['Нарезать ромен.', 'Замешать с соусом.', 'Выложить курицу.'], subRecipes: [ { name: 'Соус Цезарь', yield: '50g', ingredients: ['Майонез 40g', 'Анчоусы 5g', 'Чеснок 5g'], steps: ['Перебить анчоусы и чеснок.', 'Смешать с майонезом.'] } ] },
            { id: 2, type: 'dish', name: 'Тартар из говядины', category: 'Холодный цех', isTTKActive: true, status: 'low', portions: 1, yield: 180, costPrice: 8.5, menuPrice: 32, targetFoodCost: 24.2, calories: 420, protein: 32, fat: 28, carbs: 5, glutenFree: true, lactoseFree: true, img: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=800', ingredients: [ {name: 'Вырезка', weight: '120g'}, {name: 'Каперсы', weight: '10g'} ], steps: ['Нарезать мясо.', 'Замешать с каперсами.'], subRecipes: [] },
            { id: 3, type: 'dish', name: 'Стейк Рибай', category: 'Горячий цех', isTTKActive: true, status: 'in_stock', portions: 1, yield: 300, costPrice: 20, menuPrice: 68, targetFoodCost: 36.8, calories: 850, protein: 65, fat: 68, carbs: 0, glutenFree: true, lactoseFree: true, img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800', ingredients: [ {name: 'Рибай', weight: '350g'}, {name: 'Соль', weight: '5g', noScale: true} ], steps: ['Жарить на гриле.', 'Дать отдохнуть 5 мин.'], subRecipes: [] },
            { id: 4, type: 'prep', name: 'Соус Цезарь (База)', category: 'Заготовки', isTTKActive: false, status: 'in_stock', portions: 10, yield: 500, costPrice: 5, menuPrice: 0, targetFoodCost: 0, calories: 2500, protein: 15, fat: 250, carbs: 5, glutenFree: true, lactoseFree: false, img: 'https://images.unsplash.com/photo-1472476449509-80ee822bb1db?w=800', ingredients: [ {name: 'Майонез', weight: '400g'}, {name: 'Анчоусы', weight: '30g'}, {name: 'Чеснок', weight: '10g'} ], steps: ['Перебить анчоусы и чеснок.', 'Смешать с майонезом.'], subRecipes: [] }
        ];

        let suppliersDB = [
            { id: 1, name: 'Sysco Canada', category: 'Универсальный', manager: 'Anna', phone: '+14165550142', email: 'anna@sysco.ca', status: 'active' },
            { id: 2, name: 'Gordon Food Service', category: 'Мясо', manager: 'Igor', phone: '+14165550187', email: 'igor@gfs.ca', status: 'active' }
        ];

        let inventoryDB = [
            { id: 101, name: 'Лосось филе охлажденное', category: 'Рыба и морепродукты', quantity: 4.5, unit: 'kg', price: 38, previousPrice: 39.5, supplier: 'Sysco Canada', yieldPct: 100, allergens: ['fish'], priceHistory: [] },
            { id: 102, name: 'Вырезка', category: 'Мясо', quantity: 12.0, unit: 'kg', price: 65, previousPrice: 62, supplier: 'Gordon Food Service', yieldPct: 100, allergens: [], priceHistory: [] },
            { id: 103, name: 'Томаты черри', category: 'Овощи и фрукты', quantity: 2.5, unit: 'kg', price: 8, previousPrice: 8, supplier: 'Sysco Canada', yieldPct: 100, allergens: [], priceHistory: [] },
            { id: 104, name: 'Ромен', category: 'Зелень', quantity: 3.0, unit: 'kg', price: 6, previousPrice: 6, supplier: 'Sysco Canada', yieldPct: 85, allergens: [], priceHistory: [] },
            { id: 105, name: 'Куриное филе', category: 'Птица', quantity: 15.0, unit: 'kg', price: 14, previousPrice: 14, supplier: 'Gordon Food Service', yieldPct: 100, allergens: [], priceHistory: [] },
            { id: 106, name: 'Рибай', category: 'Мясо', quantity: 8.0, unit: 'kg', price: 55, previousPrice: 55, supplier: 'Gordon Food Service', yieldPct: 100, allergens: [], priceHistory: [] },
            { id: 107, name: 'Майонез', category: 'Бакалея', quantity: 10.0, unit: 'kg', price: 9, previousPrice: 9, supplier: 'Sysco Canada', yieldPct: 100, allergens: ['eggs', 'soy'], priceHistory: [] },
            { id: 108, name: 'Анчоусы', category: 'Бакалея премиум', quantity: 1.5, unit: 'kg', price: 45, previousPrice: 45, supplier: 'Sysco Canada', yieldPct: 100, allergens: ['fish'], priceHistory: [] },
            { id: 109, name: 'Каперсы', category: 'Бакалея', quantity: 2.0, unit: 'kg', price: 28, previousPrice: 28, supplier: 'Sysco Canada', yieldPct: 100, allergens: [], priceHistory: [] }
        ];

        let teamDB = [
            { id: 1, name: 'Александр Шеф', role: 'Шеф-повар', phone: '+14165550123', rate: 23 },
            { id: 2, name: 'Иван Сергеев', role: 'Су-шеф', phone: '+14165550124', rate: 20 },
            { id: 3, name: 'Мария Иванова', role: 'Повар ГЦ', phone: '+14165550125', rate: 18 },
            { id: 4, name: 'Олег Петров', role: 'Повар ХЦ', phone: '+14165550126', rate: 17 }
        ];

        let scheduleDB = { 
            'Основная кухня': { 
                'Пн': [{id: 1, start: '08:00', end: '20:00'}, {id: 2, start: '10:00', end: '22:00'}], 
                'Вт': [{id: 1, start: '08:00', end: '20:00'}, {id: 2, start: '08:00', end: '20:00'}, {id: 3, start: '12:00', end: '00:00'}], 
                'Ср': [{id: 1, start: '08:00', end: '20:00'}, {id: 3, start: '10:00', end: '22:00'}], 
                'Чт': [{id: 2, start: '08:00', end: '20:00'}, {id: 3, start: '10:00', end: '22:00'}], 
                'Пт': [{id: 1, start: '08:00', end: '20:00'}, {id: 2, start: '10:00', end: '22:00'}, {id: 3, start: '12:00', end: '02:00'}], 
                'Сб': [{id: 1, start: '10:00', end: '23:00'}, {id: 2, start: '10:00', end: '23:00'}, {id: 3, start: '12:00', end: '02:00'}], 
                'Вс': [{id: 2, start: '10:00', end: '22:00'}, {id: 3, start: '10:00', end: '22:00'}] 
            }
        };

        let financeDB = {
            '2026-04': { income: 42000, cogs: 12000, payroll: 11000, losses: 400 },
            [getCurrentMonthKey()]: { income: 9200, cogs: 2600, payroll: 0, losses: 120 }
        };

        // Табель: отметки прихода/ухода (v2.2).
        // [{id, employeeId, employeeName, date:'YYYY-MM-DD', clockIn: ISO, clockOut: ISO|null}]
        let timeclockDB = [];

        // Журнал зарплаты (v2.1): точный учёт вместо оценки «неделя×4».
        // [{id, date:'YYYY-MM-DD', employeeId, employeeName, hours, rate, amount, note}]
        let payrollDB = [];

        // Журнал списаний / отходов (v1.6): {id, date, ingredient, qty, unit, cost, reason}
        let wasteDB = [];

        // Продажи по блюдам (v1.7): { 'YYYY-MM': { dishId: qty } } — для ABC-анализа меню
        let salesDB = {};

        // KDS (v2.2): кухонные тикеты — {id, num, ts: ISO, items:[{name, qty}], status:'new'|'done'}
        let kdsDB = [];
        // Пороги таймера KDS в минутах: до green — норма, до amber — внимание, дальше — опоздание (меняет шеф)
        let kdsThresholds = { green: 5, amber: 10 };

        // Мульти-локации (v2.2): несколько ресторанов под одним аккаунтом.
        // locationsDB: [{id, name}]; activeLocationId — текущая; locationData: {locId: {key: value}} — данные остальных.
        let locationsDB = [];
        let activeLocationId = null;
        let locationData = {};

        // Food safety (v2.2): точки контроля температуры, журнал замеров, HACCP-чеклисты.
        // fsPointsDB: [{id, name, min, max}]; fsTempDB: [{id, date, time, pointId, pointName, temp, note}]
        // fsCheckTemplate: [{label}]; fsCheckDB: [{id, date, checks:[{label, done}], by}]
        let fsPointsDB = [];
        let fsTempDB = [];
        let fsCheckTemplate = [
            { label: 'Температура холодильников в норме' },
            { label: 'Сроки годности проверены' },
            { label: 'Маркировка и товарное соседство' },
            { label: 'Чистота поверхностей и инвентаря' },
            { label: 'Руки и форма персонала' }
        ];
        let fsCheckDB = [];

        // Чаевые (v2.2): {id, date:'YYYY-MM-DD', employeeId, employeeName, amount, note}
        let tipsDB = [];

        // Заказы поставщикам (v1.7): [{id, date, supplier, items:[{name, qty, unit}], status}]
        let ordersDB = [];

        // Деньги v2.5: ручные доходы/расходы (аренда, коммуналка, транспорт...).
        // [{id, date:'YYYY-MM-DD', type:'in'|'out', amount:Number, cat:'mcat_rent'|..., note}]
        let moneyTxDB = [];

        // План зала (v2.3): столики [{id, name, seats, x, y (в % от плана), shape:'round'|'square'}]
        let tablesDB = [];
        // Открытые счета столиков (v2.3): [{id, tableId, items:{dishId:qty}, ts, kdsSent}]
        let tableTabsDB = [];

        // Флаг одноразовой миграции v1.7
        let v17migrated = false;

        // Счета-фактуры от OCR (v1.8): {id, date, supplier, lines:[{raw, name, qty, unit, price, matchId, status}], applied}
        let invoicesDB = [];

        // Синхронизация (v1.8): настройки + журнал
        let syncMeta = { enabled: false, serverUrl: '', secret: '', deviceId: '', keyTs: {}, lastSync: null, lastError: null };
        let syncLog = []; // {ts, device, action, key, detail}

        // Команда v1.9: обмены сменами и выходные
        // swapRequestsDB: {id, kitchen, fromEmpId, fromShift:{day,start,end}, toEmpId|null,
        //   toShift:{day,start,end}|null, status, createdBy, createdAt, decidedBy, decidedAt, note}
        //   статусы: proposed -> peer_accepted/peer_rejected -> pending_approval -> approved/rejected (+cancelled)
        let swapRequestsDB = [];
        // notificationsDB: {id, empId, type, text, refId, createdAt, read}
        let notificationsDB = [];
        // dayOffRequestsDB: {id, kitchen, empId, date:'YYYY-MM-DD', reason, status, decidedBy, decidedAt}
        let dayOffRequestsDB = [];
        // dayOffDB: утверждённые выходные {kitchen, date:'YYYY-MM-DD', empId}
        let dayOffDB = [];

        // Флаг одноразовой миграции v1.9
        let v19migrated = false;

