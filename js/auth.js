// ============================================================================
// AUTH - Gestione autenticazione condivisa tra le pagine
// ============================================================================

/**
 * Verifica che l'utente sia autenticato. Se non lo e', redirige alla pagina
 * di login. Da chiamare all'inizio di ogni pagina protetta.
 * @returns {Promise<Object|null>} l'utente autenticato, o null se reindirizzato
 */
async function requireAuth() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) {
        window.location.href = 'login.html';
        return null;
    }
    return data.session.user;
}

/**
 * Esegue il logout e torna alla pagina di login.
 */
async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

/**
 * Mostra l'email dell'utente loggato nella topbar, se l'elemento esiste.
 */
async function renderUserBadge() {
    const el = document.getElementById('userEmailBadge');
    if (!el) return;
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        el.textContent = data.session.user.email;
    }
}
