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
