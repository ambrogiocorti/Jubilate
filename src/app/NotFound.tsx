import { EmptyState } from '../components/ui/Feedback';
import { ButtonLink } from '../components/ui/Button';

export function NotFound() {
  return (
    <EmptyState icon="search" title="Pagina non trovata" action={<ButtonLink to="/" variant="primary">Torna al libretto</ButtonLink>}>
      L’indirizzo potrebbe essere errato oppure il contenuto non è più disponibile.
    </EmptyState>
  );
}
