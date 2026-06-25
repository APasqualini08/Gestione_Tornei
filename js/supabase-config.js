// ============================================================================
// CONFIGURAZIONE SUPABASE
// ============================================================================
// Inserisci qui URL e Anon Key del tuo progetto Supabase.
// Li trovi in: Dashboard Supabase -> Project Settings -> API
//
// Questi due valori sono pensati per essere pubblici (vivono nel frontend di
// QUALSIASI app Supabase): la sicurezza dei dati e' garantita dalle policy
// di Row Level Security definite in sql/schema.sql, non dal nascondere
// questi valori.
// ============================================================================

const SUPABASE_URL = 'https://fxdbqanmbieeelhrihtw.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZGJxYW5tYmllZWVsaHJpaHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDg1MjUsImV4cCI6MjA5NzkyNDUyNX0.MCEXae1HqJzwTyF03xwked3fpkb1YrpXSt7Gp8y1-fA';

// Inizializza il client Supabase (la libreria e' caricata via CDN nelle pagine HTML)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
