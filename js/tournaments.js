// ============================================================================
// TOURNAMENTS - Logica pagina selezione/creazione torneo
// ============================================================================

let currentUser = null;

(async function init() {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await renderUserBadge();
    await loadTournaments();
})();

async function loadTournaments() {
    const loadingState = document.getElementById('loadingState');
    const grid = document.getElementById('tournamentGrid');
    const emptyState = document.getElementById('emptyState');

    const { data, error } = await supabaseClient
        .from('tournaments')
        .select('id, name, description, created_at')
        .order('created_at', { ascending: false });

    loadingState.classList.add('hidden');

    if (error) {
        showToast('Errore nel caricamento dei tornei: ' + error.message, 'error');
        emptyState.classList.remove('hidden');
        return;
    }

    if (!data || data.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    grid.innerHTML = '';
    data.forEach(tournament => {
        const tile = document.createElement('a');
        tile.className = 'tournament-tile';
        tile.href = `players.html?t=${tournament.id}`;
        const createdDate = new Date(tournament.created_at).toLocaleDateString('it-IT');
        tile.innerHTML = `
            <h3>${escapeHtml(tournament.name)}</h3>
            <div class="tournament-meta">${tournament.description ? escapeHtml(tournament.description) + ' · ' : ''}Creato il ${createdDate}</div>
        `;
        grid.appendChild(tile);
    });
    grid.classList.remove('hidden');
}

function openNewTournamentForm() {
    document.getElementById('newTournamentCard').classList.remove('hidden');
    document.getElementById('newTournamentCard').scrollIntoView({ behavior: 'smooth' });
}

function closeNewTournamentForm() {
    document.getElementById('newTournamentCard').classList.add('hidden');
}

function toggleScoringFields() {
    const mode = document.getElementById('tScoringMode').value;
    document.getElementById('winPointsFields').classList.toggle('hidden', mode === 'game');
}

async function createTournament() {
    const name = document.getElementById('tName').value.trim();
    if (!name) {
        showToast('Inserisci un nome per il torneo.', 'error');
        return;
    }

    const description = document.getElementById('tDescription').value.trim();
    const scoringMode = document.getElementById('tScoringMode').value;
    const pointsWin = parseFloat(document.getElementById('tPointsWin').value) || 0;
    const pointsDraw = parseFloat(document.getElementById('tPointsDraw').value) || 0;
    const pointsLoss = parseFloat(document.getElementById('tPointsLoss').value) || 0;
    const eloD = parseFloat(document.getElementById('tEloD').value);
    const eloK = parseFloat(document.getElementById('tEloK').value);

    const btn = document.getElementById('createTournamentBtn');
    btn.disabled = true;
    btn.textContent = 'Creazione...';

    const { data, error } = await supabaseClient.rpc('create_tournament', {
        p_name: name,
        p_description: description || null,
        p_elo_d: eloD,
        p_elo_k: eloK,
        p_scoring_mode: scoringMode,
        p_points_win: pointsWin,
        p_points_draw: pointsDraw,
        p_points_loss: pointsLoss
    });

    btn.disabled = false;
    btn.textContent = 'Crea torneo';

    if (error) {
        showToast('Errore nella creazione del torneo: ' + error.message, 'error');
        return;
    }

    showToast('Torneo creato!');
    window.location.href = `players.html?t=${data}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
