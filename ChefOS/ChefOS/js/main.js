        // --- ИНИЦИАЛИЗАЦИЯ ---
        window.onload = function() {
            // v2.0: ключ хранилища зависит от аккаунта (до loadState!)
            if (typeof accountBootStorage === 'function') accountBootStorage();
            // Восстанавливаем сохранённые данные (если это не первый запуск)
            // и запускаем автосейв — дальше всё само.
            loadState();
            migrateV16();
            migrateV17();
            migrateV18();
            migrateV19();
            if (typeof ensureLocations === 'function') ensureLocations();
            if (typeof renderLocationSelector === 'function') renderLocationSelector();
            refreshCurrencyUI();
            applyTileOrder();
            initTileSorting();
            startAutosave();
            updatePinHint();
            clearPin();
            // v2.0: сначала аккаунт (вход/регистрация или автологин по токену),
            // PIN-экран больше не показываем на старте — владелец входит сразу шефом.
            if (typeof accountBoot === 'function') accountBoot();
            else {
                document.getElementById('pin-screen').classList.remove('hidden');
                setTimeout(() => document.getElementById('pin-screen').classList.remove('opacity-0'), 50);
            }
        };
