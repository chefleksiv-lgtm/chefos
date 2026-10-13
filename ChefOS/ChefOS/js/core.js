        // --- БАЗОВЫЕ ФУНКЦИИ ---
        // Единое форматирование денег: символ берётся из настроек (currentCurrency).
        // Суммы в БД — безразмерные числа, валюта влияет только на отображение.
        function fmtMoney(n, digits) {
            const v = Number(n);
            const d = (digits === undefined) ? 0 : digits;
            const safe = isNaN(v) ? 0 : v;
            return currentCurrency + safe.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d });
        }
        function openModal(id) {
            const el = document.getElementById(id); const content = el.children[0]; el.classList.remove('hidden');
            setTimeout(() => { el.classList.remove('opacity-0'); if(content && content.classList.contains('scale-95')){ content.classList.remove('scale-95'); content.classList.add('scale-100'); } }, 10);
        }
        function closeModal(id) {
            const el = document.getElementById(id); const content = el.children[0]; el.classList.add('opacity-0');
            if(content && content.classList.contains('scale-100')){ content.classList.remove('scale-100'); content.classList.add('scale-95'); }
            setTimeout(() => el.classList.add('hidden'), 300);
        }
        function showNotification(text) {
            const n = document.createElement('div'); n.className = 'fixed top-10 left-1/2 transform -translate-x-1/2 bg-zinc-800 text-white px-6 py-3 rounded-2xl shadow-lg z-[200] transition-opacity duration-300 border border-white/10'; n.textContent = text;
            document.body.appendChild(n); setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 2500);
        }

        let confirmActionCallback = null;
        function showConfirm(title, message, callback) {
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            confirmActionCallback = callback;
            openModal('confirm-modal');
        }
        function closeConfirmModal() { closeModal('confirm-modal'); confirmActionCallback = null; }
        document.getElementById('confirm-action-btn').addEventListener('click', () => {
            if (confirmActionCallback) confirmActionCallback();
            closeConfirmModal();
        });

