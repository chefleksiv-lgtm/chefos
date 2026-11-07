// --- LOCALSTORAGE PERSISTENCE ---
// Сохраняет состояние приложения между перезагрузками страницы.
// Подключать ПОСЛЕ js/data.js. Вызывать loadState() в main.js до отрисовки.

// v2.0: ключ зависит от аккаунта — у каждого пользователя своя изолированная кухня.
// До входа (или без сервера) используется legacy-ключ.
let STORAGE_KEY = 'chefos_state_v1';
function storageKeyForUser(userId) { return 'chefos_state_v1_' + String(userId); }
// 2.1.9: флаг объединения базы ТТК (единая menuDB, не per-location).
// В PERSISTED_KEYS → синкается как отдельная коллекция (false→true, монотонно).
let menuDBUnifiedV1 = false;

// Какие переменные из data.js сохраняем.
// Не сохраняем: currentAppRole/currentPin (авторизация — каждый раз заново),
// currentMonthDate/selectedDate (всегда "сегодня"), временное состояние редакторов
// (editingTTKId, tempEditIngredients и т.п.) — это мусор UI, а не данные.
const PERSISTED_KEYS = [
    'kitchens', 'activeKitchen',
    'currentCurrency', 'currentCountry', 'currentLanguage', 'taxRate',
    'currentFoodCosts', 'targetFoodCosts',
    'chefNotes', 'pinCodes', 'tileOrder', 'tileGroups',
    'activeTabs', 'activeMenuFilters', 'activeTTKFilter',
    'menuDB', 'suppliersDB', 'inventoryDB', 'teamDB', 'scheduleDB', 'financeDB', 'wasteDB',
    'payrollDB', 'timeclockDB', 'salesDB', 'receiptsDB', 'kdsDB', 'tipsDB', 'ordersDB', 'moneyTxDB', 'prepDB', 'v17migrated',
    'invoicesDB', 'syncMeta', 'syncLog',
    'swapRequestsDB', 'notificationsDB', 'dayOffRequestsDB', 'dayOffDB', 'v19migrated', 'menuDBUnifiedV1',
    'locationsDB', 'activeLocationId', 'locationData',
    'fsPointsDB', 'fsTempDB', 'fsCheckTemplate', 'fsCheckDB',
    'kdsThresholds', 'kdsSound', 'tasksDB', 'salesTarget', 'accentColor', 'themeMode', 'publicMenu',
    'tablesDB', 'tableTabsDB', 'reservationsDB', 'waitlistDB'
];

// --- МУЛЬТИ-ЛОКАЦИИ (v2.2) ---
// Ключи, живущие отдельно у каждой локации. Остальные (валюта, язык, PIN,
// locationsDB, activeLocationId, locationData, флаги миграций, syncMeta) — общие на аккаунт.
const LOCATION_KEYS = [
    'kitchens', 'activeKitchen',
    'currentFoodCosts', 'targetFoodCosts',
    'chefNotes',
    'activeTabs', 'activeMenuFilters', 'activeTTKFilter',
    'suppliersDB', 'inventoryDB', 'teamDB', 'scheduleDB', 'financeDB', 'wasteDB',
    'payrollDB', 'timeclockDB', 'salesDB', 'receiptsDB', 'kdsDB', 'tipsDB', 'ordersDB', 'prepDB',
    'invoicesDB', 'syncLog',
    'swapRequestsDB', 'notificationsDB', 'dayOffRequestsDB', 'dayOffDB', 'moneyTxDB',
    'fsPointsDB', 'fsTempDB', 'fsCheckTemplate', 'fsCheckDB',
    'kdsThresholds',
    'tablesDB', 'tableTabsDB', 'reservationsDB', 'waitlistDB'
];
// Дефолтное (пустое) состояние новой локации — снимок дефолтов data.js до loadState().
const DEFAULT_LOCATION_STATE = (() => {
    const snap = {};
    for (const key of LOCATION_KEYS) {
        try { snap[key] = JSON.parse(JSON.stringify(eval(key))); } catch (e) { snap[key] = undefined; }
    }
    return snap;
})();
function deepCopy(v) { return JSON.parse(JSON.stringify(v)); }
// Сохранить рабочий набор в locationData[activeLocationId]
function stashLocationState() {
    try {
        if (!activeLocationId) return;
        if (!locationData || typeof locationData !== 'object') locationData = {};
        const snap = {};
        for (const key of LOCATION_KEYS) {
            try { snap[key] = deepCopy(eval(key)); } catch (e) { /* пропускаем */ }
        }
        locationData[activeLocationId] = snap;
        // 2.1.9: menuDB — единая на аккаунт, в LOCATION_KEYS её больше нет. Но зеркалим
        // её в stash каждой локации, чтобы экземпляр со СТАРЫМ кодом (его applyLocationState
        // читает stash menuDB) тоже видел объединённый набор, а не устаревший локальный.
        try {
            const unified = deepCopy(menuDB);
            for (const locId of Object.keys(locationData)) {
                if (locationData[locId] && typeof locationData[locId] === 'object') locationData[locId].menuDB = deepCopy(unified);
            }
        } catch (e) { /* зеркало не критично для сохранения */ }
    } catch (e) { console.error('[ChefOS] stashLocationState failed:', e); }
}
// Загрузить состояние локации в рабочие переменные (in-place, как loadState).
// 2.1.9: menuDB здесь НЕ трогается — она исключена из LOCATION_KEYS и едина на аккаунт.
// stash menuDB (зеркало для старого кода) намеренно игнорируется.
function applyLocationState(locId) {
    const st = (locationData && locationData[locId]) || null;
    const src = st || DEFAULT_LOCATION_STATE;
    for (const key of LOCATION_KEYS) {
        if (src[key] === undefined) continue;
        const incoming = deepCopy(src[key]);
        let current;
        try { current = eval(key); } catch (e) { continue; }
        if (Array.isArray(current) && Array.isArray(incoming)) {
            current.length = 0;
            current.push(...incoming);
        } else if (isPlainObject(current) && isPlainObject(incoming)) {
            for (const k of Object.keys(current)) delete current[k];
            Object.assign(current, incoming);
        } else {
            try { eval(key + ' = incoming'); } catch (e) { /* пропускаем */ }
        }
    }
}

// --- 2.1.9: ЕДИНАЯ БАЗА ТТК ---
// menuDB больше не входит в LOCATION_KEYS: вкладка ТТК — одна общая база рецептов
// на весь аккаунт, а не отдельная на локацию. Объединение — одноразовая миграция при
// загрузке (migrateUnifyMenuDB): union рабочего набора и всех stash'ей локаций.
// «Полнота» записи — для выбора победителя при дублях (более полная никогда не
// заменяется более пустой):
function menuFullnessScore(d) {
    if (!d || typeof d !== 'object') return 0;
    let s = 0;
    if (Array.isArray(d.ingredients)) s += d.ingredients.length * 10;
    if (Array.isArray(d.steps)) s += d.steps.length * 5;
    if (Array.isArray(d.subRecipes)) s += d.subRecipes.length * 3;
    if (d.img) s += 2;
    if (d.yield > 0) s += 1;
    if (d.menuPrice > 0) s += 1;
    if (d.costPrice > 0) s += 1;
    return s;
}
function menuNormName(d) {
    return String((d && d.name) || '').trim().toLowerCase();
}
// Одноразовое объединение menuDB. Идемпотентна по построению (union + dedup), а флаг
// menuDBUnifiedV1 (PERSISTED_KEYS, синкается) гарантирует один запуск на аккаунт.
// Порядок: рабочий набор первым, затем stash'и — при равных баллах побеждает первый.
// Дубли: сначала по id, потом по нормализованному имени (тип + имя, без регистра и
// пробелов по краям). Записи без id и без имени не мержатся ни с чем — никогда не удаляем.
// Вызывается в main.js ПОСЛЕ syncResetHashBaseline, чтобы объединённый набор ушёл
// на сервер со свежей меткой (а не был поглощён baseline).
function migrateUnifyMenuDB() {
    try {
        if (typeof menuDB === 'undefined' || !Array.isArray(menuDB)) return;
        if (menuDBUnifiedV1) return;
        const merged = [];
        const byId = new Map();
        const byName = new Map();
        function consider(rec) {
            if (!rec || typeof rec !== 'object') return;
            const idKey = (rec.id !== undefined && rec.id !== null && rec.id !== '') ? 'id:' + String(rec.id) : null;
            const nameKey = menuNormName(rec) ? 'nm:' + String(rec.type || 'dish') + '|' + menuNormName(rec) : null;
            let idx = -1;
            if (idKey && byId.has(idKey)) idx = byId.get(idKey);
            else if (nameKey && byName.has(nameKey)) idx = byName.get(nameKey);
            if (idx < 0) {
                merged.push(deepCopy(rec));
                const ni = merged.length - 1;
                if (idKey) byId.set(idKey, ni);
                if (nameKey) byName.set(nameKey, ni);
                return;
            }
            const cur = merged[idx];
            const winner = menuFullnessScore(rec) > menuFullnessScore(cur) ? rec : cur;
            const loser = winner === rec ? cur : rec;
            const w = deepCopy(winner);
            // Состав/шаги не теряем: если у победителя их нет, а у проигравшего есть — добираем.
            if ((!Array.isArray(w.ingredients) || !w.ingredients.length) && Array.isArray(loser.ingredients) && loser.ingredients.length) w.ingredients = deepCopy(loser.ingredients);
            if ((!Array.isArray(w.steps) || !w.steps.length) && Array.isArray(loser.steps) && loser.steps.length) w.steps = deepCopy(loser.steps);
            merged[idx] = w;
            // Перелинкуем оба ключа на победителя, чтобы третья копия тоже смержилась сюда.
            if (idKey) byId.set(idKey, idx);
            const loserIdKey = (loser.id !== undefined && loser.id !== null && loser.id !== '') ? 'id:' + String(loser.id) : null;
            if (loserIdKey) byId.set(loserIdKey, idx);
            const loserNameKey = menuNormName(loser) ? 'nm:' + String(loser.type || 'dish') + '|' + menuNormName(loser) : null;
            if (loserNameKey) byName.set(loserNameKey, idx);
            if (nameKey) byName.set(nameKey, idx);
        }
        menuDB.forEach(consider);
        if (typeof locationData === 'object' && locationData) {
            for (const locId of Object.keys(locationData)) {
                const st = locationData[locId];
                if (st && Array.isArray(st.menuDB)) st.menuDB.forEach(consider);
            }
        }
        // menuDB — const-массив: заменяем содержимое in-place.
        menuDB.length = 0;
        merged.forEach(r => menuDB.push(r));
        // Сразу зеркалим объединённый набор в stash'и (для старого кода) — не ждём автосейва.
        try {
            if (typeof locationData === 'object' && locationData) {
                for (const locId of Object.keys(locationData)) {
                    if (locationData[locId] && typeof locationData[locId] === 'object') locationData[locId].menuDB = deepCopy(menuDB);
                }
            }
        } catch (e) { /* зеркало не критично */ }
        menuDBUnifiedV1 = true;
        if (typeof markDirty === 'function') markDirty();
    } catch (e) { console.error('[ChefOS] migrateUnifyMenuDB failed:', e); }
}

let _storageDirty = false;
let _autosaveStarted = false;

// Пометить данные как изменённые — вызывать после любых правок БД.
// Пример: после добавления сотрудника -> markDirty();
function markDirty() {
    _storageDirty = true;
}

// Собрать текущее состояние в объект и записать в localStorage.
function saveState() {
    try {
        stashLocationState();
        const state = {};
        for (const key of PERSISTED_KEYS) {
            // Переменные объявлены через let в data.js — в обычных (не модульных)
            // скриптах они лежат в общем глобальном scope, eval ниже их видит.
            state[key] = eval(key);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        _storageDirty = false;
        return true;
    } catch (e) {
        console.error('[ChefOS] saveState failed:', e);
        return false;
    }
}

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Прочитать состояние из localStorage и разложить обратно по переменным.
// Вызывать один раз при старте, до первой отрисовки.
function loadState() {
    let raw = null;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        console.error('[ChefOS] loadState: localStorage недоступен:', e);
        return false;
    }
    if (!raw) return false; // первый запуск — нечего загружать

    let state;
    try {
        state = JSON.parse(raw);
    } catch (e) {
        console.error('[ChefOS] loadState: битый JSON, использую дефолтные данные:', e);
        return false;
    }
    if (!state || typeof state !== 'object') return false;

    let restored = 0;
    for (const key of PERSISTED_KEYS) {
        if (state[key] === undefined) continue;
        const incoming = state[key];
        const current = eval(key);
        if (Array.isArray(current) && Array.isArray(incoming)) {
            // const-массивы (напр. menuDB) нельзя переназначить — заменяем содержимое
            current.length = 0;
            current.push(...incoming);
        } else if (isPlainObject(current) && isPlainObject(incoming)) {
            for (const k of Object.keys(current)) delete current[k];
            Object.assign(current, incoming);
        } else {
            // Присваиваем в let-переменную из data.js через eval —
            // прямое "menuDB = ..." здесь бы создало локальную переменную.
            eval(key + ' = incoming');
        }
        restored++;
    }
    console.log('[ChefOS] loadState: восстановлено ключей:', restored + '/' + PERSISTED_KEYS.length);
    // ensureLocations при миграции сам stash'ит текущий (восстановленный) набор как main,
    // поэтому applyLocationState вызываем только если для локации есть сохранённое состояние.
    if (typeof ensureLocations === 'function') ensureLocations();
    if (activeLocationId && locationData && locationData[activeLocationId]) applyLocationState(activeLocationId);
    return true;
}

// Обновить открытые экраны после подхвата чужого сохранения (storage-событие).
function refreshOpenViews() {
    try {
        const open = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
        if (open('inventory-modal') && typeof filterInventory === 'function') filterInventory();
        if (open('finance-modal') && typeof renderFinanceTab === 'function') renderFinanceTab();
        if (open('kds-modal') && typeof renderKDS === 'function') renderKDS();
        if (open('prep-modal') && typeof renderPrep === 'function') renderPrep();
        if (open('sales-modal') && typeof renderPosCtx === 'function') renderPosCtx();
    } catch (e) { /* ignore */ }
}
function startAutosave() {
    if (_autosaveStarted) return;
    _autosaveStarted = true;

    setInterval(() => {
        if (_storageDirty) saveState();
        if (typeof updateSyncStatus === 'function') updateSyncStatus();
    }, 5000);

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('beforeunload', () => saveState());
        // Другая вкладка того же браузера сохранила состояние: если у нас нет
        // несохранённых правок — подхватываем её данные, чтобы наш следующий
        // автосейв не затёр их устаревшей копией (last-writer-wins).
        window.addEventListener('storage', (e) => {
            try {
                if (!e || e.key !== STORAGE_KEY) return;
                if (_storageDirty) return; // есть свои несохранённые правки — не трогаем
                if (loadState()) {
                    try { if (typeof syncResetHashBaseline === 'function') syncResetHashBaseline(); } catch (err) {}
                    if (typeof refreshOpenViews === 'function') refreshOpenViews();
                }
            } catch (err) { /* ignore */ }
        });
    }
}

// Полный сброс: стереть сохранённое и вернуться к моковым данным (нужна перезагрузка).
function resetState() {    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('[ChefOS] resetState failed:', e);
    }
}
