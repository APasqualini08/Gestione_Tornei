// ============================================================================
// STANDINGS - Calcolo e visualizzazione classifiche
// ============================================================================
// Le classifiche sono calcolate lato client filtrando per tipo di formula,
// cosi' un torneo che ha usato sia turni 'fissa' che 'americano' mostra due
// classifiche separate e coerenti, ciascuna basata solo sui turni del tipo
// corrispondente (a coppia fissa -> classifica a coppie, americano ->
// classifica individuale), come deciso per questo progetto.
// ============================================================================

let tournamentId = null;

(async function init() {
    const user = await requireAuth();
    if (!user) return;
    await renderUserBadge();

    tournamentId = getCurrentTournamentId();
    if (!tournamentId) return;

    setupNavLinks();
    await loadTournamentHeader();
    await loadAndRenderStandings();
})();

function setupNavLinks() {
    document.getElementById('navPlayers').href = linkWithTournament('players.html');
    document.getElementById('navRounds').href = linkWithTournament('matches.html');
    document.getElementById('navStandings').href = linkWithTournament('standings.html');
    document.getElementById('navSettings').href = linkWithTournament('settings.html');
}

async function loadTournamentHeader() {
    const { data, error } = await supabaseClient
        .from('tournaments')
        .select('name')
        .eq('id', tournamentId)
        .single();

    if (error || !data) {
        showToast('Torneo non trovato.', 'error');
        setTimeout(() => window.location.href = 'tournaments.html', 1500);
        return;
    }
    document.getElementById('tournamentName').textContent = `🎾 ${data.name}`;
}

async function loadAndRenderStandings() {
    const { data: rounds, error: roundsError } = await supabaseClient
        .from('rounds')
        .select('id, formula')
        .eq('tournament_id', tournamentId);

    if (roundsError) {
        showToast('Errore nel caricamento turni: ' + roundsError.message, 'error');
        return;
    }

    const fixedRoundIds = new Set((rounds || []).filter(r => r.formula === 'fissa').map(r => r.id));
    const americanoRoundIds = new Set((rounds || []).filter(r => r.formula === 'americano').map(r => r.id));

    const hasFixed = fixedRoundIds.size > 0;
    const hasAmericano = americanoRoundIds.size > 0;

    document.getElementById('mixedFormulaNotice').classList.toggle('hidden', !(hasFixed && hasAmericano));

    // Se nessun turno e' mai stato generato, mostriamo entrambe le card vuote
    // per dare contesto all'utente su cosa aspettarsi. Se almeno un turno
    // esiste, mostriamo solo la card relativa ai tipi di formula effettivamente usati.
    const noRoundsYet = !hasFixed && !hasAmericano;
    document.getElementById('pairStandingsCard').classList.toggle('hidden', !noRoundsYet && !hasFixed);
    document.getElementById('individualStandingsCard').classList.toggle('hidden', !noRoundsYet && !hasAmericano);

    const [pairsResult, matchesResult, playersResult, pmpResult] = await Promise.all([
        supabaseClient.from('pairs').select('*').eq('tournament_id', tournamentId),
        supabaseClient.from('matches').select('*').eq('tournament_id', tournamentId).not('winner', 'is', null),
        supabaseClient.from('players').select('id, first_name, last_name').eq('tournament_id', tournamentId),
        supabaseClient.from('player_match_points').select('*').eq('tournament_id', tournamentId)
    ]);

    if (pairsResult.error || matchesResult.error || playersResult.error || pmpResult.error) {
        showToast('Errore nel caricamento dati classifica.', 'error');
        return;
    }

    const playersById = {};
    (playersResult.data || []).forEach(p => { playersById[p.id] = p; });

    const pairsById = {};
    (pairsResult.data || []).forEach(p => { pairsById[p.id] = p; });

    renderPairStandings(hasFixed, matchesResult.data || [], pairsById, playersById, fixedRoundIds);
    renderIndividualStandings(hasAmericano, pmpResult.data || [], matchesResult.data || [], playersById, americanoRoundIds);
}

// ----------------------------------------------------------------------------
// Classifica a coppie (formula fissa)
// ----------------------------------------------------------------------------

function renderPairStandings(hasFixed, matches, pairsById, playersById, fixedRoundIds) {
    document.getElementById('pairStandingsLoading').classList.add('hidden');

    if (!hasFixed) {
        document.getElementById('pairStandingsEmpty').classList.remove('hidden');
        document.getElementById('pairStandingsEmpty').querySelector('p').textContent = 'Nessun turno a coppia fissa generato ancora.';
        return;
    }

    const relevantMatches = matches.filter(m => fixedRoundIds.has(m.round_id));

    if (relevantMatches.length === 0) {
        document.getElementById('pairStandingsEmpty').classList.remove('hidden');
        return;
    }

    // aggrega per coppia normalizzata (player1Id|player2Id ordinati)
    const aggregates = {};

    function ensureAggregate(pair) {
        const key = [pair.player1_id, pair.player2_id].sort().join('|');
        if (!aggregates[key]) {
            const p1 = playersById[pair.player1_id];
            const p2 = playersById[pair.player2_id];
            aggregates[key] = {
                label: `${p1.first_name} ${p1.last_name} / ${p2.first_name} ${p2.last_name}`,
                matchesPlayed: 0,
                wins: 0,
                points: 0
            };
        }
        return aggregates[key];
    }

    relevantMatches.forEach(match => {
        const pairA = pairsById[match.pair_a_id];
        const pairB = pairsById[match.pair_b_id];
        if (!pairA || !pairB) return;

        const aggA = ensureAggregate(pairA);
        aggA.matchesPlayed += 1;
        aggA.points += Number(match.points_a);
        if (match.winner === 'A') aggA.wins += 1;

        const aggB = ensureAggregate(pairB);
        aggB.matchesPlayed += 1;
        aggB.points += Number(match.points_b);
        if (match.winner === 'B') aggB.wins += 1;
    });

    const sorted = Object.values(aggregates).sort((a, b) => b.points - a.points);
    renderStandingsTable('pairStandingsBody', 'pairStandingsTable', sorted, row => row.label);
}

// ----------------------------------------------------------------------------
// Classifica individuale (formula americano)
// ----------------------------------------------------------------------------

function renderIndividualStandings(hasAmericano, playerMatchPoints, matches, playersById, americanoRoundIds) {
    document.getElementById('individualStandingsLoading').classList.add('hidden');

    if (!hasAmericano) {
        document.getElementById('individualStandingsEmpty').classList.remove('hidden');
        document.getElementById('individualStandingsEmpty').querySelector('p').textContent = 'Nessun turno americano generato ancora.';
        return;
    }

    // mappa match_id -> round_id per filtrare i punti dei soli turni americano
    const matchToRound = {};
    matches.forEach(m => { matchToRound[m.id] = m.round_id; });

    const relevantPoints = playerMatchPoints.filter(pmp => americanoRoundIds.has(matchToRound[pmp.match_id]));

    if (relevantPoints.length === 0) {
        document.getElementById('individualStandingsEmpty').classList.remove('hidden');
        return;
    }

    const aggregates = {};
    relevantPoints.forEach(pmp => {
        const player = playersById[pmp.player_id];
        if (!player) return;
        if (!aggregates[pmp.player_id]) {
            aggregates[pmp.player_id] = {
                label: `${player.first_name} ${player.last_name}`,
                matchesPlayed: 0,
                wins: 0,
                points: 0
            };
        }
        const agg = aggregates[pmp.player_id];
        agg.matchesPlayed += 1;
        agg.points += Number(pmp.points);
        if (pmp.is_win) agg.wins += 1;
    });

    const sorted = Object.values(aggregates).sort((a, b) => b.points - a.points);
    renderStandingsTable('individualStandingsBody', 'individualStandingsTable', sorted, row => row.label);
}

// ----------------------------------------------------------------------------
// Rendering tabella condiviso
// ----------------------------------------------------------------------------

function renderStandingsTable(bodyId, tableId, rows, labelFn) {
    const body = document.getElementById(bodyId);
    body.innerHTML = '';

    rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="rank-cell">${idx + 1}</td>
            <td>${escapeHtml(labelFn(row))}</td>
            <td>${row.matchesPlayed}</td>
            <td>${row.wins}</td>
            <td class="points-cell">${formatPoints(row.points)}</td>
        `;
        body.appendChild(tr);
    });

    document.getElementById(tableId).classList.remove('hidden');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
