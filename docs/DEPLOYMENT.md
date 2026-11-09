# Pubblicazione

Jubilate non è ancora pubblicata. Questa è la procedura prevista; i passi contrassegnati con 🔑 richiedono credenziali o decisioni del responsabile del progetto.

## 1. Progetto Supabase dedicato 🔑

1. Creare un progetto **nuovo e dedicato a Jubilate** (regione UE, ad esempio Francoforte; piano gratuito). Non riutilizzare database di altri progetti.
2. Applicare le migrazioni: `npx supabase link --project-ref <ref>` e `npx supabase db push` (oppure, se la porta 5432 non è raggiungibile, con l'endpoint HTTPS `POST /v1/projects/<ref>/database/query` della Management API). **Non** applicare `supabase/seed.sql` in produzione.
3. Controllare gli avvisi di sicurezza e prestazioni (Advisors) del progetto.
4. Auth → URL Configuration: Site URL `https://ambrogiocorti.github.io/Jubilate`; Redirect URLs `https://ambrogiocorti.github.io/Jubilate/auth/callback` (con un dominio personalizzato, `https://<dominio>` e `https://<dominio>/auth/callback`).
5. Auth → password: minimo 8 caratteri, lettere e numeri. Abilitare la conferma dell'email.
6. Primo amministratore: dopo la registrazione, dall'editor SQL del progetto
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = '<email>';
   ```
7. Primi canti: `supabase/content/primi_canti.sql` (generato da `build_primi_canti.py`) inserisce cinque canti di pubblico dominio con autori, fonti, diritti, categorie, tonalità, metro e accordi, a nome del primo amministratore. Si può eseguire più volte: i titoli già presenti vengono saltati.
8. Impostazioni della parrocchia (nome, notazione, durata delle stanze) dalla sezione Amministrazione → Impostazioni.

## 2. Accesso

Solo e-mail e password: l'accesso con Google è stato rimosso su richiesta. In Supabase → Auth → Providers il provider Google deve restare disattivato.

## 2b. Funzione di ricerca degli spartiti (CPDL)

`supabase/functions/score-search` cerca file MusicXML su CPDL e li scarica per l'app (CPDL non permette il download diretto dal browser). Pubblicazione: `npx supabase functions deploy score-search --project-ref <ref> --use-api` (oppure dalla Management API). Non usa segreti; controlla da sé che l'utente abbia effettuato l'accesso (`verify_jwt = false` in `config.toml`, perché le chiavi pubblicabili non sono JWT). Accetta solo file `.mxl/.musicxml/.xml` di `www.cpdl.org` fino a 5 MB. Rientra nel piano gratuito (500.000 chiamate al mese).

## 3. GitHub Pages

Indirizzo gratuito e senza scadenza: **https://ambrogiocorti.github.io/Jubilate/** (nessun dominio da acquistare o rinnovare).

- Il workflow `.github/workflows/deploy-pages.yml` esegue typecheck, test unitari e build a ogni push su `main` (o a mano da Actions → «Deploy to GitHub Pages») e pubblica `dist`.
- Una tantum: repository → Settings → Pages → Source: **GitHub Actions**. Il repository deve essere pubblico (Pages su repository privati richiede un piano a pagamento).
- Variabili (Settings → Secrets and variables → Actions → Variables; solo valori pubblicabili, già impostati come predefiniti nel workflow):
  - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` = chiave **pubblicabile** (`sb_publishable_…`). L'app rifiuta di avviarsi con una chiave segreta.
  - `CUSTOM_DOMAIN` (facoltativo) = dominio personalizzato; il workflow compila per la radice del sito e aggiunge il file `CNAME`.
- L'app è compilata con `BASE_PATH=/Jubilate/` (percorso base di Vite, del router e del manifest PWA). Il build copia `index.html` in `404.html` per le rotte della SPA e aggiunge `.nojekyll`.
- GitHub Pages non permette intestazioni HTTP personalizzate: la Content-Security-Policy è inserita come `<meta>` in `index.html` (vedi SECURITY.md). `public/_headers` e `public/_redirects` restano per un eventuale hosting su Cloudflare Pages.
- Se il progetto Supabase usa un dominio personalizzato, aggiungerlo alla CSP in `vite.config.ts`.

## 4. Controlli prima della pubblicazione

- [ ] `npm run typecheck && npm test && npm run test:db && npm run build`
- [ ] `npm run test:e2e` contro lo stack locale
- [ ] Prova manuale su telefono (Android e iOS) e computer: installazione, accesso, stanza con due dispositivi, uso offline
- [ ] Advisors di Supabase senza avvisi di sicurezza
- [ ] Canti caricati con fonte e diritti indicati

## 5. Backup e ripristino

- Il piano gratuito di Supabase non include backup giornalieri ripristinabili: esportare periodicamente il database con `npx supabase db dump --data-only -f backup-AAAA-MM-GG.sql` (e `--schema public` per lo schema) e conservare i file in un luogo sicuro.
- Il bucket `media` va copiato separatamente (CLI Storage o S3).
- Ripristino: nuovo progetto, `db push` delle migrazioni, poi `psql` del dump dei dati.
- Le revisioni dei canti e le versioni degli spartiti non vengono mai cancellate dall'app: un errore di modifica si annulla ripristinando una revisione dall'Amministrazione.
