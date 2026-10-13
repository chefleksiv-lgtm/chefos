        // --- КНИГИ ---
        function openBooksModal() { openModal('books-modal'); }
        function handleBookUpload(e) {
            const f = e.target.files[0]; if(!f) return; const g = document.getElementById('books-grid');
            const h = `<div class="group cursor-pointer"><div class="aspect-[2/3] bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl overflow-hidden mb-3 relative shadow-lg flex items-center justify-center border border-white/10"><i class="fa-solid fa-file-lines text-4xl text-white/50"></i></div><h3 class="text-sm font-semibold leading-tight truncate">${f.name}</h3><p class="text-xs text-green-400 mt-1">Только что</p></div>`;
            g.children[0].insertAdjacentHTML('afterend', h); showNotification(t('notif_book_loaded')); e.target.value = ''; 
        }
        function openReader(title, author, content_text) {
            document.getElementById('reader-title').textContent = title; document.getElementById('reader-author').textContent = author;
            document.getElementById('reader-content').innerHTML = `<p><span class="text-4xl text-white float-left mr-2 mt-1 line-height-1">Э</span>тот раздел демонстрирует режим чтения. ${content_text}</p><p>Шрифт Lora с засечками, удобный для долгого чтения.</p>`;
            openModal('reader-modal');
        }

