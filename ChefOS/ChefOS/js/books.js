// --- КНИГИ ---
// Загруженные файлы хранятся в IndexedDB (PDF весят много — в JSON-синк их нельзя).
const BOOKS_IDB_NAME = 'chefos-books';
let _booksDbPromise = null;
function booksIDB() {
    if (_booksDbPromise) return _booksDbPromise;
    _booksDbPromise = new Promise((res, rej) => {
        try {
            const rq = indexedDB.open(BOOKS_IDB_NAME, 1);
            rq.onupgradeneeded = () => { rq.result.createObjectStore('files', { keyPath: 'id' }); };
            rq.onsuccess = () => res(rq.result);
            rq.onerror = () => rej(rq.error);
        } catch (e) { rej(e); }
    });
    return _booksDbPromise;
}
function bookTx(mode, fn) {
    return booksIDB().then(db => new Promise((res, rej) => {
        try {
            const tx = db.transaction('files', mode);
            const st = tx.objectStore('files');
            const out = fn(st);
            tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
            tx.onerror = () => rej(tx.error);
        } catch (e) { rej(e); }
    }));
}
function bookPut(rec) { return bookTx('readwrite', st => st.put(rec)); }
function bookGet(id) { return bookTx('readonly', st => st.get(id)); }
function bookAll() { return bookTx('readonly', st => st.getAll()).then(r => r || []); }
function bookDel(id) { return bookTx('readwrite', st => st.delete(id)); }

function openBooksModal() { openModal('books-modal'); renderUploadedBooks(); }

function bookDateStr(ts) {
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return ''; }
}

function handleBookUpload(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const rec = { id: Date.now(), name: f.name, type: f.type || '', size: f.size, ts: Date.now(), blob: f };
    bookPut(rec).then(() => {
        renderUploadedBooks();
        showNotification(t('notif_book_loaded'));
    }).catch(() => showNotification(t('notif_book_fail')));
}

function renderUploadedBooks() {
    const g = document.getElementById('books-grid');
    if (!g) return;
    g.querySelectorAll('[data-book-id]').forEach(el => el.remove());
    bookAll().then(list => {
        const anchor = g.children[0];
        list.sort((a, b) => b.ts - a.ts).forEach(b => {
            const d = document.createElement('div');
            d.setAttribute('data-book-id', b.id);
            d.className = 'group cursor-pointer relative';
            d.onclick = () => openBookFile(b.id);
            d.innerHTML = `<div class="aspect-[2/3] bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl overflow-hidden mb-3 relative shadow-lg flex items-center justify-center border border-white/10">
                    <i class="fa-solid fa-file-lines text-4xl text-white/50"></i>
                    <button data-rename="${b.id}" class="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 text-white/70 text-sm leading-none flex items-center justify-center active:scale-90"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button data-del="${b.id}" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white/70 text-sm leading-none flex items-center justify-center active:scale-90"><i class="fa-solid fa-xmark text-xs"></i></button>
                </div>
                <h3 class="text-sm font-semibold leading-tight truncate text-white">${escapeHtml(b.name)}</h3>
                <p class="text-xs text-gray-500 mt-1">${bookDateStr(b.ts)}</p>`;
            const delBtn = d.querySelector('[data-del]');
            if (delBtn) delBtn.onclick = (ev) => { ev.stopPropagation(); deleteBookFile(b.id); };
            const rnBtn = d.querySelector('[data-rename]');
            if (rnBtn) rnBtn.onclick = (ev) => { ev.stopPropagation(); renameBookFile(b.id); };
            anchor.insertAdjacentElement('afterend', d);
        });
    }).catch(() => {});
}

let _renameBookId = null;
function renameBookFile(id) {
    bookGet(id).then(rec => {
        if (!rec) return;
        _renameBookId = id;
        document.getElementById('rename-input').value = rec.name || '';
        openModal('rename-modal');
        setTimeout(() => document.getElementById('rename-input').focus(), 350);
    }).catch(() => {});
}
function saveBookRename() {
    const inp = document.getElementById('rename-input');
    const name = (inp.value || '').trim();
    if (!name || !_renameBookId) { closeModal('rename-modal'); return; }
    bookGet(_renameBookId).then(rec => {
        if (!rec) return;
        rec.name = name;
        return bookPut(rec);
    }).then(() => {
        _renameBookId = null;
        closeModal('rename-modal');
        renderUploadedBooks();
    }).catch(() => showNotification(t('notif_book_fail')));
}
function deleteBookFile(id) {
    showConfirm(t('confirm_title'), t('confirm_msg'), () => {
        bookDel(id).then(() => renderUploadedBooks()).catch(() => {});
    });
}

let _bookUrl = null;
let _pdfBookId = null;
function openBookFile(id) {
    _pdfBookId = id;
    bookGet(id).then(rec => {
        if (!rec || !rec.blob) { showNotification(t('notif_book_fail')); return; }
        if (_bookUrl) URL.revokeObjectURL(_bookUrl);
        _bookUrl = URL.createObjectURL(rec.blob);
        const name = String(rec.name || '').toLowerCase();
        if (name.endsWith('.txt')) {
            // TXT — читаем как текст в обычной читалке
            rec.blob.text().then(txt => {
                document.getElementById('reader-title').textContent = rec.name;
                document.getElementById('reader-author').textContent = '';
                document.getElementById('reader-content').innerHTML = `<p class="whitespace-pre-wrap">${escapeHtml(txt).slice(0, 200000)}</p>`;
                openModal('reader-modal');
            });
            return;
        }
        // PDF и остальное — встроенный просмотрщик
        document.getElementById('pdf-title').textContent = rec.name;
        const fr = document.getElementById('pdf-frame');
        fr.src = _bookUrl;
        openModal('pdf-modal');
    }).catch(() => showNotification(t('notif_book_fail')));
}
function openPdfExtern() {
    if (_bookUrl) window.open(_bookUrl, '_blank');
}
function closePdfModal() {
    closeModal('pdf-modal');
    const fr = document.getElementById('pdf-frame');
    if (fr) fr.src = 'about:blank';
}

function openReader(title, author, content_text) {
    document.getElementById('reader-title').textContent = title; document.getElementById('reader-author').textContent = author;
    document.getElementById('reader-content').innerHTML = `<p><span class="text-4xl text-white float-left mr-2 mt-1 line-height-1">Э</span>тот раздел демонстрирует режим чтения. ${content_text}</p><p>Шрифт Lora с засечками, удобный для долгого чтения.</p>`;
    openModal('reader-modal');
}

// --- ПЕРЕВОД КНИГ НА ЯЗЫК СИСТЕМЫ ---
function bookTargetLang() {
    return (typeof currentLanguage !== 'undefined' && currentLanguage === 'en') ? 'en' : 'ru';
}
function translateCurrentPdf() {
    if (!_pdfBookId) return;
    closePdfModal();
    setTimeout(() => translateBook(_pdfBookId), 320);
}
let _trState = null;
async function translateBook(id) {
    const lang = bookTargetLang();
    const rec = await bookGet(id).catch(() => null);
    if (!rec || !rec.blob) { showNotification(t('notif_book_fail')); return; }
    const ck = 'tr_' + lang;
    const cached = rec[ck];
    if (cached && cached.done && cached.pages && cached.pages.length) {
        openTranslatedReader(rec, cached.pages, lang);
        return;
    }
    openTranslateProgress(rec.name);
    _trState = { cancelled: false };
    const abortIfCancelled = () => {
        if (_trState && _trState.cancelled) {
            closeModal('translate-modal');
            _trState = null;
            return true;
        }
        return false;
    };
    try {
        await ensurePdfJs();
        if (abortIfCancelled()) return;
        const buf = await rec.blob.arrayBuffer();
        if (abortIfCancelled()) return;
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if (abortIfCancelled()) return;
        const total = pdf.numPages;
        const pages = (cached && cached.pages) ? cached.pages.slice() : [];
        for (let p = pages.length + 1; p <= total; p++) {
            if (_trState.cancelled) break;
            updateTranslateProgress(p, total);
            const page = await pdf.getPage(p);
            const tc = await page.getTextContent();
            const text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
            pages.push(text ? await translateText(text, lang) : '');
            if (p % 10 === 0 || p === total) {
                rec[ck] = { done: false, pages };
                await bookPut(rec).catch(() => {});
            }
            await new Promise(r => setTimeout(r, 350));
        }
        const doneAll = pages.length === total && !_trState.cancelled;
        rec[ck] = { done: doneAll, pages };
        await bookPut(rec).catch(() => {});
        closeModal('translate-modal');
        _trState = null;
        if (doneAll) openTranslatedReader(rec, pages, lang);
        else if (pages.length) showNotification(t('tr_paused'));
    } catch (e) {
        closeModal('translate-modal');
        _trState = null;
        showNotification(t('notif_book_fail'));
    }
}
function cancelTranslation() { if (_trState) _trState.cancelled = true; }
function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').then(() => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    });
}
function loadScript(src) {
    return new Promise((res, rej) => {
        const el = document.createElement('script');
        el.src = src; el.onload = res; el.onerror = rej;
        document.head.appendChild(el);
    });
}
async function translateText(text, lang) {
    const chunks = splitForTranslate(text, 2800);
    const out = [];
    for (const c of chunks) {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + lang + '&dt=t&q=' + encodeURIComponent(c);
        const r = await fetch(url);
        if (!r.ok) throw new Error('tr ' + r.status);
        const j = await r.json();
        out.push((j[0] || []).map(x => x[0]).join(''));
        await new Promise(r2 => setTimeout(r2, 250));
    }
    return out.join(' ');
}
function splitForTranslate(text, max) {
    const chunks = [];
    const pushHard = (s) => {
        s = s.trim();
        while (s.length > max) {
            let cut = s.lastIndexOf(' ', max);
            if (cut < max * 0.4) cut = max;
            chunks.push(s.slice(0, cut));
            s = s.slice(cut).trim();
        }
        if (s) chunks.push(s);
    };
    let cur = '';
    const sentences = text.replace(/([.!?…])\s+/g, '$1\n').split('\n');
    for (const sn of sentences) {
        if (cur && (cur.length + sn.length + 1) > max) { pushHard(cur); cur = sn; }
        else cur = cur ? cur + ' ' + sn : sn;
    }
    if (cur.trim()) pushHard(cur);
    return chunks.length ? chunks : [text];
}
function openTranslateProgress(name) {
    document.getElementById('tr-title').textContent = name;
    updateTranslateProgress(0, 0);
    openModal('translate-modal');
}
function updateTranslateProgress(p, total) {
    const bar = document.getElementById('tr-bar');
    const lab = document.getElementById('tr-label');
    if (bar) bar.style.width = total ? Math.round(p / total * 100) + '%' : '0%';
    if (lab) lab.textContent = total ? (t('book_page') + ' ' + p + ' / ' + total) : '…';
}
// Читалка перевода — постранично
let _readState = null;
function openTranslatedReader(rec, pages, lang) {
    _readState = { pages, idx: 0, title: rec.name, lang };
    renderTranslatedPage();
    openModal('bookread-modal');
}
function renderTranslatedPage() {
    const st = _readState; if (!st) return;
    document.getElementById('bookread-title').textContent = st.title;
    document.getElementById('bookread-sub').textContent = (st.lang === 'en' ? 'Translation' : 'Перевод') + ' · ' + t('book_page') + ' ' + (st.idx + 1) + ' / ' + st.pages.length;
    document.getElementById('bookread-content').innerHTML = `<p class="whitespace-pre-wrap">${escapeHtml(st.pages[st.idx] || '')}</p>`;
    const pv = document.getElementById('bookread-prev'), nx = document.getElementById('bookread-next');
    if (pv) pv.disabled = st.idx === 0;
    if (nx) nx.disabled = st.idx >= st.pages.length - 1;
    if (pv) pv.classList.toggle('opacity-30', st.idx === 0);
    if (nx) nx.classList.toggle('opacity-30', st.idx >= st.pages.length - 1);
    const m = document.getElementById('bookread-modal'); if (m) m.scrollTop = 0;
}
function bookreadNav(d) {
    const st = _readState; if (!st) return;
    st.idx = Math.min(st.pages.length - 1, Math.max(0, st.idx + d));
    renderTranslatedPage();
}
