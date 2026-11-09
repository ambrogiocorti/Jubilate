# Architettura

Jubilate è una Progressive Web App a pagina singola (React 19 + TypeScript + Vite) servita come file statici da GitHub Pages, con Supabase come backend (Postgres, Auth, Realtime, Storage). Non c'è un server applicativo intermedio: **tutta l'autorizzazione è nel database** (Row Level Security e funzioni `SECURITY DEFINER`), l'interfaccia si limita a nascondere ciò che l'utente non può fare.

```
Browser (PWA)                                 Supabase
┌────────────────────────────┐   HTTPS/JWT    ┌──────────────────────────────┐
│ React UI  ── data/*.ts ────┼───────────────▶│ PostgREST → Postgres + RLS   │
│   │            │           │                │   RPC SECURITY DEFINER        │
│   │      IndexedDB (idb)   │   WebSocket    │ Realtime (postgres_changes)   │
│   │      libreria, canti,  │◀───────────────│   solo notifiche "rooms"      │
│   │      coda offline      │                │ Auth (email/password)         │
│ Service worker (Workbox)   │                │ Storage (bucket privato media)│
└────────────────────────────┘                └──────────────────────────────┘
```

## Struttura del codice

| Cartella | Contenuto |
|---|---|
| `src/music` | Teoria musicale pura: altezze, accordi, trasposizione, capotasto (`chord.ts`, `pitch.ts`); modello MusicXML modificabile (`musicxml.ts`); caricamento pigro di Verovio (`verovio.ts`). |
| `src/domain` | Logica di dominio pura e testata: contenuto dei canti (`song.ts`), importazione da testo (`textImport.ts`), ricerca (`search.ts`), preferenze (`preferences.ts`), macchina a stati delle stanze (`room.ts`), differenze (`diff.ts`). |
| `src/data` | Accesso a Supabase, una funzione per operazione. Nessun componente chiama Supabase direttamente. |
| `src/lib` | Client Supabase, variabili d'ambiente (rifiuta chiavi segrete), IndexedDB, messaggi d'errore in italiano. |
| `src/app` | Provider globali: autenticazione e ruoli, preferenze, libreria, notifiche, guardie delle rotte, aggiornamento PWA, sincronizzazione offline. |
| `src/features/*` | Una cartella per area funzionale (libreria, canto, editor, versioni, raccolte, proposte, celebrazioni, stanze, spartiti, strumenti, offline, account, amministrazione). |
| `src/components` | Componenti UI riutilizzabili e layout. |
| `supabase/migrations` | Schema, RLS, funzioni. `supabase/tests` contiene i test di sicurezza SQL. |

## Scelte principali

**Contenuto dei canti.** Un canto ha revisioni immutabili (`song_revisions`). Ogni revisione contiene sezioni (`song_sections`: strofa, ritornello, ponte…) e una sequenza (`sequence text[]`) che indica l'ordine di esecuzione: il ritornello è memorizzato una volta e ripetuto per riferimento. Gli accordi (`chord_arrangements`) sono ancorati a `{sezione, riga, posizione del carattere}`, non a spazi, quindi restano allineati con qualsiasi font e dimensione e si possono trasporre senza toccare il testo.

**Versioni personali.** `personal_arrangements` copia il contenuto ufficiale al momento della creazione e ne conserva il riferimento (`base_revision_id`). L'ufficiale non viene mai modificato. Ogni salvataggio crea una voce in `arrangement_versions` (trigger) e usa una concorrenza ottimistica sulla colonna `version`: se un altro dispositivo ha salvato nel frattempo, l'utente vede un dialogo di conflitto.

**Stanze in diretta.** La riga `rooms` nel database è la fonte di verità e porta un contatore `state_version`. Il direttore modifica lo stato solo tramite RPC (`set_room_song`, `step_room`) che verificano la versione attesa. Realtime serve solo a notificare i partecipanti; il client applica una riduzione (`domain/room.ts`) che ignora versioni vecchie e si risincronizza dal database all'iscrizione, al ritorno online, quando la scheda torna visibile e ogni 20 secondi. L'appartenenza è salvata in `localStorage`, quindi «Torna alla diretta» funziona anche dopo un ricaricamento senza reinserire il codice.

**Offline.** La libreria (metadati e testo per la ricerca) e i canti aperti sono salvati in IndexedDB. Le modifiche fatte offline (versioni personali, preferiti) vanno in una coda (`outbox`) inviata al ritorno della connessione; se la versione sul server è cambiata, viene creata una copia e nulla viene sovrascritto in silenzio. Il service worker precarica l'interfaccia; il motore degli spartiti (Verovio, ~8 MB) è scaricato e messo in cache solo al primo utilizzo.

**Spartiti.** I file MusicXML sono modificati direttamente sul DOM XML importato: le operazioni supportate (altezza, durata, pause, legature, testo, sigle, battute, tonalità, tempo, chiave) cambiano solo gli elementi necessari e tutto il resto del file è conservato all'esportazione. Gli `id` delle note coincidono con quelli dell'SVG generato da Verovio, quindi un clic sulla nota la seleziona nel modello. La cronologia (annulla/ripeti) memorizza il documento serializzato.

**Importazione e OCR.** PDF con livello di testo: estrazione esatta con pdf.js. PDF scansionati e immagini: OCR con Tesseract (italiano e latino) nel browser. Il risultato passa sempre da una revisione manuale prima di diventare un canto.
