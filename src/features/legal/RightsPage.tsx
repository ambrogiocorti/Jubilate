import { env } from '../../lib/env';
import { LegalPage } from './LegalPage';

/** Who owns songs and scores, what may be added to Jubilate Deo and how to report a problem. */
export default function RightsPage() {
  const contact = env.privacyContact;
  return (
    <LegalPage title="Diritti dei canti e degli spartiti" updated="11 novembre 2026">
      <p>
        I testi e le musiche dei canti appartengono ai loro autori ed editori. Jubilate Deo è uno strumento gratuito della parrocchia
        per l'animazione liturgica e le prove del coro: non è una raccolta da distribuire né da vendere.
      </p>

      <section className="stack-sm" aria-labelledby="dr-what">
        <h2 id="dr-what">Cosa può stare in Jubilate Deo</h2>
        <ul>
          <li><strong>Canti di pubblico dominio</strong>: testi e musiche i cui autori sono morti da più di 70 anni, come i canti gregoriani e molti canti tradizionali (per esempio Adeste fideles o Tu scendi dalle stelle).</li>
          <li><strong>Opere proprie</strong>: canti, arrangiamenti o trascrizioni scritti da chi li inserisce.</li>
          <li><strong>Canti con permesso</strong>: canti per cui la parrocchia ha ottenuto l'autorizzazione dell'autore o dell'editore, o una licenza.</li>
          <li><strong>Spartiti con licenza libera</strong>: per esempio quelli marcati pubblico dominio o CC0, nel rispetto delle condizioni della licenza.</li>
        </ul>
        <p>
          Molti canti liturgici moderni sono protetti dal diritto d'autore, anche se si cantano ogni domenica. Non vanno inseriti
          senza il permesso dell'autore o dell'editore, anche se l'app è gratuita. Nel dubbio, non inserirli.
        </p>
      </section>

      <section className="stack-sm" aria-labelledby="dr-record">
        <h2 id="dr-record">Come lo indichiamo</h2>
        <p>
          Ogni canto e ogni spartito ha i campi <strong>Fonte</strong> e <strong>Diritti</strong> (pubblico dominio, opera propria,
          permesso ottenuto, licenza o sconosciuto). Chi inserisce un contenuto li compila e se ne assume la responsabilità; gli
          amministratori li controllano prima della pubblicazione.
        </p>
      </section>

      <section className="stack-sm" aria-labelledby="dr-sources">
        <h2 id="dr-sources">Spartiti dal catalogo e da CPDL</h2>
        <ul>
          <li>
            Il <strong>catalogo degli spartiti liberi</strong> proviene da PDMX (Long et al., 2024, zenodo.org/records/15571083, licenza CC BY 4.0):
            una raccolta di spartiti pubblicati su MuseScore, che i loro autori hanno dichiarato di pubblico dominio o CC0. La licenza è quella
            dichiarata dagli autori e non è stata verificata spartito per spartito: la fonte viene compilata automaticamente, controllala prima di pubblicare.
          </li>
          <li>
            Gli spartiti di <strong>CPDL</strong> (Choral Public Domain Library, cpdl.org) hanno ciascuno la propria licenza, indicata nella pagina CPDL dello spartito.
          </li>
        </ul>
      </section>

      <section className="stack-sm" aria-labelledby="dr-use">
        <h2 id="dr-use">Uso dei contenuti</h2>
        <p>
          Puoi usare canti e spartiti per la preghiera, la liturgia e le prove della parrocchia. Per copiarli, stamparli in quantità,
          pubblicarli altrove o registrarli valgono le regole del diritto d'autore e le condizioni di ciascuna licenza.
        </p>
      </section>

      <section className="stack-sm" aria-labelledby="dr-report">
        <h2 id="dr-report">Segnalare un problema</h2>
        <p>
          Se sei autore o editore di un canto presente in Jubilate Deo e non hai dato il permesso, o se trovi un contenuto con informazioni
          sui diritti sbagliate, scrivi {contact ? <>a <strong>{contact}</strong></> : "al parroco o all'amministratore dell'app"} indicando
          il titolo del canto. Il contenuto viene nascosto appena possibile e rimosso dopo la verifica.
        </p>
      </section>
    </LegalPage>
  );
}
