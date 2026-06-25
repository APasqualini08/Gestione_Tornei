// ============================================================================
// PLAYERS - Gestione giocatori (Supabase)
// ============================================================================

let tournamentId = null;
let players = [];

(async function init() {
    const user = await requireAuth();
    if (!user) return;
    await renderUserBadge();

    tournamentId = getCurrentTournamentId();
    if (!tournamentId) return;

    setupNavLinks();
    await loadTournamentHeader();
    await loadPlayers();
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
        showToast('Torneo non trovato o accesso non consentito.', 'error');
        setTimeout(() => window.location.href = 'tournaments.html', 1500);
        return;
    }
    document.getElementById('tournamentName').textContent = `🎾 ${data.name}`;
}

// ----------------------------------------------------------------------------
// Caricamento e visualizzazione
// ----------------------------------------------------------------------------

async function loadPlayers() {
    document.getElementById('playerListLoading').classList.remove('hidden');

    const { data, error } = await supabaseClient
        .from('players')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('last_name', { ascending: true });

    document.getElementById('playerListLoading').classList.add('hidden');

    if (error) {
        showToast('Errore nel caricamento dei giocatori: ' + error.message, 'error');
        return;
    }

    players = data || [];
    displayPlayers();
}

function displayPlayers() {
    const playerList = document.getElementById('playerList');
    const emptyState = document.getElementById('playerEmptyState');
    const countBadge = document.getElementById('playerCountBadge');

    countBadge.textContent = players.length;
    playerList.innerHTML = '';

    if (players.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    players.forEach(player => {
        const li = document.createElement('li');
        li.className = 'player-row';

        const info = document.createElement('div');
        info.className = 'player-info';
        info.innerHTML = `
            <span class="player-name">${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</span>
            <span class="level-badge">Livello ${formatLevel(player.level)}</span>
            ${player.age ? `<span class="player-meta">${player.age} anni</span>` : ''}
        `;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'icon-btn';
        removeBtn.innerHTML = '✕';
        removeBtn.title = 'Rimuovi giocatore';
        removeBtn.addEventListener('click', () => removePlayer(player.id));

        li.appendChild(info);
        li.appendChild(removeBtn);
        playerList.appendChild(li);
    });
}

// ----------------------------------------------------------------------------
// Validazione condivisa
// ----------------------------------------------------------------------------

function validatePlayerInput(firstName, lastName, age, level) {
    if (!firstName || !lastName) return 'Nome e cognome sono obbligatori.';
    if (isNaN(level) || level < 1 || level > 5) return 'Il livello deve essere un numero tra 1 e 5.';
    if (age !== null && (isNaN(age) || age < 1 || age > 119)) return 'L\'età deve essere un numero valido.';
    return null;
}

// ----------------------------------------------------------------------------
// Aggiunta manuale
// ----------------------------------------------------------------------------

async function addPlayer() {
    const firstName = document.getElementById('playerFirstName').value.trim();
    const lastName = document.getElementById('playerLastName').value.trim();
    const ageRaw = document.getElementById('playerAge').value.trim();
    const age = ageRaw === '' ? null : parseInt(ageRaw);
    const level = parseFloat(document.getElementById('playerLevel').value);

    const validationError = validatePlayerInput(firstName, lastName, age, level);
    if (validationError) {
        showToast(validationError, 'error');
        return;
    }

    const { error } = await supabaseClient.from('players').insert({
        tournament_id: tournamentId,
        first_name: firstName,
        last_name: lastName,
        age: age,
        level: level
    });

    if (error) {
        showToast('Errore nell\'aggiunta del giocatore: ' + error.message, 'error');
        return;
    }

    document.getElementById('playerFirstName').value = '';
    document.getElementById('playerLastName').value = '';
    document.getElementById('playerAge').value = '';
    document.getElementById('playerLevel').value = '';

    showToast('Giocatore aggiunto.');
    await loadPlayers();
}

// ----------------------------------------------------------------------------
// Aggiunta da testo (copia/incolla)
// ----------------------------------------------------------------------------

async function addPlayersFromText() {
    const inputText = document.getElementById('playerInput').value.trim();
    if (!inputText) {
        showToast('Inserisci almeno un giocatore.', 'error');
        return;
    }

    const { rows, errors } = parseCsvLikeText(inputText);

    if (rows.length === 0) {
        showToast('Nessun giocatore valido trovato. ' + (errors[0] || ''), 'error');
        return;
    }

    const { error } = await supabaseClient.from('players').insert(
        rows.map(r => ({
            tournament_id: tournamentId,
            first_name: r.firstName,
            last_name: r.lastName,
            age: r.age,
            level: r.level
        }))
    );

    if (error) {
        showToast('Errore nell\'importazione: ' + error.message, 'error');
        return;
    }

    document.getElementById('playerInput').value = '';
    showToast(`${rows.length} giocatori aggiunti${errors.length ? ` (${errors.length} righe scartate)` : ''}.`);
    await loadPlayers();
}

// ----------------------------------------------------------------------------
// Caricamento da file CSV
// ----------------------------------------------------------------------------

function loadPlayersFromFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Seleziona un file CSV.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(event) {
        const content = event.target.result;
        const { rows, errors } = parseCsvLikeText(content, true);

        if (rows.length === 0) {
            showToast('Nessun giocatore valido trovato nel file. ' + (errors[0] || ''), 'error');
            return;
        }

        const { error } = await supabaseClient.from('players').insert(
            rows.map(r => ({
                tournament_id: tournamentId,
                first_name: r.firstName,
                last_name: r.lastName,
                age: r.age,
                level: r.level
            }))
        );

        if (error) {
            showToast('Errore nell\'importazione: ' + error.message, 'error');
            return;
        }

        fileInput.value = '';
        showToast(`${rows.length} giocatori importati${errors.length ? ` (${errors.length} righe scartate)` : ''}.`);
        await loadPlayers();
    };
    reader.readAsText(file);
}

/**
 * Parsa testo CSV-like: Nome, Cognome, Età, Livello (una riga per giocatore).
 * L'età può essere vuota. Salta automaticamente una riga di intestazione se
 * la prima riga non contiene un livello numerico valido.
 */
function parseCsvLikeText(text, skipHeaderIfPresent = false) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const rows = [];
    const errors = [];

    lines.forEach((line, idx) => {
        const parts = line.split(',').map(p => p.trim());

        if (idx === 0 && skipHeaderIfPresent && isNaN(parseFloat(parts[3]))) {
            return; // riga di intestazione, salta
        }

        const [firstName, lastName, ageRaw, levelRaw] = parts;
        const age = ageRaw === undefined || ageRaw === '' ? null : parseInt(ageRaw);
        const level = parseFloat(levelRaw);

        const validationError = validatePlayerInput(firstName, lastName, age, level);
        if (validationError) {
            errors.push(`Riga "${line}": ${validationError}`);
            return;
        }

        rows.push({ firstName, lastName, age, level });
    });

    return { rows, errors };
}

// ----------------------------------------------------------------------------
// Rimozione / reset
// ----------------------------------------------------------------------------

async function removePlayer(playerId) {
    if (!confirm('Rimuovere questo giocatore? Verranno rimossi anche i suoi abbinamenti e risultati nei turni già generati.')) return;

    const { error } = await supabaseClient.from('players').delete().eq('id', playerId);
    if (error) {
        showToast('Errore nella rimozione: ' + error.message, 'error');
        return;
    }
    showToast('Giocatore rimosso.');
    await loadPlayers();
}

async function confirmResetPlayers() {
    if (!confirm('Rimuovere TUTTI i giocatori di questo torneo? L\'azione non è reversibile e rimuoverà anche turni e partite collegate.')) return;

    const { error } = await supabaseClient.from('players').delete().eq('tournament_id', tournamentId);
    if (error) {
        showToast('Errore nel reset: ' + error.message, 'error');
        return;
    }
    showToast('Tutti i giocatori sono stati rimossi.');
    await loadPlayers();
}

// ----------------------------------------------------------------------------
// Esportazione CSV
// ----------------------------------------------------------------------------

function exportPlayersToCSV() {
    if (players.length === 0) {
        showToast('Non ci sono giocatori da esportare.', 'error');
        return;
    }
    const header = 'Nome,Cognome,Eta,Livello';
    const rows = players.map(p => `${p.first_name},${p.last_name},${p.age ?? ''},${p.level}`);
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'giocatori.csv';
    link.click();
}

// ----------------------------------------------------------------------------
// Tabs
// ----------------------------------------------------------------------------

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`button[onclick="showTab('${tabId}')"]`).classList.add('active');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
