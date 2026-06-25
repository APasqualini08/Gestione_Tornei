// ============================================================================
// SETTINGS - Impostazioni torneo, membri, eliminazione
// ============================================================================

let tournamentId = null;
let currentUserId = null;

(async function init() {
    const user = await requireAuth();
    if (!user) return;
    currentUserId = user.id;
    await renderUserBadge();

    tournamentId = getCurrentTournamentId();
    if (!tournamentId) return;

    setupNavLinks();
    await loadTournamentSettings();
    await loadMembers();
})();

function setupNavLinks() {
    document.getElementById('navPlayers').href = linkWithTournament('players.html');
    document.getElementById('navRounds').href = linkWithTournament('matches.html');
    document.getElementById('navStandings').href = linkWithTournament('standings.html');
    document.getElementById('navSettings').href = linkWithTournament('settings.html');
}

// ----------------------------------------------------------------------------
// Dati torneo
// ----------------------------------------------------------------------------

async function loadTournamentSettings() {
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

    document.getElementById('tournamentName').textContent = `🎾 ${data.name}`;
    document.getElementById('sName').value = data.name;
    document.getElementById('sDescription').value = data.description || '';
    document.getElementById('sScoringMode').value = data.scoring_mode;
    document.getElementById('sPointsWin').value = data.points_win;
    document.getElementById('sPointsDraw').value = data.points_draw;
    document.getElementById('sPointsLoss').value = data.points_loss;
    document.getElementById('sEloD').value = data.elo_d;
    document.getElementById('sEloDValue').textContent = data.elo_d;
    document.getElementById('sEloK').value = data.elo_k;
    document.getElementById('sEloKValue').textContent = data.elo_k;
    toggleScoringFields();
}

function toggleScoringFields() {
    const mode = document.getElementById('sScoringMode').value;
    document.getElementById('winPointsFields').classList.toggle('hidden', mode === 'game');
}

async function saveTournamentSettings() {
    const name = document.getElementById('sName').value.trim();
    if (!name) {
        showToast('Il nome del torneo non può essere vuoto.', 'error');
        return;
    }

    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.textContent = 'Salvataggio...';

    const { error } = await supabaseClient
        .from('tournaments')
        .update({
            name,
            description: document.getElementById('sDescription').value.trim() || null,
            scoring_mode: document.getElementById('sScoringMode').value,
            points_win: parseFloat(document.getElementById('sPointsWin').value) || 0,
            points_draw: parseFloat(document.getElementById('sPointsDraw').value) || 0,
            points_loss: parseFloat(document.getElementById('sPointsLoss').value) || 0,
            elo_d: parseFloat(document.getElementById('sEloD').value),
            elo_k: parseFloat(document.getElementById('sEloK').value)
        })
        .eq('id', tournamentId);

    btn.disabled = false;
    btn.textContent = 'Salva impostazioni';

    if (error) {
        showToast('Errore nel salvataggio: ' + error.message, 'error');
        return;
    }

    document.getElementById('tournamentName').textContent = `🎾 ${name}`;
    showToast('Impostazioni salvate.');
}

// ----------------------------------------------------------------------------
// Membri
// ----------------------------------------------------------------------------

async function loadMembers() {
    const { data, error } = await supabaseClient.rpc('get_tournament_members_with_email', {
        p_tournament_id: tournamentId
    });

    if (error) {
        showToast('Errore nel caricamento membri: ' + error.message, 'error');
        return;
    }

    const list = document.getElementById('memberList');
    list.innerHTML = '';

    (data || []).forEach(member => {
        const li = document.createElement('li');
        li.className = 'player-row';
        const isMe = member.user_id === currentUserId;
        li.innerHTML = `
            <div class="player-info">
                <span class="player-name">${escapeHtmlSafe(member.email)}${isMe ? ' (tu)' : ''}</span>
                <span class="level-badge">${member.role === 'owner' ? 'Proprietario' : 'Editor'}</span>
            </div>
        `;
        list.appendChild(li);
    });

    if ((data || []).length === 0) {
        list.innerHTML = '<li class="text-muted">Nessun membro trovato.</li>';
    }
}

function escapeHtmlSafe(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

async function inviteMember() {
    const email = document.getElementById('inviteEmail').value.trim();
    if (!email) {
        showToast('Inserisci un\'email.', 'error');
        return;
    }

    const btn = document.getElementById('inviteBtn');
    btn.disabled = true;
    btn.textContent = 'Invio...';

    const { error } = await supabaseClient.rpc('invite_member_by_email', {
        p_tournament_id: tournamentId,
        p_email: email
    });

    btn.disabled = false;
    btn.textContent = 'Invita';

    if (error) {
        showToast('Errore nell\'invito: ' + error.message, 'error');
        return;
    }

    document.getElementById('inviteEmail').value = '';
    showToast('Membro aggiunto al torneo.');
    await loadMembers();
}

// ----------------------------------------------------------------------------
// Eliminazione torneo
// ----------------------------------------------------------------------------

async function confirmDeleteTournament() {
    const name = document.getElementById('sName').value;
    const typed = prompt(`Per confermare l'eliminazione definitiva del torneo, scrivi il nome esatto: "${name}"`);
    if (typed !== name) {
        if (typed !== null) showToast('Nome non corrispondente. Eliminazione annullata.', 'error');
        return;
    }

    const { error } = await supabaseClient.from('tournaments').delete().eq('id', tournamentId);
    if (error) {
        showToast('Errore nell\'eliminazione: ' + error.message, 'error');
        return;
    }

    showToast('Torneo eliminato.');
    setTimeout(() => window.location.href = 'tournaments.html', 1000);
}
