# Funzionalità

Stato al 9 novembre 2026. «Verificato» indica una verifica automatica nel browser contro lo stack Supabase locale (vedi TESTING.md); nessuna funzione è ancora stata verificata su un progetto Supabase in cloud.

| Area | Cosa c'è | Stato |
|---|---|---|
| Accesso | Registrazione e accesso con email e password, recupero e reimpostazione password, sessione PKCE (l'accesso con Google è stato rimosso) | Email/password verificati |
| Biblioteca | Elenco numerato, ricerca per numero, titolo, titoli alternativi, testo, autore, insensibile ad accenti e maiuscole; filtri per più categorie insieme | Verificato (A) e test unitari dei filtri |
| Lettura | Modalità testo, accordi, spartito; trasposizione con alterazioni corrette; capotasto con accordi da suonare; notazione italiana o internazionale; dimensione e interlinea; ripetizioni complete o compatte; tema chiaro/scuro; schermo intero con schermo sempre acceso; scorrimento automatico | Verificato (B) per accordi e trasposizione |
| Versioni personali | Copia modificabile, ufficiale intatta; editor di testo e accordi con annulla/ripeti; cronologia, confronto, ripristino; conflitti tra dispositivi; condivisione con link; proposta come ufficiale | Verificato (B) per creazione e salvataggio |
| Spartiti | Ricerca su CPDL aperta con il titolo del canto e caricamento del file scaricato (anteprima e fonte precompilate); importazione .musicxml/.xml/.mxl, visualizzazione Verovio, selezione delle note con tocco o tastiera, modifica di altezza, alterazioni, durate, punti, pause, note e accordi, legature, testo, sigle, battute, tonalità, tempo, chiave; controllo delle battute; annulla/ripeti; cronologia delle versioni; esportazione MusicXML che conserva il contenuto non modificato | Verificato (C, M) e test unitari dei 7 passi del prototipo |
| Preferiti e raccolte | Preferiti, raccolte personali/celebrazione/prova, ordine, duplicazione, condivisione, stampa | Implementato, non coperto da test e2e |
| Proposte | Nuovo canto, correzione, accordi, informazioni, arrangiamento, spartito, registrazione; bozza → inviata → in revisione → approvata/rifiutata; l'approvazione crea una nuova revisione; conflitto se l'ufficiale è cambiato | Verificato (D) per correzione e approvazione |
| Direttore | Richiesta del ruolo, approvazione dell'amministratore, creazione di stanze | Verificato (E) |
| Stanze in diretta | Codice di 6 cifre con scadenza e limiti ai tentativi; diretta e navigazione libera; «Torna alla diretta» senza codice anche dopo il ricaricamento; avviso quando il direttore cambia canto; riconnessione automatica; scalette | Verificato (F, G, H) |
| Celebrazioni e prove | Celebrazioni con scaletta e momenti, duplicazione, note di prova personali o condivise, stampa | Implementato, non coperto da test e2e |
| Strumenti | Metronomo Web Audio (tap tempo, accenti) | Logica testata; audio non verificabile in automatico |
| Registrazioni | Audio caricati (bucket privato, URL firmati), YouTube solo incorporato; approvazione dell'amministratore | Implementato, non coperto da test e2e |
| Offline | Interfaccia in cache, libreria e canti in IndexedDB, salvataggio di tutti i canti, coda delle modifiche senza sovrascritture silenziose | Verificato (I) per la consultazione offline |
| Importazione | Testo incollato, PDF con testo, PDF scansionati e immagini con OCR nel browser; revisione manuale obbligatoria; rilevamento duplicati | Riconoscimento della struttura testato; OCR non verificato in automatico (scarica ~15 MB di dati) |
| Stampa | Stampa di celebrazioni e raccolte come testo reale (non immagini) | Implementato |
| Amministrazione | Panoramica, canti (revisioni, ripristino, eliminazione reversibile), proposte, utenti e ruoli, richieste direttore, categorie, spartiti, registrazioni, stanze, registro attività, impostazioni, diritti e fonti | Proposte e richieste verificate (D, E); il resto implementato |
| PWA | Installabile, icone, aggiornamento solo su conferma dell'utente | Verificato (service worker attivo nel test I) |
| Accessibilità | Struttura semantica, etichette, focus visibile, contrasto, riduzione del movimento | Controlli automatici axe (WCAG 2.2 A/AA) superati su 8 pagine; audit manuale da fare |
