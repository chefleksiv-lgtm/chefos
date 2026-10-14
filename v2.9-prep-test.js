// v2.9: Заготовки на смену — отправка поварам, которые сейчас на смене
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } }

// ---------- моки окружения ----------
let prepDB = [];
let currentAppRole = 'chef';
let currentEmployeeId = null;
let activeKitchen = 'Основная кухня';
const PERMISSIONS = { chef: { prepCheck: true }, souschef: { prepCheck: true }, cook: { prepCheck: true }, cashier: { prepCheck: false } };
let teamDB = [
    { id: 1, name: 'Шеф Богдан', accessRole: 'chef' },
    { id: 7, name: 'Иван Повар', accessRole: 'cook' },
    { id: 8, name: 'Мария Повар', accessRole: 'cook' },
    { id: 9, name: 'Олег Касса', accessRole: 'cashier' }
];
let timeclockDB = [];
let scheduleDB = { 'Основная кухня': { 'Пн': [], 'Вт': [], 'Ср': [], 'Чт': [], 'Пт': [], 'Сб': [], 'Вс': [] } };
function myEmployeeId() { return currentEmployeeId; }
function empName(id) { const e = teamDB.find(x => String(x.id) === String(id)); return e ? e.name : '?'; }
function localDateStr(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function markDirty() {}
const _notifs = [];
function notifyUser(empId, type, text) { _notifs.push({ empId, type, text }); }
let _notifMsg = '';
function showNotification(t) { _notifMsg = t; }
let _confirmCb = null;
function showConfirm(t, m, cb) { _confirmCb = cb; _confirmMsg = m; }
let _confirmMsg = '';
function openModal() {}
function closeModal() {}
const _els = {};
global.document = { getElementById: (id) => _els[id] || null };

// ---------- грузим prep.js ----------
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/ChefOS/ChefOS/js/prep.js', 'utf8');
eval(src);

// ---------- хелперы ----------
ok(prepEsc('<b>"x"</b>') === '&lt;b&gt;&quot;x&quot;&lt;/b&gt;', 'prepEsc экранирует');
ok(prepFmtDate('2026-10-14') === '14.10.2026', 'prepFmtDate');
ok(prepStatusBadge('draft').includes('Черновик'), 'бейдж draft');
ok(prepStatusBadge('sent').includes('На смене'), 'бейдж sent');
ok(prepStatusBadge('done').includes('Выполнен'), 'бейдж done');
currentAppRole = 'cashier'; ok(prepCanView() === false, 'кассир не видит');
currentAppRole = 'cook'; ok(prepCanView() === true && prepCanApprove() === false, 'повар видит, не утверждает');
currentAppRole = 'chef';

// ---------- кто на смене: табель ----------
const nowIso = new Date().toISOString();
const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
const stale = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
timeclockDB = [
    { id: 1, employeeId: 7, date: '2026-10-14', clockIn: hourAgo, clockOut: null },   // Иван отбит
    { id: 2, employeeId: 9, date: '2026-10-14', clockIn: hourAgo, clockOut: null },   // кассир отбит — не повар
    { id: 3, employeeId: 8, date: '2026-10-14', clockIn: stale, clockOut: null },     // Мария: протухшая отметка
];
let cooks = prepOnShiftCooks();
ok(cooks.length === 1 && cooks[0].id === 7 && cooks[0].name === 'Иван Повар', 'табель: только отбитый повар, кассир и протухшая отметка отсеяны');

// ---------- фолбэк: график ----------
timeclockDB = [];
const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date().getDay()];
scheduleDB['Основная кухня'][wd] = [{ id: 8, start: '9:00', end: '17:00' }, { id: 9, start: '9:00', end: '17:00' }, { id: 8, start: '18:00', end: '22:00' }];
cooks = prepOnShiftCooks();
ok(cooks.length === 1 && cooks[0].id === 8, 'график: повар из расписания, без дублей, кассир отсеян');

// ---------- вообще никого ----------
scheduleDB['Основная кухня'][wd] = [];
ok(prepOnShiftCooks().length === 0, 'никого на смене — пусто');

// ---------- отправка ----------
timeclockDB = [{ id: 1, employeeId: 7, date: '2026-10-14', clockIn: hourAgo, clockOut: null }];
const rec = { id: 101, date: '2026-10-14', shift: 'утро', authorId: 'role:chef', authorName: 'Шеф', items: [{ name: 'Бульон', qty: '5', unit: 'л', note: '', done: false }, { name: 'Соус', qty: '2', unit: 'л', note: '', done: false }], status: 'draft', assignees: [], createdAt: Date.now() };
prepDB.push(rec);
prepSend(101);
ok(_confirmCb !== null && _confirmMsg.includes('Иван Повар'), 'диалог показывает имя повара на смене');
_confirmCb();
ok(prepDB[0].status === 'sent', 'статус sent');
ok(prepDB[0].assignees.length === 1 && prepDB[0].assignees[0].id === 7, 'назначен отбитый повар');
ok(_notifs.some(n => n.empId === 7 && n.type === 'prep'), 'повар получил уведомление');

// повторная отправка невозможна
_confirmCb = null;
prepSend(101);
ok(_confirmCb === null, 'повторная отправка заблокирована');

// без поваров на смене — не отправляем
timeclockDB = [];
const rec2 = { id: 102, date: '2026-10-14', shift: 'день', authorId: 'role:chef', authorName: 'Шеф', items: [{ name: 'Хлеб', qty: '10', unit: 'шт', note: '', done: false }], status: 'draft', assignees: [], createdAt: Date.now() };
prepDB.push(rec2);
_notifMsg = '';
prepSend(102);
ok(prepDB[1].status === 'draft' && _notifMsg.includes('Нет поваров на смене'), 'без поваров не отправляется');

// пустой список не отправляется
timeclockDB = [{ id: 1, employeeId: 7, date: '2026-10-14', clockIn: hourAgo, clockOut: null }];
const rec3 = { id: 103, date: '2026-10-14', shift: 'вечер', authorId: 'role:chef', authorName: 'Шеф', items: [], status: 'draft', assignees: [], createdAt: Date.now() };
prepDB.push(rec3);
_notifMsg = '';
prepSend(103);
ok(prepDB[2].status === 'draft' && _notifMsg.includes('пуст'), 'пустой список не отправляется');

// ---------- видимость для повара ----------
currentAppRole = 'cook'; currentEmployeeId = 7;
_els['prep-date'] = { value: '' };
_els['prep-list'] = { innerHTML: '' };
renderPrep();
ok(_els['prep-list'].innerHTML.includes('Бульон'), 'назначенный повар видит список');
currentEmployeeId = 8; // Мария не назначена
_els['prep-list'] = { innerHTML: '' };
renderPrep();
ok(!_els['prep-list'].innerHTML.includes('Бульон'), 'неназначенный повар не видит чужой список');

// ---------- чеклист: назначенный отмечает, всё готово -> done ----------
currentEmployeeId = 7;
prepToggleItem(101, 0);
ok(prepDB[0].status === 'sent' && prepDB[0].items[0].done === true, 'первая позиция отмечена, статус sent');
prepToggleItem(101, 1);
ok(prepDB[0].status === 'done', 'все готовы -> статус done');
ok(_notifMsg.includes('выполнена'), 'тост о выполнении');

// ---------- чужой не может отмечать ----------
const rec4 = { id: 104, date: '2026-10-14', shift: 'утро', authorId: 'role:chef', authorName: 'Шеф', items: [{ name: 'Салат', qty: '1', unit: 'кг', note: '', done: false }], status: 'sent', assignees: [{ id: 8, name: 'Мария Повар' }], createdAt: Date.now() };
prepDB.push(rec4);
currentEmployeeId = 7; // Иван не назначен на 104
prepToggleItem(104, 0);
ok(prepDB[3].items[0].done === false, 'неназначенный не может отмечать');

// шеф может отмечать
currentAppRole = 'chef'; currentEmployeeId = null;
prepToggleItem(104, 0);
ok(prepDB[3].items[0].done === true && prepDB[3].status === 'done', 'шеф отмечает -> done');

// ---------- удаление черновика ----------
currentAppRole = 'chef';
prepDelete(102);
ok(_confirmCb !== null, 'удаление просит подтверждения');
_confirmCb();
ok(!prepDB.some(x => x.id === 102), 'черновик удалён');
_confirmCb = null;
prepDelete(101); // sent — нельзя
ok(_confirmCb === null && prepDB.some(x => x.id === 101), 'отправленный список не удаляется');

console.log(`\nprep: PASS ${pass}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
