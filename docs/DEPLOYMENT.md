# Pubblicazione

Jubilate non è ancora pubblicata. Questa è la procedura prevista; i passi contrassegnati con 🔑 richiedono credenziali o decisioni del responsabile del progetto.

## 1. Progetto Supabase dedicato 🔑

1. Creare un progetto **nuovo e dedicato a Jubilate** (regione UE, ad esempio Francoforte; piano gratuito). Non riutilizzare database di altri progetti.
2. Applicare le migrazioni: `npx supabase link --project-ref <ref>` e `npx supabase db push`. **Non** applicare `supabase/seed.sql` in produzione.
3. Controllare gli avvisi di sicurezza e prestazioni (Advisors) del progetto.
4. Auth → URL Configuration: Site URL `https://<dominio>`; Redirect URLs `https://<dominio>/auth/callback` (più l'eventuale anteprima `https://*.jubilate.pages.dev/auth/callback`).
5. Auth → password: minimo 8 caratteri, lettere e numeri. Abilitare la conferma dell'email.
6. Primo amministratore: dopo la registrazione, dall'editor SQL del progetto
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = '<email>';
   ```
7. Impostazioni della parrocchia (nome, notazione, durata delle stanze) dalla sezione Amministrazione → Impostazioni.

## 2. Accesso con Google 🔑

Google Cloud Console → credenziali OAuth «Applicazione web» con URI di reindirizzamento `https://<ref>.supabase.co/auth/v1/callback`. Inserire Client ID e Client Secret in Supabase → Auth → Providers → Google. Il segreto resta in Supabase: non va mai nel codice o nelle variabili del frontend.

## 3. Cloudflare Pages 🔑

- Collegare il repository; comando di build `npm run build`; cartella di output `dist`; Node 22.
- Variabili d'ambiente (solo valori pubblicabili):
  - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` = chiave **pubblicabile** (`sb_publishable_…`). L'app rifiuta di avviarsi con una chiave segreta.
  - `VITE_SITE_URL` = `https://<dominio>`
- `public/_headers` imposta CSP e intestazioni di sicurezza; `public/_redirects` gestisce le rotte della SPA.
- Se il progetto Supabase usa un dominio personalizzato, aggiungerlo a `connect-src` e `img-src` nella CSP.

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
