import { Link } from 'react-router-dom';
import { env } from '../../lib/env';
import { LegalPage } from './LegalPage';

/**
 * Privacy notice (GDPR art. 13). It describes what this installation really
 * processes: keep it in sync with the database schema and the third-party
 * services listed in the CSP (vite.config.ts).
 */
export default function PrivacyPage() {
  const owner = env.privacyOwner || 'la parrocchia che gestisce questa installazione di Jubilate';
  const contact = env.privacyContact;
  return (
    <LegalPage title="Informativa sulla privacy" updated="11 novembre 2026">
      <p>
        Jubilate è l'app dei canti della parrocchia. È gratuita, non contiene pubblicità e non traccia gli utenti.
        Questa pagina spiega quali dati personali tratta, perché e quali diritti hai, come previsto dal Regolamento
        europeo 2016/679 (GDPR).
      </p>

      <section className="stack-sm" aria-labelledby="pv-owner">
        <h2 id="pv-owner">Chi tratta i dati</h2>
        <p>
          Il titolare del trattamento è {owner}{env.privacyOwner ? ', che gestisce Jubilate per la comunità parrocchiale' : ''}.{' '}
          {contact
            ? <>Per qualsiasi richiesta sulla privacy puoi scrivere a <strong>{contact}</strong>.</>
            : <>Per qualsiasi richiesta sulla privacy rivolgiti al parroco o all'amministratore dell'app.</>}
        </p>
      </section>

      <section className="stack-sm" aria-labelledby="pv-what">
        <h2 id="pv-what">Quali dati raccogliamo</h2>
        <p>Per consultare i canti non serve un account e non raccogliamo dati personali. Se ti registri trattiamo:</p>
        <ul>
          <li><strong>Dati dell'account</strong>: indirizzo e-mail, nome visualizzato e password (conservata solo in forma cifrata, nessuno può leggerla).</li>
          <li><strong>Ruolo nella parrocchia</strong>: utente, direttore del coro o amministratore, e le eventuali richieste di diventare direttore con la motivazione che scrivi.</li>
          <li><strong>Contenuti che crei</strong>: preferiti, raccolte, versioni personali dei canti, spartiti, proposte di modifica, scalette delle celebrazioni, note delle prove e file che carichi.</li>
          <li><strong>Partecipazione alle stanze</strong>: le stanze in cui entri durante una celebrazione o una prova.</li>
          <li><strong>Registri tecnici</strong>: le operazioni di modifica e amministrazione (chi ha fatto cosa e quando), e i contatori usati per limitare gli abusi. I fornitori del servizio conservano anche registri di accesso con l'indirizzo IP, per sicurezza.</li>
        </ul>
        <p>Non raccogliamo dati di pagamento, posizione o contatti, e non usiamo cookie di profilazione né strumenti di statistica.</p>
      </section>

      <section className="stack-sm" aria-labelledby="pv-why">
        <h2 id="pv-why">Perché e su quale base</h2>
        <ul>
          <li>Per fornirti l'app e le funzioni che usi, come accesso, raccolte, stanze e scalette (esecuzione del servizio che richiedi, art. 6.1.b GDPR).</li>
          <li>Per proteggere l'app da abusi e tenere traccia delle modifiche ai canti (legittimo interesse della parrocchia, art. 6.1.f).</li>
          <li>Per inviarti solo e-mail di servizio: conferma della registrazione e recupero della password. Non inviamo newsletter né pubblicità.</li>
        </ul>
      </section>

      <section className="stack-sm" aria-labelledby="pv-where">
        <h2 id="pv-where">Dove sono i dati e chi li vede</h2>
        <ul>
          <li><strong>Supabase</strong> conserva database, account e file su server nell'Unione europea (Francoforte) e invia le e-mail di servizio.</li>
          <li><strong>GitHub Pages</strong> (GitHub, Inc., Stati Uniti) pubblica il sito e registra gli accessi tecnici. Il trasferimento avviene con le garanzie previste dal GDPR (EU-US Data Privacy Framework e clausole contrattuali standard).</li>
          <li>Solo quando usi la funzione corrispondente: <strong>YouTube</strong> (in modalità senza cookie) per i video dei canti, e <strong>jsDelivr</strong> per scaricare il riconoscimento del testo (OCR) usato dagli amministratori.</li>
        </ul>
        <p>
          Gli altri utenti vedono solo il tuo nome visualizzato, e solo dove serve, per esempio nelle stanze o nelle proposte.
          Gli amministratori della parrocchia vedono i dati necessari a gestire l'app. Non vendiamo né cediamo i dati a nessuno.
        </p>
      </section>

      <section className="stack-sm" aria-labelledby="pv-device">
        <h2 id="pv-device">Dati sul tuo dispositivo</h2>
        <p>
          Per funzionare anche offline l'app salva sul dispositivo i canti scaricati, le tue preferenze di lettura, le bozze non ancora salvate
          e la sessione di accesso (archivio locale del browser). Questi dati restano sul dispositivo: puoi cancellarli uscendo dall'account
          o cancellando i dati del sito dalle impostazioni del browser.
        </p>
      </section>

      <section className="stack-sm" aria-labelledby="pv-time">
        <h2 id="pv-time">Per quanto tempo</h2>
        <p>
          Conserviamo i dati finché il tuo account è attivo. Quando elimini il tuo account (dal profilo, con il tasto «Elimina il mio account») cancelliamo subito i dati personali e i contenuti
          privati. I canti, gli spartiti e le modifiche che hai pubblicato per la parrocchia possono restare, senza il tuo nome. I registri
          tecnici sono conservati solo per il tempo necessario alla sicurezza.
        </p>
      </section>

      <section className="stack-sm" aria-labelledby="pv-rights">
        <h2 id="pv-rights">I tuoi diritti</h2>
        <p>
          Puoi chiedere in qualsiasi momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento, opporti
          o riceverne una copia (artt. 15-22 GDPR). Il nome e la password si cambiano e l'account si elimina direttamente dal <Link to="/profilo">profilo</Link>;
          per il resto scrivi {contact ? <strong>{contact}</strong> : "al parroco o all'amministratore dell'app"}. Rispondiamo entro un mese.
          Se ritieni che i tuoi dati siano trattati in modo non corretto puoi rivolgerti al Garante per la protezione dei dati personali (garanteprivacy.it).
        </p>
        <p>L'app è pensata per la comunità parrocchiale: chi ha meno di 14 anni può registrarsi solo con il consenso di un genitore.</p>
      </section>
    </LegalPage>
  );
}
