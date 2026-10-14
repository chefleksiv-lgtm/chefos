        // --- ЭТИКЕТКИ (v1.7): печать маркировки для заготовок и блюд ---
        let labelCtx = null; // {kind: 'ingredient'|'ttk', id}

        function openLabelModal(kind, id) {
            labelCtx = { kind, id };
            const today = new Date().toISOString().slice(0, 10);
            const exp = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
            document.getElementById('label-made').value = today;
            document.getElementById('label-exp').value = exp;
            openModal('label-modal');
        }

        // Панель Nutrition Facts в стиле США (v2.6) — на порцию
        function nutritionFactsHtml(d) {
            const portions = Math.max(1, parseInt(d.portions) || 1);
            const per = v => Math.round(((parseFloat(v) || 0) / portions) * 10) / 10;
            const cal = per(d.calories), fat = per(d.fat), carb = per(d.carbs), prot = per(d.protein);
            const servG = d.yield ? Math.round(d.yield / portions) : '';
            const dv = (v, base) => Math.round(v / base * 100);
            const row = (name, val, pct) => `<div style="display:flex;justify-content:space-between;border-top:1px solid #000;padding:2px 0;font-size:11px;"><span><b>${name}</b> ${val}g</span>${pct !== null ? `<span><b>${pct}%</b></span>` : ''}</div>`;
            return `<div style="margin-top:10px;border:2px solid #000;padding:8px;max-width:260px;">
                <div style="font-size:16px;font-weight:900;border-bottom:8px solid #000;padding-bottom:2px;">${t('nf_title')}</div>
                <div style="font-size:11px;border-bottom:4px solid #000;padding:3px 0;">${t('nf_serving')}: <b>${servG ? servG + 'g' : '1 ' + t('nf_portion')}</b><br>${t('nf_servings')}: <b>${portions}</b></div>
                <div style="display:flex;justify-content:space-between;border-bottom:4px solid #000;padding:3px 0;font-size:12px;"><span><b>${t('nf_calories')}</b></span><span style="font-size:16px;font-weight:900;">${cal}</span></div>
                <div style="text-align:right;font-size:10px;font-weight:bold;padding:2px 0;">% ${t('nf_dv')}</div>
                ${row(t('nf_fat'), fat, dv(fat, 78))}
                ${row(t('nf_carb'), carb, dv(carb, 275))}
                ${row(t('nf_protein'), prot, dv(prot, 50))}
            </div>`;
        }
        function confirmLabelPrint() {
            if (!labelCtx) return;
            const made = document.getElementById('label-made').value;
            const exp = document.getElementById('label-exp').value;
            let title = '', sub = '', extra = '';
            if (labelCtx.kind === 'ingredient') {
                const i = inventoryDB.find(x => x.id === labelCtx.id); if (!i) return;
                title = i.name; sub = i.unit || '';
            } else {
                const d = menuDB.find(x => x.id === labelCtx.id); if (!d) return;
                title = d.name;
                sub = [t('ttk_cal') + ': ' + (d.calories || 0), 'Б:' + (d.protein || 0), 'Ж:' + (d.fat || 0), 'У:' + (d.carbs || 0)].join(' · ');
                const alg = allergensOfDish(d);
                if (alg.length) extra = `<div style="margin-top:6px;font-size:11px;"><b>${t('label_allergens')}:</b> ${alg.map(a => t('alg_' + a)).join(', ')}</div>`;
                if (document.getElementById('label-nutrition') && document.getElementById('label-nutrition').checked) extra += nutritionFactsHtml(d);
            }
            document.getElementById('print-area').innerHTML = `
                <div style="font-family:Arial,sans-serif;color:#000;background:#fff;padding:16px;max-width:320px;border:2px solid #000;">
                    <div style="font-size:18px;font-weight:bold;margin-bottom:4px;">${escapeHtml(title)}</div>
                    <div style="font-size:12px;color:#333;margin-bottom:8px;">${escapeHtml(sub)}</div>
                    <div style="font-size:12px;">${t('label_made')}: ${escapeHtml(made)}</div>
                    <div style="font-size:14px;font-weight:bold;">${t('label_exp')}: ${exp}</div>
                    ${extra}
                    <div style="font-size:10px;color:#555;margin-top:8px;">ChefOS</div>
                </div>`;
            closeModal('label-modal');
            setTimeout(() => window.print(), 50);
        }
