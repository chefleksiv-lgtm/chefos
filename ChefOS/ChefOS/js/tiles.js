// --- ПЛИТКИ: порядок перетаскиванием ---
// tileOrder объявлен в data.js, сохраняется через storage.js (markDirty).
// На тачскрине — долгое нажатие (250мс) затем тянуть, на десктопе — тянуть сразу.

function applyTileOrder() {
    const grid = document.getElementById('tiles-grid');
    if (!grid || !Array.isArray(tileOrder)) return;
    // Сначала расставляем плитки в сохранённом порядке,
    // всё неизвестное (новые плитки из будущих версий) — в конец.
    const byId = {};
    [...grid.children].forEach(el => { if (el.id) byId[el.id] = el; });
    tileOrder.forEach(id => { if (byId[id]) grid.appendChild(byId[id]); });
}

function saveTileOrder() {
    const grid = document.getElementById('tiles-grid');
    if (!grid) return;
    tileOrder = [...grid.children].map(el => el.id).filter(Boolean);
    markDirty();
}

function initTileSorting() {
    const grid = document.getElementById('tiles-grid');
    if (!grid || typeof Sortable === 'undefined') return;
    if (grid._sortable) return; // уже инициализировано
    grid._sortable = new Sortable(grid, {
        animation: 280,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        delay: 250,             // долгое нажатие перед перетаскиванием...
        delayOnTouchOnly: true, // ...только на тачскрине; мышью тянем сразу
        forceFallback: true,    // свой плавный движок вместо нативного DnD
        fallbackOnBody: true,
        fallbackTolerance: 4,
        ghostClass: 'tile-drop-hint',   // пустой слот в сетке
        chosenClass: 'tile-chosen',
        dragClass: 'tile-drag-float',   // летящая плитка под пальцем
        onEnd: saveTileOrder,
    });
}
