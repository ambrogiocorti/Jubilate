# Jubilate

**Jubilate Deo — La musica che unisce la comunità.**

Jubilate è una Progressive Web App per i canti della parrocchia: testi, accordi e spartiti consultabili da telefono, tablet e computer, anche senza connessione, con stanze in diretta che permettono al direttore del coro di mostrare a tutti il canto corrente durante le celebrazioni.

- **Visitatori**: leggono i testi pubblicati e cercano per numero, titolo, parole o autore.
- **Utenti registrati**: accordi, trasposizione, capotasto, notazione italiana o internazionale, preferiti, raccolte, versioni personali, spartiti, metronomo, stanze, uso offline, proposte di correzione.
- **Direttori**: stanze con codice di 6 cifre, scalette, prove.
- **Amministratori**: catalogo, revisioni, proposte, utenti e ruoli, categorie, spartiti, registrazioni, impostazioni.

Tecnologie: React 19, TypeScript, Vite, Supabase (Postgres con RLS, Auth, Realtime, Storage), Workbox, IndexedDB, Verovio (spartiti), pdf.js e Tesseract (importazione), GitHub Pages.

## Avvio rapido (sviluppo locale)

Requisiti: Node 22+, Docker.

```bash
npm install
npx supabase start          # avvia Postgres, Auth, Realtime e Storage in locale e applica migrazioni e dati di esempio
npx supabase status -o env  # mostra URL e chiave pubblicabile locali
cp .env.example .env.local  # inserisci VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY locali
npm run dev                 # http://localhost:5173
```

Gli account si creano dalla pagina di registrazione. Per rendere amministratore il primo utente in locale:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'tuo@indirizzo.it';
```

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` | Controllo dei tipi e build di produzione in `dist/` |
| `npm test` | Test unitari (Vitest) |
| `npm run test:db` | Test di sicurezza del database (Postgres locale, senza Docker) |
| `npm run test:e2e` | Test end-to-end nel browser (richiede `npx supabase start`) |
| `node scripts/generate-icons.mjs` | Rigenera le icone PWA dal logo |

## Documentazione

- [Architettura](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Sicurezza](docs/SECURITY.md)
- [Funzionalità](docs/FEATURES.md)
- [Pubblicazione](docs/DEPLOYMENT.md)

## Contenuti e diritti

Il repository non contiene testi del libretto parrocchiale. I dati di esempio sono due canti originali scritti per i test e tre testi latini di pubblico dominio. I canti reali vanno caricati dagli amministratori indicando fonte e diritti (opera propria, pubblico dominio, autorizzazione o licenza).
