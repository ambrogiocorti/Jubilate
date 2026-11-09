# Database

Schema Postgres gestito con migrazioni in `supabase/migrations` (applicate in ordine alfabetico). Tutte le tabelle del schema `public` hanno RLS attiva. Le funzioni di supporto stanno nello schema `private`, non esposto dall'API.

## Migrazioni

| File | Contenuto |
|---|---|
| `…000100_foundation.sql` | Estensioni (`pg_trgm`, `unaccent`, `pgcrypto`), parrocchie, profili, ruoli, registro attività, limiti di frequenza, richieste del ruolo di direttore, preferenze utente. |
| `…000200_library.sql` | Categorie, canti, revisioni, sezioni, accordi, collegamenti alle categorie, validazione del contenuto, ricerca. |
| `…000300_music_arrangements.sql` | Spartiti e loro versioni, versioni personali e cronologia, condivisioni, registrazioni e allegati. |
| `…000400_collaboration.sql` | Preferiti, raccolte, proposte della comunità e loro revisione. |
| `…000500_celebrations_rooms.sql` | Celebrazioni, scalette, note di prova, stanze in diretta e partecipanti. |
| `…000600_storage.sql` | Bucket privato `media` e relative regole. |

## Tabelle

**Identità e ruoli**
- `parishes`: la parrocchia (una predefinita) con `settings` jsonb (notazione, durata stanze…).
- `profiles`: uno per utente (`auth.users`), creato da trigger. Gli utenti possono modificare solo `display_name` e `avatar_url` (permessi per colonna).
- `user_roles`: ruoli `director` e `admin` con storico (`granted_by`, `revoked_at`). Scritture solo tramite RPC amministrative. **I ruoli non dipendono mai dai metadati modificabili dall'utente.**
- `director_requests`: richieste del ruolo di direttore (`pending`, `approved`, `rejected`, `cancelled`), una sola in attesa per utente.
- `user_preferences`: preferenze di lettura sincronizzate.
- `activity_logs`, `rate_limit_events`: registro delle azioni e limiti di frequenza.

**Libreria**
- `songs`: numero del libretto (unico per parrocchia tra i canti non eliminati), titolo, titoli alternativi, autore, compositore, tonalità, tempo, stato (`draft`/`published`/`archived`), eliminazione logica (`deleted_at`), fonte e diritti del testo, `search_text` normalizzato (senza accenti, minuscolo) mantenuto da trigger.
- `song_revisions`: revisioni **immutabili**; `sequence text[]` è l'ordine di esecuzione delle sezioni. Collegate a una proposta o a un ripristino.
- `song_sections`: sezioni di una revisione (`kind`: verse, chorus, refrain, bridge, intro, outro, other) con righe di testo.
- `chord_arrangements`: accordi ancorati a sezione, riga e posizione. Leggibili solo dagli utenti registrati.
- `song_categories`, `song_category_links`: categorie modificabili dall'amministratore (momenti della Messa, tempi liturgici, temi).

**Musica e versioni**
- `music_scores` (`owner_id` nullo = spartito ufficiale), `score_versions` (cronologia solo in aggiunta; un trigger assegna il numero e aggiorna la versione corrente).
- `personal_arrangements` (contenuto jsonb validato, tonalità di visualizzazione, capotasto, `version` per la concorrenza ottimistica, token di condivisione), `arrangement_versions`, `arrangement_shares`.
- `media_assets`: registrazioni audio (Storage), video YouTube (solo incorporati), PDF, immagini; stato `pending` finché un amministratore non pubblica.

**Comunità e organizzazione**
- `favorites`, `collections` (personali, celebrazione, prova; visibilità; token), `collection_items`.
- `contribution_requests`: proposte (`new_song`, `correction`, `chords`, `metadata`, `arrangement`, `score`, `recording`) con stato `draft → submitted → in_review → approved | rejected`. L'autore può solo creare bozze e inviarle; l'approvazione crea una nuova revisione ufficiale.
- `celebrations`, `celebration_songs`, `rehearsal_notes`.
- `rooms` (codice di 6 cifre unico tra le stanze attive, `state_version`, scadenza), `room_memberships`.

## Funzioni RPC principali

| Funzione | Chi | Cosa fa |
|---|---|---|
| `search_songs(q, categorie, limite)` | tutti | Ricerca per numero, titolo, titoli alternativi, testo, autore; insensibile ad accenti e maiuscole. |
| `get_revision_content(id)` | tutti | Contenuto di una revisione visibile; senza accordi per i visitatori. |
| `admin_save_song`, `admin_restore_revision`, `admin_set_song_deleted` | admin | Creazione/modifica con nuova revisione, ripristino, eliminazione logica. |
| `review_contribution(id, decisione, nota, forza)` | admin | Approva/rifiuta; rileva il conflitto se l'ufficiale è cambiato. |
| `request_director_role`, `cancel_director_request`, `review_director_request` | utente / admin | Flusso del ruolo di direttore (massimo 5 richieste al giorno). |
| `admin_set_role`, `admin_set_suspended`, `admin_list_users` | admin | Gestione utenti; un amministratore non può revocare il proprio ruolo né sospendersi. |
| `create_room`, `set_room_song`, `step_room`, `close_room`, `revoke_room_member`, `room_participants` | direttore | Gestione della stanza; `set_room_song` rifiuta con `stale_state` se la versione attesa non coincide. |
| `join_room(codice)` | utente | Ingresso con codice; 10 tentativi falliti e 60 ingressi ogni 15 minuti al massimo. |
| `create_personal_arrangement`, `duplicate_*`, `set_*_link_sharing`, `get_shared_*` | utente | Versioni personali, duplicazione, condivisione tramite link. |

## Dati di esempio (`supabase/seed.sql`)

Contiene solo materiale originale o di pubblico dominio: due canti dimostrativi scritti per Jubilate (901 «Luce del mattino», 902 «Resta con noi, Signore») con accordi, tre testi latini tradizionali di pubblico dominio (Salve Regina, Adeste fideles, Veni Creator) senza accordi, e una bozza. **Nessun testo del libretto parrocchiale è stato inserito**: andrà caricato dagli amministratori con fonte e diritti.

## Ambiente locale

```bash
npx supabase start            # stack completo in Docker (applica migrazioni e seed)
npm run test:db               # test di sicurezza su Postgres 16 locale senza Docker
```
