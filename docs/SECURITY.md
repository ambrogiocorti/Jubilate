# Sicurezza

## Principi

1. **Autorizzazione nel database.** Ogni tabella ha RLS attiva; le operazioni sensibili passano da funzioni `SECURITY DEFINER` con `search_path = ''` che verificano il ruolo all'inizio (`private.require_admin`, `require_user`, `can_control_room`…). L'interfaccia nasconde i comandi non disponibili, ma non è mai l'unico controllo.
2. **Ruoli solo da tabella.** I ruoli `director` e `admin` sono letti da `user_roles`, scritti solo da RPC amministrative e mai dedotti da `user_metadata` o da altri campi che l'utente può modificare.
3. **Solo chiavi pubblicabili nel client.** L'app usa `VITE_SUPABASE_PUBLISHABLE_KEY`. `src/lib/env.ts` rifiuta all'avvio chiavi che sembrano segrete (`sb_secret_…` o JWT con ruolo `service_role`). La service role key non è usata da nessuna parte del codice client.
4. **Permessi minimi.** I `GRANT` sono espliciti, spesso per colonna (es. un utente può aggiornare solo nome e avatar del proprio profilo; una proposta solo titolo, messaggio, contenuto e stato).
5. **Dati immutabili.** Le revisioni ufficiali e le versioni degli spartiti non si modificano: ogni cambiamento crea una nuova riga; il ripristino crea una nuova revisione che punta a quella ripristinata.

## Cosa può fare ciascun ruolo (verificato dai test SQL)

| | Visitatore | Utente | Direttore | Admin |
|---|---|---|---|---|
| Testi pubblicati | ✓ | ✓ | ✓ | ✓ |
| Accordi | — | ✓ | ✓ | ✓ |
| Bozze ed eliminati | — | — | — | ✓ |
| Preferiti, raccolte, versioni personali | — | solo propri | solo propri | solo propri |
| Proposte | — | crea/invia le proprie | come utente | valuta tutte |
| Stanze | — | entra con codice | crea e guida le proprie | tutte |
| Utenti, ruoli, categorie, impostazioni | — | — | — | ✓ |

Un utente sospeso perde le funzioni riservate (resta come visitatore). Un partecipante revocato da una stanza non può rientrare con lo stesso codice.

## Stanze e codici

- Codici di 6 cifre generati con `pgcrypto` (`gen_random_bytes`), unici tra le stanze attive, con scadenza (predefinita 6 ore).
- Nessuna policy permette di cercare una stanza per codice: l'ingresso passa solo da `join_room`, che limita i tentativi (10 errori / 15 minuti) e gli ingressi (60 / 15 minuti). I tentativi falliti sono registrati anche quando il codice è sbagliato (la funzione restituisce `NULL` invece di sollevare un errore, così la registrazione non viene annullata).
- Le modifiche dello stato richiedono la versione attesa (`stale_state` in caso di conflitto).

## File caricati

- Bucket privato `media`, massimo 50 MB, solo tipi MIME consentiti (audio, PDF, immagini).
- Percorsi `<uid>/<uuid>.<ext>`: un utente può scrivere solo nella propria cartella; la lettura avviene con URL firmati a scadenza e solo se l'elemento è pubblicato, è dell'utente o l'utente è amministratore.
- I video YouTube sono solo incorporati (dominio `youtube-nocookie.com`), mai scaricati. Gli URL accettati sono validati sia nel client sia da un vincolo `CHECK`.
- I file MusicXML sono analizzati con `DOMParser` dopo aver rimosso il `DOCTYPE` (nessuna DTD esterna, nessuna espansione di entità), limite 5 MB.

## Intestazioni HTTP (Cloudflare Pages, `public/_headers`)

Content-Security-Policy restrittiva (`default-src 'self'`; script solo propri più l'hash dello script del tema; `wasm-unsafe-eval` per Verovio; connessioni solo verso Supabase e le risorse di Tesseract), `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`.

## Autenticazione

- Supabase Auth con PKCE; password con almeno 8 caratteri, lettere e numeri (`supabase/config.toml` e validazione nel client).
- Redirect di accesso consentiti solo verso percorsi interni (`safeNext`), per evitare open redirect.
- Accesso con Google: da attivare nel progetto Supabase (vedi DEPLOYMENT.md).

## Segnalare un problema

Le vulnerabilità vanno segnalate privatamente all'amministratore del progetto, non tramite issue pubbliche.
