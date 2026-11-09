# Prossimi passi

## Da completare prima della pubblicazione

1. Progetto Supabase dedicato, credenziali Google OAuth e progetto Cloudflare Pages (vedi DEPLOYMENT.md).
2. Verifica nell'ambiente reale: email di conferma, accesso con Google, Storage, Realtime attraverso Internet.
3. Prove manuali su iPhone/Safari e Firefox; audit di accessibilità con lettori di schermo (VoiceOver, TalkBack, NVDA).
4. Caricamento dei canti del libretto da parte degli amministratori, con fonte e diritti.

## Miglioramenti previsti

- Test end-to-end per raccolte, celebrazioni e prove, registrazioni, amministrazione delle categorie e degli utenti.
- OCR: verifica su scansioni reali del libretto; ospitare in locale motore e dati di Tesseract per non dipendere dalla CDN.
- Editor di spartiti: più voci per pentagramma, terzine, dinamiche e articolazioni (oggi conservate ma non modificabili).
- Esportazione PDF degli spartiti (oggi si stampa il testo e si esporta MusicXML).
- Notifiche push per l'esito delle proposte.
- Più parrocchie nella stessa installazione (lo schema ha già `parish_id`; mancano interfaccia e inviti).
- Statistiche d'uso aggregate e anonime per l'amministratore.
- Riduzione del peso iniziale: il motore Verovio (~8 MB) è già caricato solo quando serve; valutare un Web Worker per il rendering di spartiti lunghi.
