# Test

Tutti i risultati qui riportati sono stati ottenuti eseguendo davvero i comandi il 9 novembre 2026 nell'ambiente di sviluppo. Nessun test è stato eseguito su un progetto Supabase in cloud.

## Riepilogo

| Livello | Comando | Risultato |
|---|---|---|
| Unitari (Vitest) | `npm test` | 128 test in 11 file superati |
| Sicurezza del database | `npm run test:db` | 74 controlli superati |
| End-to-end nel browser (Playwright, Chromium, profilo Pixel 7) | `npm run test:e2e` | 15 test superati: scenari A–J e controlli di accessibilità |
| Tipi | `npm run typecheck` | Nessun errore |
| Build di produzione | `npm run build` | Riuscita |

## Test unitari

`src/**/*.test.ts`: teoria musicale (parsing degli accordi in notazione italiana e internazionale, trasposizione con alterazioni corrette, capotasto), contenuto dei canti e sequenze, importazione da testo, ricerca, preferenze, macchina a stati delle stanze, differenze, editor (operazioni e cronologia), metronomo, modello MusicXML (i 7 passi del prototipo: importare, visualizzare, selezionare, modificare, salvare, esportare, reimportare senza perdere le modifiche supportate).

## Test di sicurezza del database

`supabase/tests/01_security.sql` gira su un Postgres 16 locale con uno shim che riproduce ruoli e funzioni `auth.*` di Supabase (`supabase/tests/run-local.sh`). Verifica, impersonando visitatore, utenti, direttore e amministratore: lettura dei soli contenuti pubblicati, accordi riservati ai registrati, isolamento di preferiti/raccolte/versioni, impossibilità di modificare l'ufficiale o di assegnarsi ruoli, flusso delle proposte, stanze (codici, tentativi limitati, revoca, controllo dello stato), sospensione. `02_function_grants.sql` riproduce i privilegi di default di Supabase hosted (EXECUTE concesso ad anon/authenticated) e controlla che anon possa eseguire solo le funzioni SECURITY DEFINER previste.

## Test end-to-end

Eseguiti contro lo stack Supabase completo avviato in Docker (`npx supabase start`: Postgres 17, Auth, Realtime, Storage, PostgREST) e la build di produzione servita da `vite preview`. `e2e/global-setup.ts` crea gli account di prova tramite l'API amministrativa dello stack **locale** e ripulisce i dati dei test precedenti.

| Scenario | File | Cosa verifica |
|---|---|---|
| A — Visitatore | `a-visitor.spec.ts` | Ricerca senza accenti/maiuscole e per numero, lettura del testo, nessun accordo inviato ai visitatori |
| B — Musicista | `b-musician.spec.ts` | Accordi, trasposizione Sol → La, creazione e salvataggio di una versione personale; l'ufficiale resta invariata |
| C — Spartito | `c-score.spec.ts` | Import MusicXML, rendering Verovio, selezione con il tocco, modifica con la tastiera, annulla/ripeti, salvataggio, esportazione (contenuto non supportato conservato), reimportazione |
| D — Contributo | `d-contribution.spec.ts` | Proposta di correzione, revisione con confronto, approvazione, nuova revisione visibile ai visitatori |
| E — Direttore | `e-director.spec.ts` | Richiesta del ruolo, approvazione, creazione di una stanza con codice |
| F — Sincronizzazione | `f-sync.spec.ts` | Due dispositivi: il partecipante segue i cambi di canto in tempo reale |
| G — Navigazione libera | `g-free-browsing.spec.ts` | Nessuna interruzione durante la navigazione libera, avviso del cambio, ricaricamento, «Torna alla diretta» senza codice |
| H — Riconnessione | `h-reconnect.spec.ts` | Perdita della rete, canto ancora leggibile, recupero del canto cambiato nel frattempo |
| I — Offline | `i-offline.spec.ts` | Salvataggio dei canti, ricaricamento offline dal service worker, lettura di testo e accordi |
| J — Sicurezza | `j-security.spec.ts` | Richieste dirette all'API con il token di un utente normale: modifica dell'ufficiale, nuove revisioni, RPC amministrative, autoassegnazione del ruolo, metadati utente; tutto rifiutato e dati invariati |
| Accessibilità | `k-accessibility.spec.ts` | axe-core con regole WCAG 2.0/2.1/2.2 A e AA su 8 pagine (visitatore e utente) |

### Difetti trovati e corretti grazie a questi test

- Lo stato «Modifiche non salvate» restava visibile dopo il salvataggio di una versione personale con nome cambiato.
- La barra degli strumenti dell'editor di spartiti era più larga dello schermo sui telefoni.
- Gli `id` delle note non arrivavano all'SVG con l'opzione HTML5 di Verovio: la selezione non funzionava.
- Un tocco su una linea del pentagramma non selezionava la nota: ora viene scelta la nota più vicina.
- Il salvataggio di un nuovo spartito personale veniva rifiutato (lettura della riga appena inserita): corretto con la migrazione `20261109000700`.
- Le notifiche restavano nascoste sotto le finestre di dialogo; l'avviso «pronta per l'uso offline» non spariva da solo e copriva i comandi.
- Nella barra della stanza un titolo lungo copriva il pulsante «Torna alla diretta».
- Al primo accesso l'app non funzionava offline senza un ricaricamento (ora il service worker prende il controllo subito).
- Link nel testo distinguibili solo per colore.

## Non ancora verificato

- Funzionamento su un progetto Supabase in cloud e su Cloudflare Pages (in attesa delle credenziali).
- Accesso con Google, invio reale delle email di conferma e recupero.
- OCR con Tesseract e PDF scansionati in un browser reale; caricamento di registrazioni audio nello Storage.
- Safari/iOS e Firefox (i test girano su Chromium).
- Audit di accessibilità manuale con lettori di schermo.
