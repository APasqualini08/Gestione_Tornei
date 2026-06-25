// ============================================================================
// UI HELPERS - utility condivise tra le pagine
// ============================================================================

/**
 * Mostra un breve messaggio toast in basso nello schermo.
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('error');
    if (type === 'error') toast.classList.add('error');
    toast.classList.add('show');
    clearTimeout(window.__toastTimeout);
    window.__toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

/**
 * Formatta un numero di livello (es. 3, 3.5) per la visualizzazione.
 */
function formatLevel(level) {
    const n = Number(level);
    return Number.isInteger(n) ? n.toFixed(1) : n.toString();
}

/**
 * Formatta un numero di punti per la visualizzazione (1 decimale, con segno se negativo).
 */
function formatPoints(points) {
    const n = Number(points);
    return n.toFixed(1);
}

/**
 * Restituisce le iniziali nome+cognome per un avatar testuale.
 */
function initials(firstName, lastName) {
    return `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();
}

/**
 * Legge l'id torneo corrente dalla querystring (?t=uuid). Se assente, torna alla lista tornei.
 */
function getCurrentTournamentId() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('t');
    if (!id) {
        window.location.href = 'tournaments.html';
        return null;
    }
    return id;
}

/**
 * Costruisce un link verso un'altra pagina mantenendo l'id torneo corrente in querystring.
 */
function linkWithTournament(page) {
    const id = new URLSearchParams(window.location.search).get('t');
    return id ? `${page}?t=${id}` : page;
}
