// v2.9: Заготовки на смену — чистые хелперы + машина статусов
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } }

// ---------- моки окружения ----------
let prepDB = [];
let currentAppRole = 'cook';
let currentEmployeeId = 7;
const PERMISSIONS = { chef: { prepCheck: true }, souschef: { prepCheck: true }, cook: { prepCheck: true }, cashier: { prepCheck: false } };
let teamDB = [{ id: 7, name: 'Иван Повар', accessRole: 'cook' }, { id: 1, name: 'Шеф Богдан', accessRole: 'chef' }];
function myEmployeeId() { return currentEmployeeId; }
function empName(id) { const e = teamDB.find(x => x.id === id); return e ? e.name : '?'; }
function localDateStr(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function markDirty() {}
const _notifs = [];
function notifyApprovers(type, text, refId, excludeId) { teamDB.filter(e => e.accessRole === 'chef' || e.accessRole === 'souschef').forEach(e => { if (e.id !== excludeId) _notifs.push({ empId: e.id, type, text }); }); }
function notifyUser(empId, type, text) { _notifs.push({ empId, type, text }); }
function showNotification() {}
let _confirmCb = null;
function showConfirm(t, m, cb) { _confirmCb = cb; }
function openModal() {}
function closeModal() {}
const _els = {};
function document_getEl(id) { return _els[id] || null; }
global.document = { getElementById: document_getEl };

// ---------- грузим prep.js ----------
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/ChefOS/ChefOS/js/prep.js', 'utf8');
eval(src);

// ---------- тесты ----------
ok(prepEsc('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;', 'prepEsc экранирует XSS');
ok(prepEsc(null) === '', 'prepEsc null -> пусто');
ok(prepFmtDate('2026-10-14') === '14.10.2026', 'prepFmtDate формат');
ok(prepShiftLabel('вечер') === 'Вечер', 'prepShiftLabel');
ok(prepStatusBadge('draft').includes('Черновик'), 'бейдж черновик');
ok(prepStatusBadge('sent').includes('Отправлен'), 'бейдж отправлен');
ok(prepStatusBadge('approved').includes('Принят'), 'бейдж принят');

// права
currentAppRole = 'cook'; ok(prepCanView() === true, 'повар видит заготовки');
currentAppRole = 'cashier'; ok(prepCanView() === false, 'кассир не видит заготовки');
currentAppRole = 'chef'; ok(prepCanView() === true && prepCanApprove() === true, 'шеф видит и утверждает');
currentAppRole = 'souschef'; ok(prepCanApprove() === true, 'су-шеф утверждает');
currentAppRole = 'cook'; ok(prepCanApprove() === false, 'повар не утверждает');

// автор
currentAppRole = 'cook'; currentEmployeeId = 7;
ok(prepAuthorName() === 'Иван Повар', 'имя автора из teamDB');
ok(prepAuthorId() === 7, 'id автора');
currentEmployeeId = null;
ok(prepAuthorName() === 'Повар', 'фолбэк имени по роли');
ok(prepAuthorId() === 'role:cook', 'фолбэк id по роли');
currentEmployeeId = 7;

// машина статусов: черновик -> отправлен -> принят
const rec = { id: 101, date: '2026-10-14', shift: 'утро', authorId: 7, authorName: 'Иван Повар', items: [{ name: 'Бульон', qty: '5', unit: 'л', note: '', done: false }], status: 'draft', comment: '', createdAt: Date.now() };
prepDB.push(rec);
prepSend(101);
ok(_confirmCb !== null, 'отправка просит подтверждение');
_confirmCb();
ok(prepDB[0].status === 'sent', 'статус sent после подтверждения');
ok(_notifs.some(n => n.empId === 1 && n.type === 'prep'), 'шеф получил уведомление об отправке');
ok(_notifs.every(n => n.empId !== 7), 'автор не уведомляет сам себя');

// повар не может утвердить
currentAppRole = 'cook';
prepApprove(101);
ok(prepDB[0].status === 'sent', 'повар не может утвердить чужой список');

// шеф принимает с комментарием
currentAppRole = 'chef';
_els['prep-comment-101'] = { value: 'Ок, только бульона 6 л' };
prepApprove(101);
ok(prepDB[0].status === 'approved', 'шеф принял');
ok(prepDB[0].comment === 'Ок, только бульона 6 л', 'комментарий шефа сохранён');
ok(_notifs.some(n => n.empId === 7 && n.text.includes('принял')), 'повар уведомлён о принятии');

// возврат на доработку
const rec2 = { id: 102, date: '2026-10-14', shift: 'день', authorId: 7, authorName: 'Иван Повар', items: [{ name: 'Соус', qty: '2', unit: 'л', note: '', done: false }], status: 'sent', comment: '', createdAt: Date.now() };
prepDB.push(rec2);
_els['prep-comment-102'] = { value: 'мало, добавь ещё' };
prepReturn(102);
ok(prepDB[1].status === 'draft', 'возвращено в черновик');
ok(_notifs.some(n => n.empId === 7 && n.text.includes('доработку')), 'повар уведомлён о доработке');

// чекбоксы: в черновике тоггл запрещён
currentAppRole = 'cook';
_els['prep-list'] = { innerHTML: '' };
prepToggleItem(102, 0);
ok(prepDB[1].items[0].done === false, 'в черновике done не тогглится');

// удаление: повар удаляет свой черновик
prepDelete(102);
ok(_confirmCb !== null, 'удаление просит подтверждение');
_confirmCb();
ok(prepDB.length === 1 && prepDB[0].id === 101, 'черновик удалён');

// удаление принятого запрещено
prepDelete(101);
_confirmCb = null;
prepDelete(101);
ok(_confirmCb === null && prepDB.length === 1, 'принятый список не удаляется');

// пустой список не отправляется
let _notifMsg = '';
showNotification = (t) => { _notifMsg = t; };
const rec3 = { id: 103, date: '2026-10-14', shift: 'вечер', authorId: 7, authorName: 'Иван Повар', items: [], status: 'draft', comment: '', createdAt: Date.now() };
prepDB.push(rec3);
prepSend(103);
ok(prepDB.find(x => x.id === 103).status === 'draft' && _notifMsg.includes('пуст'), 'пустой список не отправляется');

console.log(`\nprep: PASS ${pass}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
