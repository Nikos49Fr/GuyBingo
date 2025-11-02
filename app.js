/* ================================
   Guy Bingo — app.js
   ================================ */

(() => {
    const els = {
        sizeSelect: document.getElementById('sizeSelect'),
        resetCheckedBtn: document.getElementById('resetCheckedBtn'),
        exportBtn: document.getElementById('exportBtn'),
        importBtn: document.getElementById('importBtn'),
        importFile: document.getElementById('importFile'),
        editor: document.getElementById('editor'),
        tplEditor: document.getElementById('tpl-editor-row'),
        tplCard: document.getElementById('tpl-card'),
        board: document.getElementById('board'),
        shuffleBtn: document.getElementById('shuffleBtn'),
        clearGoalsBtn: document.getElementById('clearGoalsBtn'),
    };

    const STORAGE_KEY = 'guybingo_config';

    let state = {
        size: 3,
        cells: [],
        checked: new Set(),
        // lignes/colonnes/diagonales complétées à la dernière vérification
        lastCompleted: new Set(),
    };

    /* ---------- Utils ---------- */
    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            size: state.size,
            cells: state.cells,
            checked: Array.from(state.checked),
        }));
    }

    function loadState() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        try {
            const data = JSON.parse(raw);
            state.size = data.size || 3;
            state.cells = Array.isArray(data.cells) ? data.cells : [];
            state.checked = new Set(data.checked || []);
        } catch (e) {
            console.warn('Failed to parse saved state', e);
        }
    }

    function qsAll(sel, ctx = document) {
        return Array.from(ctx.querySelectorAll(sel));
    }

    /* ---------- Éditeur ---------- */
    function renderEditor() {
        els.editor.innerHTML = '';
        const total = state.size * state.size;
        for (let i = 0; i < total; i++) {
            const row = els.tplEditor.content.cloneNode(true);
            const root = row.querySelector('.gb-editor__row');
            root.dataset.index = i;
            root.querySelector('.gb-editor__index').textContent = i + 1;

            const textInput = root.querySelector('.gb-input--text');
            const cellData = state.cells[i] || { value: '' };
            textInput.placeholder = 'Objectif';
            textInput.value = cellData.value || '';

            textInput.addEventListener('input', () => {
                const val = textInput.value;
                state.cells[i] = { type: 'text', value: val };
                saveState();
                // Mise à jour immédiate de la carte correspondante
                const card = document.querySelector(`.gb-card[data-index="${i}"]`);
                if (card) {
                    const isPH = !val.trim();
                    const txt = isPH ? 'Objectif' : val;
                    card.querySelectorAll('.gb-card__content').forEach(el => {
                        el.textContent = txt;
                        el.classList.toggle('is-placeholder', isPH);
                    });
                }
            });
        
            els.editor.appendChild(row);
        }
        saveState();
    }

    /* ---------- Grille Overlay ---------- */
    function renderBoard() {
        els.board.dataset.size = state.size;
        els.board.innerHTML = '';
        const total = state.size * state.size;
        for (let i = 0; i < total; i++) {
            const cell = state.cells[i] || { type: 'text', value: '' };
            const tpl = els.tplCard.innerHTML.replace(/__i__/g, i);
            const wrapper = document.createElement('div');
            wrapper.innerHTML = tpl.trim();
            const card = wrapper.firstChild;

            qsAll('.gb-card__face', card).forEach(face => {
                const cont = face.querySelector('.gb-card__content');
                const val = (cell.value || '').toString();
                const isPH = !val.trim();
                cont.textContent = isPH ? 'Objectif' : val;
                cont.classList.toggle('is-placeholder', isPH);
            });

            if (state.checked.has(i)) card.classList.add('is-checked');
            card.addEventListener('click', () => toggleCard(i, card));
            els.board.appendChild(card);
        }
        checkWinLines(); // déclenche aussi le voile persistant/anim par case
    }

    function toggleCard(i, card) {
        const pressed = card.classList.toggle('is-checked');
        if (pressed) state.checked.add(i);
        else state.checked.delete(i);
        saveState();
        checkWinLines();
    }

    /* ---------- Gagnants ---------- */
    function checkWinLines() {
        const n = state.size;
        const lines = [];
        const get = i => state.checked.has(i);

        // Lignes
        for (let r = 0; r < n; r++) {
            const start = r * n;
            if (Array.from({ length: n }, (_, k) => get(start + k)).every(Boolean))
                lines.push({ type: 'row', r });
        }
        // Colonnes
        for (let c = 0; c < n; c++) {
            if (Array.from({ length: n }, (_, k) => get(c + k * n)).every(Boolean))
                lines.push({ type: 'col', c });
        }
        // Diagonales
        if (Array.from({ length: n }, (_, k) => get(k * (n + 1))).every(Boolean))
            lines.push({ type: 'diag', d: 1 });
        if (Array.from({ length: n }, (_, k) => get((k + 1) * (n - 1))).every(Boolean))
            lines.push({ type: 'diag', d: 2 });

        // Détermine les lignes nouvellement complétées (diff vs précédent état)
        const keyOf = line => (
            line.type === 'row' ? `row:${line.r}` :
            line.type === 'col' ? `col:${line.c}` :
            `diag:${line.d}`
        );

        const currentKeys = new Set(lines.map(keyOf));
        const newlyCompleted = lines.filter(l => !state.lastCompleted.has(keyOf(l)));

        applyLineEffects(lines, newlyCompleted);

        // Mémorise l'état courant pour le prochain diff
        state.lastCompleted = currentKeys;
        checkFullBoard();
    }

    function indicesForLine(line) {
        const n = state.size;
        const out = [];
        if (line.type === 'row') {
            const start = line.r * n;
            for (let k = 0; k < n; k++) out.push(start + k);
        } else if (line.type === 'col') {
            for (let k = 0; k < n; k++) out.push(line.c + k * n);
        } else if (line.type === 'diag' && line.d === 1) {
            for (let k = 0; k < n; k++) out.push(k * (n + 1));
        } else if (line.type === 'diag' && line.d === 2) {
            for (let k = 0; k < n; k++) out.push((k + 1) * (n - 1));
        }
        return out;
    }

    function applyLineEffects(allLines, newlyCompletedLines) {
        const cards = Array.from(document.querySelectorAll('.gb-card'));

        // 1) Réapplique uniquement le voile persistant selon les lignes actuellement complètes
        cards.forEach(card => card.classList.remove('veil-persist'));
        allLines.forEach(line => {
            const idxs = indicesForLine(line);
            idxs.forEach(i => { const c = cards[i]; if (c) c.classList.add('veil-persist'); });
        });

        // 2) Joue l'animation SEULEMENT pour les nouvelles lignes complétées
        newlyCompletedLines.forEach(line => {
            const dirClass =
                line.type === 'row' ? 'sweep-x' :
                line.type === 'col' ? 'sweep-y' :
                (line.d === 1 ? 'sweep-d1' : 'sweep-d2');

            const idxs = indicesForLine(line);
            idxs.forEach(i => {
                const card = cards[i];
                if (!card) return;
                // Forcer reflow puis ajouter la classe d'anim
                void card.offsetWidth;
                card.classList.add(dirClass);
                // Nettoyage de la classe d'anim à la fin
                card.addEventListener('animationend', () => {
                    card.classList.remove('sweep-x', 'sweep-y', 'sweep-d1', 'sweep-d2');
                }, { once: true });
            });
        });
    }

    function checkFullBoard() {
        const total = state.size * state.size;
        const full = state.checked.size === total;
        els.board.classList.toggle('gb-complete', full);
    }

    /* ---------- Actions boutons ---------- */
    // Changement immédiat de la taille de grille
    els.sizeSelect.addEventListener('change', () => {
        state.size = parseInt(els.sizeSelect.value, 10);
        state.checked.clear();
        state.lastCompleted = new Set();
        renderEditor();
        renderBoard();
        saveState();
    });

    els.resetCheckedBtn.addEventListener('click', () => {
        state.checked.clear();
        saveState();
        renderBoard();
    });

    // Effacer le contenu de tous les objectifs (éditeur + grille)
    els.clearGoalsBtn.addEventListener('click', () => {
        const total = state.size * state.size;
        state.cells = Array.from({ length: total }, () => ({ type: 'text', value: '' }));
        saveState();
        renderEditor();
        renderBoard();
    });

    // Mélanger les cases visibles (n*n) et réinitialiser les coches
    els.shuffleBtn.addEventListener('click', () => {
        const total = state.size * state.size;
        // Construit un tableau des N cellules utilisées (remplit les manquantes par valeur vide => placeholder)
        const cells = Array.from({ length: total }, (_, i) => {
            const c = state.cells[i];
            if (c && typeof c.value === 'string') return { type: 'text', value: c.value };
            return { type: 'text', value: '' };
        });
        // Shuffle de Fisher–Yates
        for (let i = cells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cells[i], cells[j]] = [cells[j], cells[i]];
        }
        state.cells = cells;
        state.checked.clear();
        state.lastCompleted = new Set();
        saveState();
        renderEditor();
        renderBoard();
    });

    els.exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({
            size: state.size,
            cells: state.cells,
            checked: Array.from(state.checked)
        }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `guybingo-${Date.now()}.json`;
        a.click();
    });

    els.importBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                state.size = data.size || 3;
                state.cells = (data.cells || []).map((c, idx) => ({
                    type: 'text',
                    value: (c && c.value) ? c.value : ''
                }));
                state.checked = new Set(data.checked || []);
                els.sizeSelect.value = state.size;
                renderEditor();
                renderBoard();
                saveState();
            } catch (err) {
                alert('Fichier invalide');
            }
        };
        reader.readAsText(file);
    });

    /* ---------- Init ---------- */
    loadState();
    els.sizeSelect.value = state.size;
    renderEditor();
    renderBoard();
})();
