// --- ВРЕМЕННАЯ ДИАГНОСТИКА (убрать после починки плиток) ---
// Показывает на экране: последние клики, вызовы openModal/плиток и ошибки JS.
// Блок не перехватывает клики (pointer-events: none).
(function () {
    var box = document.createElement('div');
    box.id = 'chefdiag-box';
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;background:rgba(0,0,0,0.88);color:#fff;font:11px/1.5 monospace;padding:8px 10px;border-radius:8px;max-width:92vw;max-height:42vh;overflow:hidden;pointer-events:none;white-space:pre-wrap;word-break:break-all;border:1px solid rgba(255,255,255,0.25);';
    document.body.appendChild(box);
    var lines = [];
    function log(m) {
        try {
            lines.push(m);
            if (lines.length > 6) lines.shift();
            box.textContent = lines.join('\n');
        } catch (e) {}
    }
    function wrap(name) {
        try {
            var fn = window[name];
            if (typeof fn !== 'function' || fn._diagWrapped) return;
            var orig = fn;
            var w = function () { log(name + '()'); return orig.apply(this, arguments); };
            w._diagWrapped = true;
            window[name] = w;
        } catch (e) {}
    }
    window.addEventListener('error', function (e) { log('ERR: ' + (e.message || e)); });
    window.addEventListener('unhandledrejection', function (e) { log('REJ: ' + ((e.reason && e.reason.message) || e.reason)); });
    document.addEventListener('click', function (e) {
        var t = e.target || {};
        var cn = '';
        try { cn = (t.className && t.className.baseVal === undefined) ? String(t.className).trim().split(/\s+/).join('.') : ''; } catch (_) {}
        log('CLICK ' + (t.tagName || '?') + (t.id ? '#' + t.id : '') + (cn ? '.' + cn : ''));
    }, true);
    ['openModal', 'openTTKModal', 'openMenuModal', 'openBooksModal', 'openSettingsModal'].forEach(wrap);
    document.addEventListener('DOMContentLoaded', function () { wrap('openSettingsModal'); });
    window.addEventListener('load', function () {
        wrap('openSettingsModal');
        var grid = document.getElementById('tiles-grid');
        log('DIAG READY | ttk:' + typeof openTTKModal + ' | settings:' + typeof openSettingsModal + ' | menuDB:' + typeof menuDB + ' len:' + ((typeof menuDB !== 'undefined' && menuDB) ? menuDB.length : '?') + ' | sortable:' + typeof Sortable + ' | gridSortable:' + !!(grid && grid._sortable) + ' | tiles:' + document.querySelectorAll('.ios-tile').length);
    });
})();
