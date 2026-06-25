// ============================================================================
// PWA REGISTER - registrazione service worker, condivisa tra tutte le pagine
// ============================================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch((err) => {
            console.warn('Registrazione service worker non riuscita:', err);
        });
    });
}
