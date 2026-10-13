        // --- ФИЧА A (v1.8): ФОТО СЧЁТА → ЦЕНЫ ---
        // OCR накладных через Tesseract.js (CDN), парсинг строк, fuzzy-сопоставление
        // со складом, ревью-таблица и проведение через механизм истории цен v1.6.
        //
        // ВАЖНО: Tesseract.js грузится с CDN (jsdelivr) вместе с языковыми данными
        // rus+eng — для первого запуска нужен интернет. Local-first относится к
        // данным приложения (localStorage), а не к загрузке самой библиотеки.
        // Проверено 2026-09-26: tesseract.js@7 (latest), worker.min.js и
        // @tesseract.js-data/{rus,eng} traineddata отвечают 200 с jsdelivr.

        const OCR_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
        const OCR_WORKER_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/worker.min.js';
        const OCR_LANGS = 'rus+eng';

        // Текущий набор строк на ревью (модульное состояние, не персистится).
        let ocrReviewLines = [];
        let _ocrLibPromise = null;

        // --- i18n (формат словаря: i18n = { key: { ru, en } }) ---
        if (typeof i18n !== 'undefined') Object.assign(i18n, {
            'ocr_offline': { ru: 'Нет интернета — Tesseract.js грузится с CDN', en: 'No internet — Tesseract.js loads from CDN' },
            'ocr_failed': { ru: 'Не удалось распознать документ', en: 'Recognition failed' },
            'ocr_no_lines': { ru: 'В документе не найдено строк с ценами', en: 'No price lines found in the document' },
            'ocr_review_title': { ru: 'Проверьте распознанное', en: 'Review recognized lines' },
            'ocr_eye_warning': { ru: 'Проверьте распознавание глазами — OCR может ошибаться', en: 'Verify with your own eyes — OCR can make mistakes' },
            'ocr_supplier': { ru: 'Поставщик', en: 'Supplier' },
            'ocr_match': { ru: 'Совпадение со складом', en: 'Inventory match' },
            'ocr_opt_new': { ru: '+ Новый ингредиент', en: '+ New ingredient' },
            'ocr_opt_skip': { ru: '— Пропустить —', en: '— Skip —' },
            'ocr_zero_price': { ru: 'Строка без цены пропущена', en: 'Line without price skipped' },
            'ocr_qty': { ru: 'Кол-во', en: 'Qty' },
            'ocr_price': { ru: 'Цена', en: 'Price' }
        });

        // ================= ЧИСТЫЕ ФУНКЦИИ (DOM-free, покрыты node-тестами) =================

        // '1 000,50' / '2.5' / '1,000.50' -> число. null если не число.
        function ocrCleanNumber(s) {
            let t = String(s || '').replace(/[$€£₽¥\s]/g, '');
            if (!t) return null;
            if (t.includes(',') && t.includes('.')) {
                // оба разделителя: последний — десятичный
                if (t.lastIndexOf('.') > t.lastIndexOf(',')) t = t.replace(/,/g, '');
                else t = t.replace(/\./g, '').replace(',', '.');
            } else if (t.includes(',')) {
                t = t.replace(',', '.');
            }
            if (!/^\d+(\.\d+)?$/.test(t)) return null;
            const v = parseFloat(t);
            return isNaN(v) ? null : v;
        }

        // Словарь единиц счёта из накладных -> коды ChefOS
        const OCR_UNIT_WORDS = {
            'кг': 'kg', 'кило': 'kg', 'kg': 'kg', 'kilo': 'kg',
            'г': 'g', 'гр': 'g', 'грамм': 'g', 'g': 'g', 'gram': 'g', 'grams': 'g',
            'л': 'l', 'литр': 'l', 'литра': 'l', 'l': 'l', 'ltr': 'l', 'liter': 'l',
            'мл': 'ml', 'ml': 'ml',
            'шт': 'pcs', 'штука': 'pcs', 'штуки': 'pcs', 'pc': 'pcs', 'pcs': 'pcs',
            'piece': 'pcs', 'pieces': 'pcs', 'уп': 'pcs', 'упак': 'pcs', 'упаковка': 'pcs',
            'бут': 'pcs', 'бутылка': 'pcs', 'бан': 'pcs', 'банка': 'pcs', 'btl': 'pcs'
        };
        function ocrNormalizeUnit(s) {
            const key = String(s || '').trim().toLowerCase().replace(/[.,:;]+$/, '');
            return OCR_UNIT_WORDS[key] || (key ? key : 'pcs');
        }

        // 'Филе ОхлаждЁнное!' -> 'филе охлажденное'
        function ocrNormalizeName(s) {
            return String(s || '').toLowerCase()
                .replace(/ё/g, 'е')
                .replace(/[^a-zа-я0-9\s]/g, ' ')
                .replace(/\s+/g, ' ').trim();
        }

        function ocrLevenshtein(a, b) {
            a = String(a); b = String(b);
            if (a === b) return 0;
            if (!a.length) return b.length;
            if (!b.length) return a.length;
            let prev = new Array(b.length + 1);
            for (let j = 0; j <= b.length; j++) prev[j] = j;
            for (let i = 1; i <= a.length; i++) {
                const cur = [i];
                for (let j = 1; j <= b.length; j++) {
                    cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                }
                prev = cur;
            }
            return prev[b.length];
        }

        // Топ-N кандидатов из склада. Возвращает [{id, name, score 0..1}], по убыванию.
        function ocrFindMatches(lineName, db, topN) {
            topN = topN || 3;
            const q = ocrNormalizeName(lineName);
            if (!q) return [];
            const qTokens = q.split(' ').filter(x => x.length > 1);
            const scored = [];
            for (const ing of (db || [])) {
                const n = ocrNormalizeName(ing.name || '');
                if (!n) continue;
                let score = 0, inter = 0;
                if (n === q) {
                    score = 1;
                } else if (n.includes(q) || q.includes(n)) {
                    score = 0.92;
                } else {
                    const nTokens = n.split(' ').filter(x => x.length > 1);
                    inter = qTokens.filter(t => nTokens.includes(t)).length;
                    const union = new Set(qTokens.concat(nTokens)).size;
                    const jacc = union ? inter / union : 0;
                    const levSim = 1 - ocrLevenshtein(q, n) / Math.max(q.length, n.length, 1);
                    if (qTokens.length === 1 && nTokens.length === 1) {
                        // короткие названия из одного слова: типичная OCR-ошибка —
                        // замена одной буквы (э/е, о/а). Чистый levenshtein, порог выше.
                        score = levSim;
                        if (levSim >= 0.6) inter = 1; // помечаем как валидное совпадение
                    } else {
                        score = 0.65 * jacc + 0.35 * levSim;
                    }
                }
                if (score >= 0.3 && (inter > 0 || n === q || n.includes(q) || q.includes(n))) {
                    scored.push({ id: ing.id, name: ing.name, score: Math.round(score * 100) / 100 });
                }
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topN);
        }

        // Строки-шапки/итоги накладной — не товарные позиции
        function ocrIsHeaderLine(line) {
            const l = line.toLowerCase().trim();
            if (/^[=\-*_\s.]+$/.test(l)) return true;
            return /^\s*(итого|всего|сумма|наименование|товар|название|№|no\.?|п\/п|vat|ндс|subtotal|total|дата|date|поставщик|supplier|покупатель|buyer|накладная|invoice|сч[её]т[-\s]?фактура|расходная)/.test(l);
        }

        // '1','000,00' -> '1000,00' (разделитель тысяч от OCR)
        function ocrMergeThousands(tokens) {
            const out = [];
            for (let i = 0; i < tokens.length; i++) {
                const cur = tokens[i], nxt = tokens[i + 1];
                if (nxt && /^\d{1,3}$/.test(cur) && /^\d{3}([.,]\d+)?$/.test(nxt)) { out.push(cur + nxt); i++; }
                else out.push(cur);
            }
            return out;
        }

        // '10кг' -> ['10','кг']
        function ocrSplitAttached(tokens) {
            const out = [];
            for (const tok of tokens) {
                const m = String(tok).match(/^(\d[\d.,]*)((?:[a-zа-я]+|[₽$€£¥]))$/i);
                if (m) out.push(m[1], m[2]);
                else out.push(tok);
            }
            return out;
        }

        // Одна строка OCR -> {raw, name, qty, unit, price} или null
        function ocrParseLine(raw) {
            const line = String(raw || '').trim();
            if (!line || line.length < 3 || ocrIsHeaderLine(line)) return null;
            let tokens = ocrSplitAttached(line.split(/\s+/));
            // порядковый номер строки ('1 Лосось ...') — выкидываем
            if (tokens.length > 1 && /^\d{1,3}$/.test(tokens[0])) tokens.shift();
            tokens = ocrMergeThousands(tokens);

            const numVal = tok => {
                const stripped = String(tok).replace(/^[$€£₽¥\s]+|[$€£₽¥\s.,:;]+$/g, '');
                return /^\d[\d.,]*$/.test(stripped) ? ocrCleanNumber(stripped) : null;
            };
            const nums = [];
            const unitAt = {};
            tokens.forEach((tok, i) => {
                const key = String(tok).toLowerCase().replace(/[.,:;]+$/, '');
                if (OCR_UNIT_WORDS[key]) unitAt[i] = OCR_UNIT_WORDS[key];
                const v = numVal(tok);
                if (v !== null) nums.push({ i, v });
            });
            if (!nums.length) return null;

            // единица измерения
            let unitIdx = -1, unit = null;
            for (const k in unitAt) { unitIdx = parseInt(k, 10); unit = unitAt[k]; break; }

            let qty = 1, qtyIdx = -1;
            if (unitIdx >= 0) {
                // ближайшее число слева от единицы — кол-во
                let best = null;
                for (const n of nums) {
                    if (n.i < unitIdx && (best === null || unitIdx - n.i < unitIdx - best.i)) best = n;
                }
                if (!best) for (const n of nums) { if (best === null || n.i < best.i) best = n; }
                if (best) { qty = best.v; qtyIdx = best.i; }
            }

            // цена: числа правее кол-ва. Если два последних — цена и сумма (сумма ≈ кол-во × цена),
            // берём цену; иначе последнее число. Одно число -> цена за единицу (эвристика).
            const after = nums.filter(n => n.i > qtyIdx).map(n => n.v);
            let price;
            if (after.length >= 2) {
                const p = after[after.length - 2], total = after[after.length - 1];
                price = (total > 0 && Math.abs(qty * p - total) / total < 0.06) ? p : total;
            } else if (after.length === 1) {
                price = after[0];
            } else {
                price = nums[nums.length - 1].v;
            }

            // название — токены до кол-ва (или до единицы / до первого числа)
            let nameEnd = qtyIdx >= 0 ? qtyIdx : (unitIdx >= 0 ? unitIdx : nums[0].i);
            let name = tokens.slice(0, nameEnd).join(' ').replace(/[.,:;\-—–•]+$/, '').trim();
            if (!name || name.length < 2 || price <= 0) return null;
            if (!unit) unit = 'pcs';
            return { raw: line, name, qty, unit, price: Math.round(price * 100) / 100 };
        }

        // Весь текст OCR -> массив строк-позиций
        function parseInvoiceText(text) {
            const lines = [];
            for (const raw of String(text || '').split('\n')) {
                const p = ocrParseLine(raw);
                if (p) lines.push(p);
            }
            return lines;
        }

        // Эвристика поставщика из шапки документа
        function ocrGuessSupplier(text) {
            const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8);
            for (const l of lines) {
                const m = l.match(/(?:поставщик|supplier)\s*[:\-–]\s*(.+)/i);
                if (m) return m[1].trim();
            }
            for (const l of lines) {
                if (/^(ооо|зао|ип|пао|inc\.|ltd\.?|gmbh)/i.test(l)) return l;
                const q = l.match(/«([^»]{3,})»/);
                if (q && !/накладная|сч[её]т/i.test(l)) return q[1].trim();
            }
            return '';
        }

        // Применение цены+кол-ва к ингредиенту через механизм истории цен v1.6.
        // Возвращает riseInfo для алерта >5% (или null).
        function applyInvoiceLinePrice(ing, newPrice, supplier, qtyToAdd, lineUnit) {
            let riseInfo = null;
            const oldPrice = ing.price;
            if (newPrice !== oldPrice) {
                if (!Array.isArray(ing.priceHistory)) ing.priceHistory = [];
                ing.priceHistory.push({ date: new Date().toISOString().slice(0, 10), price: newPrice, supplier: supplier || ing.supplier });
                ing.previousPrice = oldPrice;
                ing.price = newPrice;
                if (oldPrice > 0 && newPrice > oldPrice * (1 + PRICE_RISE_ALERT_PCT / 100)) {
                    riseInfo = { id: ing.id, name: ing.name, oldPrice, newPrice };
                }
            }
            if (qtyToAdd > 0) {
                let q = qtyToAdd;
                if (typeof convertQty === 'function') {
                    const c = convertQty(qtyToAdd, lineUnit || ing.unit, ing.unit);
                    if (c !== null && c >= 0) q = c;
                }
                ing.quantity = Math.round((ing.quantity + q) * 100) / 100;
            }
            markDirty();
            return riseInfo;
        }

        // ================= UI-ФЛОУ (браузер) =================

        function loadTesseractLib() {
            if (typeof window !== 'undefined' && window.Tesseract) return Promise.resolve();
            if (_ocrLibPromise) return _ocrLibPromise;
            _ocrLibPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = OCR_CDN_URL; s.async = true;
                s.onload = () => resolve();
                s.onerror = () => { _ocrLibPromise = null; reject(new Error('tesseract cdn failed')); };
                document.head.appendChild(s);
            });
            return _ocrLibPromise;
        }

        function ocrEsc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // Переопределяет мок из inventory.js: теперь — выбор фото -> OCR -> ревью.
        function simulateInvoiceScan() {
            if (typeof currentAppRole !== 'undefined' && currentAppRole !== 'chef') {
                showNotification(t('chef_only'));
                return;
            }
            const inp = document.getElementById('ocr-file-input');
            if (inp) inp.click();
        }

        async function startOcrFlow(file) {
            const loadingEl = document.getElementById('scanner-loading');
            const resultEl = document.getElementById('scanner-result');
            loadingEl.classList.remove('hidden');
            resultEl.classList.add('hidden');
            openModal('invoice-scanner-modal');
            const statusP = loadingEl.querySelector('p');

            try { await loadTesseractLib(); }
            catch (e) { closeScannerModal(); showNotification(t('ocr_offline')); return; }

            let worker = null;
            try {
                worker = await Tesseract.createWorker(OCR_LANGS, 1, {
                    workerPath: OCR_WORKER_URL,
                    logger: m => {
                        if (statusP) statusP.textContent = m.status + (m.progress != null ? ' ' + Math.round(m.progress * 100) + '%' : '');
                    }
                });
                const ret = await worker.recognize(file);
                const lines = parseInvoiceText(ret && ret.data ? ret.data.text : '');
                if (!lines.length) { closeScannerModal(); showNotification(t('ocr_no_lines')); return; }
                ocrReviewLines = lines;
                renderOcrReview(lines, ocrGuessSupplier(ret.data.text));
                loadingEl.classList.add('hidden');
                resultEl.classList.remove('hidden');
            } catch (e) {
                console.error('[ChefOS] OCR failed:', e);
                closeScannerModal();
                showNotification(t('ocr_failed'));
            } finally {
                if (worker) { try { await worker.terminate(); } catch (e) { /* noop */ } }
            }
        }

        function renderOcrReview(lines, guessedSupplier) {
            const box = document.getElementById('scanner-result');
            const unitOpts = sel => ['kg', 'g', 'l', 'ml', 'pcs']
                .map(u => `<option value="${u}"${u === sel ? ' selected' : ''}>${t('unit_' + u)}</option>`).join('');
            const rows = lines.map((L, i) => {
                const matches = ocrFindMatches(L.name, typeof inventoryDB !== 'undefined' ? inventoryDB : []);
                const best = matches[0];
                const pre = !best || best.score < 0.3 ? 'skip' : (best.score < 0.55 ? 'new' : best.id);
                const matchOpts = matches
                    .map(m => `<option value="${m.id}"${String(pre) === String(m.id) ? ' selected' : ''}>${ocrEsc(m.name)} — ${Math.round(m.score * 100)}%</option>`)
                    .join('')
                    + `<option value="new"${pre === 'new' ? ' selected' : ''}>${t('ocr_opt_new')}</option>`
                    + `<option value="skip"${pre === 'skip' ? ' selected' : ''}>${t('ocr_opt_skip')}</option>`;
                return `<div class="bg-black/40 border border-white/10 rounded-xl p-3" data-ocr-row="${i}">
                    <p class="text-[11px] text-gray-500 mb-2 font-mono break-words leading-snug">OCR: ${ocrEsc(L.raw)}</p>
                    <input data-ocr-name value="${ocrEsc(L.name)}" class="w-full h-10 bg-[#2C2C2E] border border-white/10 rounded-lg px-3 text-white text-sm outline-none focus:border-purple-500 mb-2" placeholder="${t('ing_name')}">
                    <label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">${t('ocr_match')}</label>
                    <select data-ocr-match class="w-full h-10 bg-[#2C2C2E] border border-white/10 rounded-lg px-3 text-white text-sm outline-none focus:border-purple-500 mb-2">${matchOpts}</select>
                    <div class="grid grid-cols-3 gap-2">
                        <div><label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">${t('ocr_qty')}</label>
                        <input data-ocr-qty type="number" step="0.01" min="0" value="${L.qty}" class="w-full h-10 bg-[#2C2C2E] border border-white/10 rounded-lg px-3 text-white text-sm outline-none focus:border-purple-500"></div>
                        <div><label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">&nbsp;</label>
                        <select data-ocr-unit class="w-full h-10 bg-[#2C2C2E] border border-white/10 rounded-lg px-2 text-white text-sm outline-none focus:border-purple-500">${unitOpts(L.unit)}</select></div>
                        <div><label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">${t('ocr_price')}, ${typeof currentCurrency !== 'undefined' ? currentCurrency : ''}</label>
                        <input data-ocr-price type="number" step="0.01" min="0" value="${L.price}" class="w-full h-10 bg-[#2C2C2E] border border-white/10 rounded-lg px-3 text-white text-sm outline-none focus:border-purple-500"></div>
                    </div>
                </div>`;
            }).join('');
            box.innerHTML = `
                <h3 class="text-2xl font-bold text-white mb-2">${t('ocr_review_title')} (${lines.length})</h3>
                <p class="text-amber-400/90 text-xs mb-4 flex items-start gap-2"><i class="fa-solid fa-triangle-exclamation mt-0.5"></i><span>${t('ocr_eye_warning')}</span></p>
                <div class="mb-4"><label class="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">${t('ocr_supplier')}</label>
                <input id="ocr-supplier" value="${ocrEsc(guessedSupplier || '')}" class="w-full h-10 bg-[#2C2C2E] border border-white/10 rounded-lg px-3 text-white text-sm outline-none focus:border-purple-500"></div>
                <div class="space-y-3 mb-6 max-h-[46vh] overflow-y-auto pr-1">${rows}</div>
                <div class="flex gap-4">
                    <button onclick="closeScannerModal()" class="flex-1 h-11 bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white font-medium rounded-xl transition-colors">${t('cancel')}</button>
                    <button onclick="applyScannedInvoice()" class="flex-1 h-11 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-purple-500/20">${t('scan_apply')}</button>
                </div>`;
        }

        // Переопределяет мок из inventory.js: проводит подтверждённые строки.
        function applyScannedInvoice() {
            const rows = Array.prototype.slice.call(document.querySelectorAll('[data-ocr-row]'));
            const supplierEl = document.getElementById('ocr-supplier');
            const supplier = supplierEl ? supplierEl.value.trim() : '';
            const riseInfos = [];
            const invLines = [];
            rows.forEach((row, idx) => {
                const nameEl = row.querySelector('[data-ocr-name]');
                const matchEl = row.querySelector('[data-ocr-match]');
                const qtyEl = row.querySelector('[data-ocr-qty]');
                const unitEl = row.querySelector('[data-ocr-unit]');
                const priceEl = row.querySelector('[data-ocr-price]');
                const name = nameEl ? nameEl.value.trim() : '';
                const matchVal = matchEl ? matchEl.value : 'skip';
                const qty = qtyEl ? (parseFloat(qtyEl.value) || 0) : 0;
                const unit = unitEl ? unitEl.value : 'pcs';
                const price = priceEl ? (parseFloat(priceEl.value) || 0) : 0;
                const raw = ocrReviewLines[idx] ? ocrReviewLines[idx].raw : '';
                if (matchVal === 'skip' || !name) {
                    invLines.push({ raw, name, qty, unit, price, matchId: null, status: 'skip' });
                    return;
                }
                if (price <= 0) {
                    showNotification(t('ocr_zero_price'));
                    invLines.push({ raw, name, qty, unit, price, matchId: null, status: 'skip' });
                    return;
                }
                if (matchVal === 'new') {
                    const rec = {
                        id: Date.now() + idx, name, category: 'Другое',
                        quantity: Math.round(qty * 100) / 100, unit,
                        price, previousPrice: price, supplier: supplier || '',
                        yieldPct: 100, minQty: 0, allergens: [], priceHistory: []
                    };
                    inventoryDB.push(rec);
                    invLines.push({ raw, name, qty, unit, price, matchId: rec.id, status: 'new' });
                } else {
                    const ing = inventoryDB.find(i => String(i.id) === String(matchVal));
                    if (!ing) {
                        invLines.push({ raw, name, qty, unit, price, matchId: null, status: 'skip' });
                        return;
                    }
                    const rise = applyInvoiceLinePrice(ing, price, supplier, qty, unit);
                    if (rise) riseInfos.push(rise);
                    invLines.push({ raw, name: ing.name, qty, unit, price, matchId: ing.id, status: 'matched' });
                }
            });
            if (typeof invoicesDB !== 'undefined') {
                invoicesDB.push({
                    id: Date.now(), date: new Date().toISOString().slice(0, 10), supplier,
                    lines: invLines, applied: true
                });
            }
            markDirty();
            closeScannerModal();
            showNotification(t('notif_invoice_scanned'));
            if (typeof switchInvTab === 'function') switchInvTab('ingredients');
            if (riseInfos.length && typeof showPriceRiseAlert === 'function') {
                setTimeout(() => showPriceRiseAlert(riseInfos[0]), 400);
            }
        }

        // closeScannerModal() остаётся из inventory.js — только закрывает модалку.

        function initOcrModule() {
            if (document.getElementById('ocr-file-input')) return;
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.id = 'ocr-file-input';
            inp.accept = 'image/*';
            inp.style.display = 'none';
            inp.addEventListener('change', () => {
                if (inp.files && inp.files[0]) startOcrFlow(inp.files[0]);
                inp.value = '';
            });
            document.body.appendChild(inp);
        }
        if (typeof document !== 'undefined' && document.getElementById) initOcrModule();
