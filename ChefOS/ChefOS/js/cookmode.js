        // --- РЕЖИМ ГОТОВКИ (v1.7): пошаговый полноэкранный режим для планшета ---
        let cookState = null;

        function openCookMode(dishId) {
            const d = menuDB.find(i => i.id === dishId); if (!d) return;
            cookState = {
                dish: d,
                steps: (d.steps || []).slice(),
                idx: -1, // -1 = чеклист ингредиентов, 0..n-1 = шаги, n = финал
                checks: (d.ingredients || []).map(() => false)
            };
            renderCookStep();
            document.getElementById('cookmode-overlay').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        function closeCookMode() {
            cookState = null;
            document.getElementById('cookmode-overlay').classList.add('hidden');
            document.body.style.overflow = '';
        }
        function cookNext() { if (cookState && cookState.idx < cookState.steps.length) { cookState.idx++; renderCookStep(); } }
        function cookPrev() { if (cookState && cookState.idx > -1) { cookState.idx--; renderCookStep(); } }
        function cookToggleCheck(i) { if (cookState) { cookState.checks[i] = !cookState.checks[i]; renderCookStep(); } }

        function renderCookStep() {
            const st = cookState, d = st.dish, n = st.steps.length;
            const bar = document.getElementById('cook-progress');
            const pct = st.idx < 0 ? 0 : st.idx >= n ? 100 : Math.round((st.idx + 1) / (n + 1) * 100);
            bar.style.width = pct + '%';
            document.getElementById('cook-counter').textContent = st.idx < 0 ? t('cook_ingredients') : st.idx >= n ? '✓' : `${st.idx + 1} / ${n}`;
            document.getElementById('cook-prev').style.visibility = st.idx < 0 ? 'hidden' : 'visible';
            document.getElementById('cook-next').style.visibility = st.idx >= n ? 'hidden' : 'visible';

            const box = document.getElementById('cook-body');
            if (st.idx < 0) {
                const rows = (d.ingredients || []).map((ing, i) => `
                    <button onclick="cookToggleCheck(${i})" class="w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-colors ${st.checks[i] ? 'border-green-500/50 bg-green-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}">
                        <span class="w-7 h-7 rounded-full flex items-center justify-center border-2 ${st.checks[i] ? 'border-green-500 bg-green-500 text-black' : 'border-gray-600 text-transparent'}"><i class="fa-solid fa-check text-sm"></i></span>
                        <span class="flex-1"><span class="text-white font-medium">${ing.name}</span><span class="text-gray-400 ml-2">${ing.weight || ''}</span></span>
                    </button>`).join('');
                box.innerHTML = `
                    <h3 class="text-xl font-bold text-white mb-1">${d.name}</h3>
                    <p class="text-sm text-gray-500 mb-6">${t('cook_checklist_tip')}</p>
                    <div class="space-y-3 max-w-xl mx-auto text-left">${rows || `<p class="text-gray-500 text-center">${t('cook_no_ingr')}</p>`}</div>`;
            } else if (st.idx >= n) {
                box.innerHTML = `
                    <div class="text-center py-10">
                        <div class="w-20 h-20 mx-auto rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-4xl mb-6"><i class="fa-solid fa-check"></i></div>
                        <h3 class="text-3xl font-bold text-white mb-2">${t('cook_done')}</h3>
                        <p class="text-gray-400">${d.name} · ${t('cook_done_sub')}</p>
                    </div>`;
            } else {
                box.innerHTML = `
                    <div class="max-w-2xl mx-auto text-center">
                        <p class="text-sm font-semibold text-orange-400 uppercase tracking-widest mb-6">${t('cook_step')} ${st.idx + 1}</p>
                        <p class="text-2xl sm:text-3xl text-white leading-relaxed font-medium">${st.steps[st.idx]}</p>
                    </div>`;
            }
        }
