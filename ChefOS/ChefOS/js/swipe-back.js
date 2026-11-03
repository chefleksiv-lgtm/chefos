// --- SWIPE-BACK (v2.1.3): возврат свайпом вправо на телефонах и планшетах ---
// Жест: палец стартует у левого края экрана (<= 48px) и едет вправо (>= 80px,
// почти без вертикали) — как системный жест «назад» на телефоне.
// Закрывает верхний открытый слой: confirm-диалог (как отмена), режим готовки
// (шаг назад, на первом экране — выход) или верхнюю модалку. На десктопе
// жест не работает вообще. Слушатели пассивные — скролл не перехватываем,
// решение принимается только на touchend.
(function () {
    var EDGE = 48, MIN_DX = 80, MAX_DY = 120;
    var startX = 0, startY = 0, tracking = false;

    // Телефоны и планшеты: грубый указатель (тач) — либо тач + компактный экран.
    // Десктоп с мышью/трекпадом сюда не попадает.
    function swipeBackEnabled() {
        try {
            if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return true;
        } catch (e) {}
        try {
            return ('ontouchstart' in window) && Math.min(window.innerWidth, window.innerHeight) <= 1024;
        } catch (e) { return false; }
    }
    function isEditable(el) {
        if (!el || !el.closest) return false;
        try { return !!el.closest('input, textarea, select, [contenteditable="true"]'); } catch (e) { return false; }
    }
    // Палец внутри горизонтально прокручиваемого контента (широкая таблица) —
    // не перехватываем, пусть скроллится.
    function insideHScroll(el, topEl) {
        var n = el;
        while (n && n !== topEl) {
            if (n.scrollWidth && n.scrollWidth > n.clientWidth + 4) return true;
            n = n.parentElement;
        }
        return false;
    }
    function isVisible(el) {
        if (!el || el.classList.contains('hidden')) return false;
        var n = el.parentElement;
        while (n && n !== document.body) {
            if (n.classList && n.classList.contains('hidden')) return false;
            n = n.parentElement;
        }
        try {
            var cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            // opacity-0 = модалка в фазе закрытия (hidden добавится через 300 мс) —
            // её уже не считаем открытой, иначе повторный свайп закроет её же.
            if (parseFloat(cs.opacity) === 0) return false;
        } catch (e) {}
        return true;
    }
    function zOf(el) {
        try { var z = parseInt(window.getComputedStyle(el).zIndex, 10); return isNaN(z) ? 0 : z; } catch (e) { return 0; }
    }
    // Верхний открытый слой: максимальный z-index, при равенстве — позже в DOM.
    // account-screen и pin-screen сюда не попадают (не *-modal) — вход и PIN
    // свайпом не закрыть.
    function topLayer() {
        var candidates = [];
        var modals = document.querySelectorAll('[id$="-modal"]');
        for (var i = 0; i < modals.length; i++) {
            if (isVisible(modals[i])) candidates.push({ el: modals[i], z: zOf(modals[i]), order: i });
        }
        var cook = document.getElementById('cookmode-overlay');
        if (cook && isVisible(cook)) candidates.push({ el: cook, z: zOf(cook), order: 100000 });
        if (!candidates.length) return null;
        candidates.sort(function (a, b) { return (b.z - a.z) || (b.order - a.order); });
        return candidates[0].el;
    }
    function goBack() {
        var top = topLayer();
        if (!top) return;
        var id = top.id;
        try {
            if (id === 'confirm-modal') {
                if (typeof closeConfirmModal === 'function') { closeConfirmModal(); return; }
            } else if (id === 'cookmode-overlay') {
                // В готовке «назад» = предыдущий шаг, на первом экране — выход.
                if (typeof cookState !== 'undefined' && cookState && cookState.idx > -1 && typeof cookPrev === 'function') { cookPrev(); return; }
                if (typeof closeCookMode === 'function') { closeCookMode(); return; }
            } else if (typeof closeModal === 'function') { closeModal(id); return; }
            top.classList.add('hidden');
        } catch (e) {}
    }
    function onStart(e) {
        tracking = false;
        if (!swipeBackEnabled()) return;
        if (!e.touches || e.touches.length !== 1) return;
        var t = e.touches[0];
        if (t.clientX > EDGE) return;
        var tgt = e.target;
        if (isEditable(tgt)) return;
        var top = topLayer();
        if (!top) return;
        if (tgt && tgt.nodeType === 1 && insideHScroll(tgt, top)) return;
        startX = t.clientX; startY = t.clientY; tracking = true;
    }
    function onEnd(e) {
        if (!tracking) return;
        tracking = false;
        var t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!t) return;
        var dx = t.clientX - startX, dy = t.clientY - startY;
        if (dx >= MIN_DX && Math.abs(dy) <= MAX_DY && dx > Math.abs(dy)) goBack();
    }
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', function () { tracking = false; }, { passive: true });
})();
