import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { useAuth } from '../../app/AuthProvider';
import { searchSongs } from '../../domain/search';
import { Icon } from '../../components/ui/Icon';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState, ListSkeleton } from '../../components/ui/Feedback';
import type { CategoryKind } from '../../data/types';

const GROUPS: { kind: CategoryKind; label: string }[] = [
  { kind: 'mass_moment', label: 'Momenti della Messa' },
  { kind: 'liturgical_season', label: 'Tempi liturgici' },
  { kind: 'theme', label: 'Altro' },
  { kind: 'other', label: '' },
];

export function LibraryPage() {
  const { entries, categories, index, loading, error, fromCache, refresh } = useLibrary();
  const { isRegistered } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  // Several categories can be selected: ?cat=a,b,c
  const selected = useMemo(() => new Set((params.get('cat') ?? '').split(',').filter(Boolean)), [params]);
  const deferredQ = useDeferredValue(q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Within a group (e.g. two Mass moments) any category matches; across groups
  // (Mass moment + liturgical season) all must match.
  const categoryGroups = useMemo(() => {
    const byKind = new Map<string, string[]>();
    for (const c of categories) {
      if (!selected.has(c.id)) continue;
      byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c.id]);
    }
    return [...byKind.values()];
  }, [categories, selected]);

  const results = useMemo(
    () => searchSongs(index, deferredQ, { categoryGroups }),
    [index, deferredQ, categoryGroups],
  );

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const setSelected = (ids: Set<string>) => {
    const next = new URLSearchParams(params);
    if (ids.size) next.set('cat', [...ids].join(','));
    else next.delete('cat');
    setParams(next, { replace: true });
  };
  const toggleCat = (id: string) => {
    const ids = new Set(selected);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setSelected(ids);
  };

  const byId = new Map(categories.map((c) => [c.id, c]));
  const selectedNames = [...selected].map((id) => byId.get(id)?.name).filter(Boolean) as string[];

  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <h1>Libretto dei canti e accordi</h1>
          <p>{entries.length ? `${entries.length} canti disponibili` : 'La musica che unisce la comunità'}</p>
        </div>
        {isRegistered && (
          <ButtonLink to="/proposte/nuova?tipo=new_song" icon="plus">Proponi un canto</ButtonLink>
        )}
      </header>

      <div className="stack">
        <div className="search" role="search">
          <Icon name="search" />
          <label htmlFor="song-search" className="visually-hidden">Cerca per numero, titolo, parole del testo o autore</label>
          <input
            ref={inputRef}
            id="song-search"
            className="input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Numero, titolo, parole del testo…"
            value={q}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && (
            <Button className="search__clear" variant="ghost" size="sm" iconOnly icon="x" onClick={() => setQuery('')}>
              Cancella ricerca
            </Button>
          )}
        </div>

        {categories.length > 0 && (
          <details className="stack-sm" open={selected.size > 0}>
            <summary className="small muted" style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>
              <span aria-hidden="true" style={{ marginRight: 6 }}>▸</span>
              Filtra per categoria{selectedNames.length ? `: ${selectedNames.join(', ')}` : ''}
            </summary>
            <div className="stack" style={{ paddingTop: 'var(--space-2)' }}>
              <p className="small muted" style={{ margin: 0 }}>
                Puoi scegliere più categorie. Nello stesso gruppo basta una corrispondenza; tra gruppi diversi devono valere tutte.
              </p>
              {GROUPS.map((g) => {
                const items = categories.filter((c) => c.kind === g.kind);
                if (!items.length) return null;
                return (
                  <div key={g.kind} className="stack-sm">
                    {g.label && <div className="section-title">{g.label}</div>}
                    <div className="chips">
                      {items.map((c) => (
                        <button key={c.id} type="button" className="chip" aria-pressed={selected.has(c.id)} onClick={() => toggleCat(c.id)}>
                          {selected.has(c.id) && <Icon name="check" />}
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {selected.size > 0 && (
                <div>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => setSelected(new Set())}>
                    Rimuovi filtri ({selected.size})
                  </Button>
                </div>
              )}
            </div>
          </details>
        )}
      </div>

      {error && !entries.length && (
        <Alert tone="danger" title="Libretto non disponibile">
          {error} <Button size="sm" variant="ghost" onClick={() => void refresh()}>Riprova</Button>
        </Alert>
      )}
      {fromCache && error && entries.length > 0 && (
        <Alert tone="warning">Stai consultando la copia salvata sul dispositivo. {error}</Alert>
      )}

      <section aria-label="Risultati" aria-live="polite" aria-busy={loading}>
        {loading && !entries.length ? (
          <ListSkeleton />
        ) : results.length === 0 ? (
          entries.length === 0 ? (
            <EmptyState icon="library" title="Il libretto è ancora vuoto">
              I canti verranno inseriti progressivamente dagli amministratori della parrocchia.
            </EmptyState>
          ) : (
            <EmptyState icon="search" title="Nessun canto trovato" action={(q || selected.size) ? <Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>Azzera filtri</Button> : undefined}>
              Prova con il numero del libretto, una parola del titolo o un verso del testo.
            </EmptyState>
          )
        ) : (
          <>
            <p className="visually-hidden">{results.length} risultati</p>
            <ul role="list" className="list">
              {results.slice(0, 400).map((s) => (
                <li key={s.id}>
                  <Link to={`/canti/${s.id}`} className="list-row">
                    <span className="list-row__num">{s.number ?? '—'}</span>
                    <span className="list-row__main">
                      <span className="list-row__title">{s.title}</span>
                      <span className="list-row__meta">
                        {s.first_line}
                        {s.category_ids.length > 0 && ` · ${s.category_ids.map((id) => byId.get(id)?.name).filter(Boolean).slice(0, 2).join(', ')}`}
                      </span>
                    </span>
                    <span className="list-row__end"><Icon name="chevronRight" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
