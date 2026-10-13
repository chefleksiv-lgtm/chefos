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
                    <button data-del="${b.id}" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white/70 text-sm leading-none flex items-center justify-center active:scale-90"><i class="fa-solid fa-xmark text-xs"></i></button>
                </div>
                <h3 class="text-sm font-semibold leading-tight truncate text-white">${escapeHtml(b.name)}</h3>
                <p class="text-xs text-gray-500 mt-1">${bookDateStr(b.ts)}</p>`;
            const delBtn = d.querySelector('[data-del]');
            if (delBtn) delBtn.onclick = (ev) => { ev.stopPropagation(); deleteBookFile(b.id); };
            anchor.insertAdjacentElement('afterend', d);
        });
    }).catch(() => {});
}

function deleteBookFile(id) {
    showConfirm(t('confirm_title'), t('confirm_msg'), () => {
        bookDel(id).then(() => renderUploadedBooks()).catch(() => {});
    });
}

let _bookUrl = null;
function openBookFile(id) {
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
