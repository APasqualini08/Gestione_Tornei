// ============================================================================
// SERVICE WORKER - Gestione Tornei di Padel
// ============================================================================
// Strategia: cache-first per gli asset statici dell'app (HTML/CSS/JS propri),
// network-first per tutto il resto (chiamate Supabase, librerie da CDN), cosi'
// l'app si apre anche offline ma i dati restano sempre quelli piu' recenti
// possibili quando c'e' connessione.
// ============================================================================

const CACHE_NAME = 'padel-tornei-v1';
const APP_SHELL = [
    './index.html',
    './login.html',
    './tournaments.html',
    './players.html',
    './matches.html',
    './standings.html',
    './settings.html',
    './css/styles.css',
    './js/supabase-config.js',
    './js/auth.js',
    './js/ui-helpers.js',
    './js/matchmaking.js',
    './js/tournaments.js',
    './js/players.js',
    './js/matches.js',
    './js/standings.js',
    './js/settings.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;

    // Solo le risorse dello stesso origine (la nostra app shell) usano cache-first.
    // Tutto il resto (Supabase, CDN librerie) va sempre in rete: i dati del
    // torneo non devono mai essere serviti da una cache stantia.
    if (!isSameOrigin) {
        return; // lascia che il browser gestisca la richiesta normalmente
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
