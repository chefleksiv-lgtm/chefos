// --- LOCALSTORAGE PERSISTENCE ---
// Сохраняет состояние приложения между перезагрузками страницы.
// Подключать ПОСЛЕ js/data.js. Вызывать loadState() в main.js до отрисовки.

// v2.0: ключ зависит от аккаунта — у каждого пользователя своя изолированная кухня.
// До входа (или без сервера) используется legacy-ключ.
let STORAGE_KEY = 'chefos_state_v1';
function storageKeyForUser(userId) { return 'chefos_state_v1_' + String(userId); }

// Какие переменные из data.js сохраняем.
// Не сохраняем: currentAppRole/currentPin (авторизация — каждый раз заново),
// currentMonthDate/selectedDate (всегда "сегодня"), временное состояние редакторов
// (editingTTKId, tempEditIngredients и т.п.) — это мусор UI, а не данные.
const PERSISTED_KEYS = [
    'kitchens', 'activeKitchen',
    'currentCurrency', 'currentCountry', 'currentLanguage',
    'currentFoodCosts', 'targetFoodCosts',
    'chefNotes', 'pinCodes', 'tileOrder',
    'activeTabs', 'activeMenuFilters', 'activeTTKFilter',
    'menuDB', 'suppliersDB', 'inventoryDB', 'teamDB', 'scheduleDB', 'financeDB', 'wasteDB',
    'payrollDB', 'salesDB', 'ordersDB', 'v17migrated',
    'invoicesDB', 'syncMeta', 'syncLog',
    'swapRequestsDB', 'notificationsDB', 'dayOffRequestsDB', 'dayOffDB', 'v19migrated'
];

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
    return true;
}

// Запустить автосейв: раз в 5 сек пишем, только если были изменения,
// плюс гарантированно пишем при закрытии/перезагрузке вкладки.
function startAutosave() {
    if (_autosaveStarted) return;
    _autosaveStarted = true;

    setInterval(() => {
        if (_storageDirty) saveState();
    }, 5000);

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('beforeunload', () => saveState());
    }
}

// Полный сброс: стереть сохранённое и вернуться к моковым данным (нужна перезагрузка).
function resetState() {    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('[ChefOS] resetState failed:', e);
    }
}
