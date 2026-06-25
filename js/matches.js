// ============================================================================
// MATCHES - Gestione turni e partite (Supabase + algoritmi matchmaking.js)
// ============================================================================

let tournamentId = null;
let tournament = null;
let allPlayers = [];
let allRounds = [];      // [{ id, round_number, formula }]
let allPairsByRound = {}; // roundId -> [{ id, player1, player2, avgLevel }]
let allMatchesByRound = {}; // roundId -> [{ id, pairA, pairB, set1_a, ... }]

(async function init() {
    const user = await requireAuth();
    if (!user) return;
    await renderUserBadge();

    tournamentId = getCurrentTournamentId();
    if (!tournamentId) return;

    setupNavLinks();
    document.getElementById('roundFormula').addEventListener('change', updateFormulaNote);
    updateFormulaNote();

    await loadTournament();
    await loadPlayers();
    await loadRoundsAndMatches();
})();

function setupNavLinks() {
    document.getElementById('navPlayers').href = linkWithTournament('players.html');
    document.getElementById('navRounds').href = linkWithTournament('matches.html');
    document.getElementById('navStandings').href = linkWithTournament('standings.html');
    document.getElementById('navSettings').href = linkWithTournament('settings.html');
}

function updateFormulaNote() {
    const formula = document.getElementById('roundFormula').value;
    document.getElementById('fixedFormulaNote').classList.toggle('hidden', formula !== 'fissa');
    document.getElementById('americanoFormulaNote').classList.toggle('hidden', formula !== 'americano');
}

// ----------------------------------------------------------------------------
// Caricamento dati
// ----------------------------------------------------------------------------

async function loadTournament() {
    const { data, error } = await supabaseClient
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

    if (error || !data) {
        showToast('Torneo non trovato.', 'error');
        setTimeout(() => window.location.href = 'tournaments.html', 1500);
        return;
    }
    tournament = data;
    document.getElementById('tournamentName').textContent = `🎾 ${data.name}`;
}

async function loadPlayers() {
    const { data, error } = await supabaseClient
        .from('players')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('active', true);

    if (error) {
        showToast('Errore nel caricamento giocatori: ' + error.message, 'error');
        return;
    }

    allPlayers = (data || []).map(p => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        firstName: p.first_name,
        lastName: p.last_name,
        level: Number(p.level)
    }));

    const notEnough = allPlayers.length < 4;
    document.getElementById('notEnoughPlayersAlert').classList.toggle('hidden', !notEnough);
    document.getElementById('generateRoundForm').classList.toggle('hidden', notEnough);
}

async function loadRoundsAndMatches() {
    document.getElementById('roundsLoading').classList.remove('hidden');

    const { data: rounds, error: roundsError } = await supabaseClient
        .from('rounds')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round_number', { ascending: true });

    if (roundsError) {
        showToast('Errore nel caricamento turni: ' + roundsError.message, 'error');
        document.getElementById('roundsLoading').classList.add('hidden');
        return;
    }

    allRounds = rounds || [];

    const { data: pairs, error: pairsError } = await supabaseClient
        .from('pairs')
        .select('*, player1:player1_id(id, first_name, last_name, level), player2:player2_id(id, first_name, last_name, level)')
        .eq('tournament_id', tournamentId);

    if (pairsError) {
        showToast('Errore nel caricamento coppie: ' + pairsError.message, 'error');
        document.getElementById('roundsLoading').classList.add('hidden');
        return;
    }

    const { data: matches, error: matchesError } = await supabaseClient
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId);

    if (matchesError) {
        showToast('Errore nel caricamento partite: ' + matchesError.message, 'error');
        document.getElementById('roundsLoading').classList.add('hidden');
        return;
    }

    // indicizza coppie per round
    allPairsByRound = {};
    const pairsById = {};
    (pairs || []).forEach(pair => {
        const normalized = {
            id: pair.id,
            roundId: pair.round_id,
            player1: pair.player1 ? { id: pair.player1.id, name: `${pair.player1.first_name} ${pair.player1.last_name}`, level: Number(pair.player1.level) } : null,
            player2: pair.player2 ? { id: pair.player2.id, name: `${pair.player2.first_name} ${pair.player2.last_name}`, level: Number(pair.player2.level) } : null,
            avgLevel: Number(pair.avg_level)
        };
        pairsById[pair.id] = normalized;
        if (!allPairsByRound[pair.round_id]) allPairsByRound[pair.round_id] = [];
        allPairsByRound[pair.round_id].push(normalized);
    });

    // indicizza partite per round, risolvendo i riferimenti alle coppie
    allMatchesByRound = {};
    (matches || []).forEach(match => {
        const normalized = {
            id: match.id,
            roundId: match.round_id,
            pairA: pairsById[match.pair_a_id],
            pairB: pairsById[match.pair_b_id],
            set1_a: match.set1_a, set1_b: match.set1_b,
            set2_a: match.set2_a, set2_b: match.set2_b,
            set3_a: match.set3_a, set3_b: match.set3_b,
            winner: match.winner,
            points_a: match.points_a,
            points_b: match.points_b
        };
        if (!allMatchesByRound[match.round_id]) allMatchesByRound[match.round_id] = [];
        allMatchesByRound[match.round_id].push(normalized);
    });

    document.getElementById('roundsLoading').classList.add('hidden');
    renderRounds();
}

// ----------------------------------------------------------------------------
// Generazione turni
// ----------------------------------------------------------------------------

async function generateRounds() {
    const formula = document.getElementById('roundFormula').value;
    const numRounds = parseInt(document.getElementById('numRoundsToGenerate').value);

    if (isNaN(numRounds) || numRounds < 1) {
        showToast('Inserisci un numero valido di turni da generare.', 'error');
        return;
    }
    if (allPlayers.length < 4) {
        showToast('Servono almeno 4 giocatori per generare un turno.', 'error');
        return;
    }

    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    btn.textContent = 'Generazione in corso...';

    try {
        for (let i = 0; i < numRounds; i++) {
            await generateSingleRound(formula);
        }
        showToast(`${numRounds} turno/i generato/i.`);
        await loadRoundsAndMatches();
    } catch (err) {
        showToast('Errore nella generazione: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Genera turno/i';
    }
}

async function generateSingleRound(formula) {
    const nextRoundNumber = allRounds.length > 0
        ? Math.max(...allRounds.map(r => r.round_number)) + 1
        : 1;

    // 1. crea la riga round
    const { data: roundData, error: roundError } = await supabaseClient
        .from('rounds')
        .insert({ tournament_id: tournamentId, round_number: nextRoundNumber, formula })
        .select()
        .single();

    if (roundError) throw new Error(roundError.message);
    const roundId = roundData.id;
    // 2. costruisce le coppie e gli abbinamenti in base alla formula
    let pairsToInsert; // [{ player1Id, player2Id, avgLevel }]
    let matchupsByPlayerIndex; // [{ pairAIndex, pairBIndex }] riferito a pairsToInsert

    if (formula === 'fissa') {
        const existingFixedPairs = getExistingFixedPairs();
        let pairsForMatching;

        if (existingFixedPairs.length > 0) {
            // riusa le coppie fisse gia' esistenti
            pairsForMatching = existingFixedPairs;
            pairsToInsert = existingFixedPairs.map(p => ({
                player1Id: p.player1.id,
                player2Id: p.player2.id,
                avgLevel: p.avgLevel
            }));
        } else {
            // prima volta: crea le coppie bilanciate
            const generated = generateBalancedPairs(allPlayers).filter(p => p.player2); // scarta eventuale dispari senza compagno
            pairsToInsert = generated.map(p => ({
                player1Id: p.player1.id,
                player2Id: p.player2.id,
                avgLevel: p.avgLevel
            }));
            pairsForMatching = generated;
        }

        // Id stabile per coppia basato sui due giocatori (non sull'id di riga
        // Supabase, che varierebbe tra coppie "nuove" non ancora inserite e
        // coppie esistenti): questo stesso formato di chiave e' usato sia qui
        // sia in buildPreviousOpponentPairKeys, cosi' coincidono sempre.
        const matchedPairsWithStableIds = pairsForMatching.map(p => ({
            ...p,
            id: stablePairKey(p.player1.id, p.player2.id)
        }));

        const previousOpponentKeys = buildPreviousOpponentPairKeys();
        const roundMatches = matchPairsForRound(matchedPairsWithStableIds, previousOpponentKeys);

        // mappa i risultati del matching agli indici in pairsToInsert (stesso ordine di pairsForMatching)
        const idToIndex = {};
        matchedPairsWithStableIds.forEach((p, idx) => { idToIndex[p.id] = idx; });
        matchupsByPlayerIndex = roundMatches.map(m => ({
            pairAIndex: idToIndex[m.pairA.id],
            pairBIndex: idToIndex[m.pairB.id]
        }));
    } else {
        // formula americano: rigenera tutto da zero ogni turno
        const { partnerKeys, opponentPlayerKeys } = buildAmericanoHistory();
        const result = generateAmericanoRound(allPlayers, partnerKeys, opponentPlayerKeys, 250);

        if (!result) throw new Error('Impossibile generare il turno con i giocatori disponibili.');

        pairsToInsert = result.pairs.map(p => ({
            player1Id: p.player1.id,
            player2Id: p.player2.id,
            avgLevel: p.avgLevel
        }));

        // mappa pairA/pairB del result.matches (oggetti) agli indici di pairsToInsert
        const pairObjToIndex = new Map();
        result.pairs.forEach((p, idx) => pairObjToIndex.set(p, idx));
        matchupsByPlayerIndex = result.matches.map(m => ({
            pairAIndex: pairObjToIndex.get(m.pairA),
            pairBIndex: pairObjToIndex.get(m.pairB)
        }));

        if (result.resting.length > 0) {
            showToast(`${result.resting.length} giocatore/i a riposo in questo turno: ${result.resting.map(p => p.name).join(', ')}`, 'success');
        }
    }

    if (!pairsToInsert || pairsToInsert.length < 2) {
        throw new Error('Non è stato possibile formare almeno 2 coppie per generare partite.');
    }

    // 3. inserisce le coppie su Supabase e recupera gli id reali
    const { data: insertedPairs, error: pairsError } = await supabaseClient
        .from('pairs')
        .insert(pairsToInsert.map(p => ({
            tournament_id: tournamentId,
            round_id: roundId,
            player1_id: p.player1Id,
            player2_id: p.player2Id,
            avg_level: p.avgLevel
        })))
        .select();

    if (pairsError) throw new Error(pairsError.message);

    // 4. inserisce le partite usando gli id reali delle coppie appena create
    const matchesToInsert = matchupsByPlayerIndex
        .filter(m => m.pairAIndex !== undefined && m.pairBIndex !== undefined)
        .map(m => ({
            tournament_id: tournamentId,
            round_id: roundId,
            pair_a_id: insertedPairs[m.pairAIndex].id,
            pair_b_id: insertedPairs[m.pairBIndex].id
        }));

    if (matchesToInsert.length === 0) {
        throw new Error('Non è stato possibile generare partite valide per questo turno.');
    }

    const { data: insertedMatches, error: matchesError } = await supabaseClient
        .from('matches')
        .insert(matchesToInsert)
        .select();
    if (matchesError) throw new Error(matchesError.message);

    // Aggiorna lo stato locale in memoria con quanto appena creato. Questo e'
    // essenziale quando si generano piu' turni in batch (numRounds > 1): senza
    // questo aggiornamento, l'iterazione successiva del ciclo calcolerebbe lo
    // stesso numero di turno (violando il vincolo unique) e l'algoritmo
    // anti-ripetizione non vedrebbe gli abbinamenti appena creati in questo batch.
    allRounds.push({ id: roundId, tournament_id: tournamentId, round_number: nextRoundNumber, formula });

    const insertedPairsNormalized = insertedPairs.map((row, idx) => {
        const sourcePlayer1 = allPlayers.find(p => p.id === row.player1_id);
        const sourcePlayer2 = allPlayers.find(p => p.id === row.player2_id);
        return {
            id: row.id,
            roundId: row.round_id,
            player1: sourcePlayer1 ? { id: sourcePlayer1.id, name: sourcePlayer1.name, level: sourcePlayer1.level } : null,
            player2: sourcePlayer2 ? { id: sourcePlayer2.id, name: sourcePlayer2.name, level: sourcePlayer2.level } : null,
            avgLevel: Number(row.avg_level)
        };
    });
    allPairsByRound[roundId] = insertedPairsNormalized;

    const pairsByInsertedId = {};
    insertedPairsNormalized.forEach(p => { pairsByInsertedId[p.id] = p; });

    allMatchesByRound[roundId] = insertedMatches.map(row => ({
        id: row.id,
        roundId: row.round_id,
        pairA: pairsByInsertedId[row.pair_a_id],
        pairB: pairsByInsertedId[row.pair_b_id],
        set1_a: row.set1_a, set1_b: row.set1_b,
        set2_a: row.set2_a, set2_b: row.set2_b,
        set3_a: row.set3_a, set3_b: row.set3_b,
        winner: row.winner,
        points_a: row.points_a,
        points_b: row.points_b
    }));
}

/**
 * Recupera le coppie fisse gia' esistenti per il torneo (formate in un
 * qualsiasi turno precedente con formula 'fissa'), normalizzate una sola
 * volta per coppia di giocatori (player1/player2), per essere riusate nei
 * nuovi turni a coppia fissa.
 */
function getExistingFixedPairs() {
    const fixedRoundIds = new Set(allRounds.filter(r => r.formula === 'fissa').map(r => r.id));
    const seen = new Map();

    fixedRoundIds.forEach(roundId => {
        (allPairsByRound[roundId] || []).forEach(pair => {
            if (!pair.player1 || !pair.player2) return;
            const key = [pair.player1.id, pair.player2.id].sort().join('|');
            if (!seen.has(key)) {
                seen.set(key, pair);
            }
        });
    });

    return Array.from(seen.values());
}

/**
 * Costruisce l'insieme delle chiavi coppia-vs-coppia gia' giocate nei turni a
 * formula fissa, usando una chiave stabile basata sui due giocatori di ogni
 * coppia (stablePairKey), cosi' coincide esattamente con le chiavi assegnate
 * alle coppie passate a matchPairsForRound in generateSingleRound.
 */
function buildPreviousOpponentPairKeys() {
    const keys = new Set();
    Object.values(allMatchesByRound).flat().forEach(m => {
        if (!m.pairA || !m.pairB || !m.pairA.player1 || !m.pairA.player2 || !m.pairB.player1 || !m.pairB.player2) return;
        const keyA = stablePairKey(m.pairA.player1.id, m.pairA.player2.id);
        const keyB = stablePairKey(m.pairB.player1.id, m.pairB.player2.id);
        keys.add(`${keyA}|${keyB}`);
        keys.add(`${keyB}|${keyA}`);
    });
    return keys;
}

/**
 * Id stabile per una coppia di giocatori, indipendente dall'ordine e
 * dall'id di riga Supabase (che varia tra coppie nuove e gia' esistenti).
 */
function stablePairKey(playerId1, playerId2) {
    return [playerId1, playerId2].sort().join('~');
}

/**
 * Costruisce lo storico compagni/avversari (a livello di singolo giocatore)
 * da tutti i turni 'americano' gia' giocati, per passarlo a generateAmericanoRound.
 */
function buildAmericanoHistory() {
    const partnerKeys = new Set();
    const opponentPlayerKeys = new Set();

    const americanoRoundIds = new Set(allRounds.filter(r => r.formula === 'americano').map(r => r.id));

    americanoRoundIds.forEach(roundId => {
        (allPairsByRound[roundId] || []).forEach(pair => {
            if (pair.player1 && pair.player2) {
                partnerKeys.add(partnerKey(pair.player1.id, pair.player2.id));
            }
        });
        (allMatchesByRound[roundId] || []).forEach(m => {
            if (!m.pairA || !m.pairB) return;
            [m.pairA.player1, m.pairA.player2].forEach(p1 => {
                [m.pairB.player1, m.pairB.player2].forEach(p2 => {
                    if (p1 && p2) opponentPlayerKeys.add(opponentKey(p1.id, p2.id));
                });
            });
        });
    });

    return { partnerKeys, opponentPlayerKeys };
}

// ----------------------------------------------------------------------------
// Visualizzazione turni / tabellone
// ----------------------------------------------------------------------------

function renderRounds() {
    const container = document.getElementById('roundsContainer');
    const emptyState = document.getElementById('roundsEmptyState');
    container.innerHTML = '';

    if (allRounds.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    // mostra i turni piu' recenti per primi
    [...allRounds].reverse().forEach(round => {
        const roundCard = document.createElement('div');
        roundCard.className = 'card';

        const formulaLabel = round.formula === 'fissa' ? 'Coppia fissa' : 'Americano (rotazione)';
        roundCard.innerHTML = `<h2>Turno ${round.round_number} <span class="level-badge">${formulaLabel}</span></h2>`;

        const matches = allMatchesByRound[round.id] || [];
        if (matches.length === 0) {
            roundCard.innerHTML += '<p class="text-muted">Nessuna partita in questo turno.</p>';
        } else {
            matches.forEach((match, idx) => {
                roundCard.appendChild(renderMatchBoard(match, idx));
            });
        }

        container.appendChild(roundCard);
    });
}

function renderMatchBoard(match, idx) {
    const board = document.createElement('div');
    board.className = 'match-board';

    const isPlayed = match.winner !== null && match.winner !== undefined;
    const header = document.createElement('div');
    header.className = 'match-board-header';
    header.innerHTML = `
        <span class="match-label">Partita ${idx + 1}: ${escapeHtml(match.pairA.player1.name)} / ${escapeHtml(match.pairA.player2.name)} vs ${escapeHtml(match.pairB.player1.name)} / ${escapeHtml(match.pairB.player2.name)}</span>
        <span class="match-status ${isPlayed ? 'played' : ''}">${isPlayed ? 'Giocata ✓' : 'Da giocare'}</span>
    `;

    const body = document.createElement('div');
    body.className = 'match-board-body';

    const winnerA = match.winner === 'A';
    const winnerB = match.winner === 'B';

    body.innerHTML = `
        <div class="teams-row">
            <div class="team-box ${winnerA ? 'winner' : ''}">
                <div class="team-player">${escapeHtml(match.pairA.player1.name)}</div>
                <div class="team-player">${escapeHtml(match.pairA.player2.name)}</div>
                <div class="team-level">Livello medio ${formatLevel(match.pairA.avgLevel)}</div>
            </div>
            <div class="vs-divider">VS</div>
            <div class="team-box ${winnerB ? 'winner' : ''}">
                <div class="team-player">${escapeHtml(match.pairB.player1.name)}</div>
                <div class="team-player">${escapeHtml(match.pairB.player2.name)}</div>
                <div class="team-level">Livello medio ${formatLevel(match.pairB.avgLevel)}</div>
            </div>
        </div>
        <table class="score-table">
            <thead>
                <tr>
                    <th>Set</th>
                    <th>Coppia A</th>
                    <th>Coppia B</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td><input type="number" min="0" class="set-input" data-set="1" data-side="a" value="${match.set1_a ?? ''}"></td>
                    <td><input type="number" min="0" class="set-input" data-set="1" data-side="b" value="${match.set1_b ?? ''}"></td>
                </tr>
                <tr>
                    <td>2</td>
                    <td><input type="number" min="0" class="set-input" data-set="2" data-side="a" value="${match.set2_a ?? ''}"></td>
                    <td><input type="number" min="0" class="set-input" data-set="2" data-side="b" value="${match.set2_b ?? ''}"></td>
                </tr>
                <tr>
                    <td>3</td>
                    <td><input type="number" min="0" class="set-input" data-set="3" data-side="a" value="${match.set3_a ?? ''}"></td>
                    <td><input type="number" min="0" class="set-input" data-set="3" data-side="b" value="${match.set3_b ?? ''}"></td>
                </tr>
            </tbody>
        </table>
        <button class="btn btn-accent btn-sm" style="margin-top:12px" data-action="save-result">Salva risultato</button>
        ${isPlayed ? `<div class="points-preview">Punti assegnati: <strong>Coppia A: ${formatPoints(match.points_a)}</strong> · <strong>Coppia B: ${formatPoints(match.points_b)}</strong></div>` : ''}
    `;

    header.addEventListener('click', () => {
        body.classList.toggle('open');
    });

    body.querySelector('[data-action="save-result"]').addEventListener('click', (e) => {
        e.stopPropagation();
        saveMatchResult(match.id, body);
    });

    // apre automaticamente le partite non ancora giocate
    if (!isPlayed) body.classList.add('open');

    board.appendChild(header);
    board.appendChild(body);
    return board;
}

async function saveMatchResult(matchId, bodyEl) {
    const getVal = (set, side) => {
        const input = bodyEl.querySelector(`.set-input[data-set="${set}"][data-side="${side}"]`);
        const v = input.value.trim();
        return v === '' ? null : parseInt(v);
    };

    const set1A = getVal(1, 'a'), set1B = getVal(1, 'b');
    const set2A = getVal(2, 'a'), set2B = getVal(2, 'b');
    const set3A = getVal(3, 'a'), set3B = getVal(3, 'b');

    if (set1A === null && set1B === null && set2A === null && set2B === null && set3A === null && set3B === null) {
        showToast('Inserisci almeno il risultato di un set.', 'error');
        return;
    }

    const btn = bodyEl.querySelector('[data-action="save-result"]');
    btn.disabled = true;
    btn.textContent = 'Salvataggio...';

    const { error } = await supabaseClient.rpc('submit_match_result', {
        p_match_id: matchId,
        p_set1_a: set1A, p_set1_b: set1B,
        p_set2_a: set2A, p_set2_b: set2B,
        p_set3_a: set3A, p_set3_b: set3B
    });

    btn.disabled = false;
    btn.textContent = 'Salva risultato';

    if (error) {
        showToast('Errore nel salvataggio: ' + error.message, 'error');
        return;
    }

    showToast('Risultato salvato.');
    await loadRoundsAndMatches();
}

// ----------------------------------------------------------------------------
// Esportazione Excel
// ----------------------------------------------------------------------------

function exportMatchScheduleToExcel() {
    if (allRounds.length === 0) {
        showToast('Non ci sono turni da esportare.', 'error');
        return;
    }

    const worksheetData = [
        ['Turno', 'Formula', 'Partita', 'Coppia', 'Giocatore 1', 'Giocatore 2', 'Set 1', 'Set 2', 'Set 3', 'Punti']
    ];

    allRounds.forEach(round => {
        const matches = allMatchesByRound[round.id] || [];
        matches.forEach((match, idx) => {
            const formulaLabel = round.formula === 'fissa' ? 'Coppia fissa' : 'Americano';
            worksheetData.push([
                round.round_number, formulaLabel, `Partita ${idx + 1}`, 'A',
                match.pairA.player1.name, match.pairA.player2.name,
                match.set1_a ?? '', match.set2_a ?? '', match.set3_a ?? '',
                match.points_a !== null && match.points_a !== undefined ? Number(match.points_a).toFixed(1) : ''
            ]);
            worksheetData.push([
                round.round_number, formulaLabel, `Partita ${idx + 1}`, 'B',
                match.pairB.player1.name, match.pairB.player2.name,
                match.set1_b ?? '', match.set2_b ?? '', match.set3_b ?? '',
                match.points_b !== null && match.points_b !== undefined ? Number(match.points_b).toFixed(1) : ''
            ]);
        });
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Calendario Partite');
    XLSX.writeFile(workbook, 'Calendario_Partite.xlsx');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
