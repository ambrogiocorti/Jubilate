import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import {
  counts, createCategory, deleteCategory, fetchParish, listActivity, listDirectorRequests, listRooms, listUsers, reviewDirectorRequest,
  setRole, setSuspended, updateCategory, updateParish,
  type ActivityRow, type AdminRoom, type AdminUser, type DirectorRequestRow, type ParishSettings,
} from '../../data/admin';
import { closeRoom } from '../../data/rooms';
import type { CategoryKind } from '../../data/types';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, ListSkeleton, Spinner } from '../../components/ui/Feedback';
import { NotFound } from '../../app/NotFound';
import { AdminSongEditor, AdminSongList } from './AdminSongs';
import { AdminContributionList, AdminContributionReview } from './AdminContributions';
import { AdminRecordings, AdminScores } from './AdminMedia';

const SECTIONS: [string, string][] = [
  ['', 'Panoramica'], ['canti', 'Canti'], ['proposte', 'Proposte'], ['utenti', 'Utenti'], ['direttori', 'Richieste direttore'],
  ['categorie', 'Categorie'], ['spartiti', 'Spartiti'], ['registrazioni', 'Registrazioni'], ['stanze', 'Stanze'],
  ['attivita', 'Attività'], ['impostazioni', 'Impostazioni'], ['diritti', 'Diritti e fonti'],
];

export default function AdminRoutes() {
  return (
    <div className="container stack">
      <div className="page-header__text">
        <h1>Amministrazione</h1>
      </div>
      <nav className="tabs" aria-label="Sezioni dell'amministrazione">
        {SECTIONS.map(([path, label]) => (
          <NavLink key={path} to={`/admin${path ? `/${path}` : ''}`} end={!path} className="tab">{label}</NavLink>
        ))}
      </nav>
      <div style={{ paddingTop: 'var(--space-4)' }}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="canti" element={<AdminSongList />} />
          <Route path="canti/:songId" element={<AdminSongEditor />} />
          <Route path="proposte" element={<AdminContributionList />} />
          <Route path="proposte/:contributionId" element={<AdminContributionReview />} />
          <Route path="utenti" element={<Users />} />
          <Route path="direttori" element={<DirectorRequests />} />
          <Route path="categorie" element={<Categories />} />
          <Route path="spartiti" element={<AdminScores />} />
          <Route path="registrazioni" element={<AdminRecordings />} />
          <Route path="stanze" element={<Rooms />} />
          <Route path="attivita" element={<Activity />} />
          <Route path="impostazioni" element={<Settings />} />
          <Route path="diritti" element={<Rights />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

function Overview() {
  const [c, setC] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { counts().then(setC).catch((e) => setError(friendlyError(e))); }, []);
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!c) return <Spinner />;
  const tiles: [string, number, string, string][] = [
    ['Canti nel catalogo', c.songs!, `${c.published} pubblicati`, '/admin/canti'],
    ['Proposte da valutare', c.contributions!, 'inviate o in revisione', '/admin/proposte'],
    ['Richieste direttore', c.directorRequests!, 'in attesa', '/admin/direttori'],
    ['Registrazioni in attesa', c.pendingMedia!, 'da approvare', '/admin/registrazioni'],
    ['Spartiti ufficiali', c.officialScores!, 'nel catalogo', '/admin/spartiti'],
  ];
  return (
    <div className="stack-lg">
      <div className="admin-grid">
        {tiles.map(([label, n, sub, to]) => (
          <NavLink key={label} to={to} className="panel panel__body stat" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="small muted">{label}</span>
            <strong style={{ fontSize: 'var(--text-2xl)', fontVariantNumeric: 'tabular-nums' }}>{n}</strong>
            <span className="small muted">{sub}</span>
          </NavLink>
        ))}
      </div>
      <div className="row">
        <ButtonLink to="/admin/canti/nuovo" variant="primary" icon="plus">Nuovo canto</ButtonLink>
        <ButtonLink to="/admin/canti/nuovo?importa=1" icon="upload">Importa testo</ButtonLink>
        <ButtonLink to="/spartiti/nuovo" icon="music">Nuovo spartito</ButtonLink>
      </div>
    </div>
  );
}

function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspend, setSuspend] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const load = (search = q) => listUsers(search).then(setUsers).catch((e) => setError(friendlyError(e)));
  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const toggleRole = async (u: AdminUser, role: 'director' | 'admin') => {
    try { await setRole(u.id, role, !u.roles.includes(role)); toast.success('Ruoli aggiornati.'); void load(); }
    catch (e) { toast.error(friendlyError(e)); }
  };
  return (
    <div className="stack">
      <h2>Utenti</h2>
      <input className="input" type="search" placeholder="Nome o email…" aria-label="Cerca utenti" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <Alert tone="danger">{error}</Alert>}
      {!users ? <ListSkeleton /> : users.length === 0 ? <EmptyState icon="users" title="Nessun utente" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Utente</th><th>Ruoli</th><th>Stato</th><th><span className="visually-hidden">Azioni</span></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.display_name || '—'}</strong><div className="small muted">{u.email}{!u.email_confirmed && ' · email non confermata'}</div></td>
                  <td className="small">{u.roles.length ? u.roles.map((r) => (r === 'admin' ? 'Amministratore' : 'Direttore')).join(', ') : 'Utente'}</td>
                  <td>{u.is_suspended ? <span className="badge badge--danger">Sospeso</span> : <span className="badge badge--success">Attivo</span>}</td>
                  <td>
                    <div className="row row--end" style={{ gap: 'var(--space-1)' }}>
                      <Button size="sm" onClick={() => void toggleRole(u, 'director')}>{u.roles.includes('director') ? 'Revoca direttore' : 'Rendi direttore'}</Button>
                      <Button size="sm" disabled={u.id === me?.id} onClick={() => void toggleRole(u, 'admin')}>{u.roles.includes('admin') ? 'Revoca admin' : 'Rendi admin'}</Button>
                      <Button size="sm" variant={u.is_suspended ? 'default' : 'danger-soft'} disabled={u.id === me?.id}
                        onClick={async () => {
                          if (u.is_suspended) {
                            try { await setSuspended(u.id, false); void load(); } catch (e) { toast.error(friendlyError(e)); }
                          } else { setReason(''); setSuspend(u); }
                        }}>{u.is_suspended ? 'Riattiva' : 'Sospendi'}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!suspend} onClose={() => setSuspend(null)} title={`Sospendere ${suspend?.display_name || suspend?.email}?`}
        footer={<><Button onClick={() => setSuspend(null)}>Annulla</Button><Button variant="danger" onClick={async () => {
          if (!suspend) return;
          try { await setSuspended(suspend.id, true, reason || undefined); setSuspend(null); void load(); toast.success('Utente sospeso.'); }
          catch (e) { toast.error(friendlyError(e)); }
        }}>Sospendi</Button></>}>
        <div className="stack">
          <p>L'utente potrà ancora leggere i testi pubblici, ma perderà l'accesso alle funzioni riservate e alle stanze.</p>
          <Field label="Motivo (interno)"><input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

function DirectorRequests() {
  const toast = useToast();
  const [items, setItems] = useState<DirectorRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = () => listDirectorRequests().then(setItems).catch((e) => setError(friendlyError(e)));
  useEffect(() => { void load(); }, []);
  const decide = async (r: DirectorRequestRow, approve: boolean) => {
    try { await reviewDirectorRequest(r.id, approve, notes[r.id]); toast.success(approve ? 'Ruolo di direttore assegnato.' : 'Richiesta respinta.'); void load(); }
    catch (e) { toast.error(friendlyError(e)); }
  };
  return (
    <div className="stack">
      <h2>Richieste del ruolo di direttore</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      {!items ? <ListSkeleton /> : items.length === 0 ? <EmptyState icon="radio" title="Nessuna richiesta" /> : (
        <ul role="list" className="list">
          {items.map((r) => (
            <li key={r.id} className="list-row stack-sm">
              <div className="row row--between">
                <strong>{r.profile?.display_name || 'Utente'}</strong>
                <span className="small muted">{new Date(r.created_at).toLocaleString('it-IT')} · {r.status === 'pending' ? 'in attesa' : r.status === 'approved' ? 'approvata' : r.status === 'rejected' ? 'respinta' : 'annullata'}</span>
              </div>
              <p className="small">{r.motivation}</p>
              {r.status === 'pending' ? (
                <div className="row">
                  <input className="input grow" placeholder="Nota per l'utente (facoltativa)" aria-label="Nota per l'utente" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <Button variant="primary" size="sm" onClick={() => void decide(r, true)}>Approva</Button>
                  <Button variant="danger-soft" size="sm" onClick={() => void decide(r, false)}>Respingi</Button>
                </div>
              ) : r.review_note && <p className="small muted">Nota: {r.review_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_LABEL: Record<CategoryKind, string> = { mass_moment: 'Momento della Messa', liturgical_season: 'Tempo liturgico', theme: 'Tema', other: 'Altro' };
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

function Categories() {
  const { categories, refresh } = useLibrary();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', kind: 'theme' as CategoryKind });
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [all, setAll] = useState(categories);
  const load = async () => {
    const { fetchCategories } = await import('../../data/library');
    setAll(await fetchCategories(true));
    void refresh();
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    const slug = slugify(form.name);
    if (form.name.trim().length < 2 || slug.length < 2) return toast.error('Nome troppo corto.');
    try {
      await createCategory({ name: form.name.trim(), slug, kind: form.kind, sort_order: (Math.max(0, ...all.map((c) => c.sort_order)) + 10) });
      setForm({ ...form, name: '' });
      await load();
    } catch (e) { toast.error(friendlyError(e)); }
  };
  const kinds = Object.keys(KIND_LABEL) as CategoryKind[];
  return (
    <div className="stack">
      <h2>Categorie</h2>
      <div className="row">
        <input className="input grow" placeholder="Nuova categoria" aria-label="Nome della nuova categoria" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <select className="select" style={{ width: 'auto' }} aria-label="Tipo" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CategoryKind })}>
          {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <Button variant="primary" icon="plus" onClick={add}>Aggiungi</Button>
      </div>
      {kinds.map((k) => {
        const list = all.filter((c) => c.kind === k).sort((a, b) => a.sort_order - b.sort_order);
        if (!list.length) return null;
        return (
          <section key={k} className="stack-sm">
            <h3 className="section-title">{KIND_LABEL[k]}</h3>
            <ul role="list" className="list">
              {list.map((c, i) => (
                <li key={c.id} className="list-row row row--between">
                  <input className="input" style={{ maxWidth: 320 }} aria-label={`Nome di ${c.name}`} defaultValue={c.name} maxLength={80}
                    onBlur={async (e) => { const v = e.target.value.trim(); if (v && v !== c.name) { try { await updateCategory(c.id, { name: v }); await load(); } catch (err) { toast.error(friendlyError(err)); } } }} />
                  <div className="row" style={{ gap: 'var(--space-1)' }}>
                    {c.archived_at && <span className="badge">archiviata</span>}
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={async () => { const prev = list[i - 1]!; await updateCategory(c.id, { sort_order: prev.sort_order }); await updateCategory(prev.id, { sort_order: c.sort_order }); await load(); }}>↑<span className="visually-hidden"> Sposta su</span></Button>
                    <Button size="sm" variant="ghost" disabled={i === list.length - 1} onClick={async () => { const next = list[i + 1]!; await updateCategory(c.id, { sort_order: next.sort_order }); await updateCategory(next.id, { sort_order: c.sort_order }); await load(); }}>↓<span className="visually-hidden"> Sposta giù</span></Button>
                    <Button size="sm" onClick={async () => { await updateCategory(c.id, { archived_at: c.archived_at ? null : new Date().toISOString() }); await load(); }}>{c.archived_at ? 'Ripristina' : 'Archivia'}</Button>
                    <Button size="sm" variant="ghost" icon="trash" iconOnly onClick={() => setToDelete(c.id)}>Elimina {c.name}</Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <ConfirmDialog open={!!toDelete} title="Eliminare la categoria?" message="La categoria sarà rimossa da tutti i canti. Se vuoi solo nasconderla, archiviala." confirmLabel="Elimina" destructive
        onCancel={() => setToDelete(null)}
        onConfirm={async () => { if (!toDelete) return; try { await deleteCategory(toDelete); setToDelete(null); await load(); } catch (e) { toast.error(friendlyError(e)); } }} />
    </div>
  );
}

function Rooms() {
  const toast = useToast();
  const [rooms, setRooms] = useState<AdminRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => listRooms().then(setRooms).catch((e) => setError(friendlyError(e)));
  useEffect(() => { void load(); }, []);
  return (
    <div className="stack">
      <h2>Stanze</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      {!rooms ? <ListSkeleton /> : rooms.length === 0 ? <EmptyState icon="radio" title="Nessuna stanza" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Stanza</th><th>Codice</th><th>Direttore</th><th>Stato</th><th>Scadenza</th><th><span className="visually-hidden">Azioni</span></th></tr></thead>
            <tbody>
              {rooms.map((r) => {
                const active = r.status === 'active' && new Date(r.expires_at) > new Date();
                return (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{active ? r.code : '—'}</td>
                    <td className="small">{r.director?.display_name || '—'}</td>
                    <td>{active ? <span className="badge badge--success">Attiva</span> : <span className="badge">Terminata</span>}</td>
                    <td className="small muted">{new Date(r.expires_at).toLocaleString('it-IT')}</td>
                    <td>{active && <Button size="sm" variant="danger-soft" onClick={async () => { try { await closeRoom(r.id); void load(); } catch (e) { toast.error(friendlyError(e)); } }}>Chiudi</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'song.created': 'Canto creato', 'song.updated': 'Canto modificato', 'song.deleted': 'Canto eliminato', 'song.restored': 'Canto ripristinato',
  'song.revision_restored': 'Revisione ripristinata', 'contribution.approved': 'Proposta approvata', 'contribution.rejected': 'Proposta rifiutata',
  'director_request.created': 'Richiesta direttore', 'director_request.approved': 'Direttore approvato', 'director_request.rejected': 'Richiesta direttore respinta',
  'role.granted': 'Ruolo assegnato', 'role.revoked': 'Ruolo revocato', 'user.suspended': 'Utente sospeso', 'user.reinstated': 'Utente riattivato',
  'room.created': 'Stanza creata', 'room.closed': 'Stanza chiusa', 'room.member_revoked': 'Partecipante rimosso',
};

function Activity() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  useEffect(() => { listActivity(100).then((r) => { setRows(r); setMore(r.length === 100); }).catch((e) => setError(friendlyError(e))); }, []);
  return (
    <div className="stack">
      <h2>Registro attività</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      {!rows ? <ListSkeleton /> : rows.length === 0 ? <EmptyState icon="history" title="Nessuna attività" /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Dettagli</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('it-IT')}</td>
                    <td className="small">{r.actor?.display_name || '—'}</td>
                    <td className="small">{ACTION_LABEL[r.action] ?? r.action}</td>
                    <td className="small muted">{Object.keys(r.details ?? {}).length ? JSON.stringify(r.details) : r.entity_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {more && <div><Button onClick={async () => { const next = await listActivity(100, rows[rows.length - 1]!.created_at); setRows([...rows, ...next]); setMore(next.length === 100); }}>Carica altre</Button></div>}
        </>
      )}
    </div>
  );
}

function Settings() {
  const toast = useToast();
  const [p, setP] = useState<{ id: string; name: string; settings: ParishSettings } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchParish().then(setP).catch((e) => toast.error(friendlyError(e))); }, [toast]);
  if (!p) return <Spinner />;
  const s = p.settings;
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h2>Impostazioni della parrocchia</h2>
      <Field label="Nome della parrocchia"><input className="input" maxLength={160} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <Field label="Notazione predefinita degli accordi" hint="Usata per i nuovi utenti e per le stampe.">
        <select className="select" value={s.chord_notation ?? 'italian'} onChange={(e) => setP({ ...p, settings: { ...s, chord_notation: e.target.value as ParishSettings['chord_notation'] } })}>
          <option value="italian">Italiana (Do, Re, Mi)</option><option value="international">Internazionale (C, D, E)</option>
        </select>
      </Field>
      <Field label="Durata delle stanze (ore)" hint="Dopo questo tempo una stanza scade automaticamente (1–24).">
        <input className="input" type="number" min={1} max={24} value={s.room_ttl_hours ?? 6} onChange={(e) => setP({ ...p, settings: { ...s, room_ttl_hours: Math.max(1, Math.min(24, Number(e.target.value) || 6)) } })} />
      </Field>
      <Field label="Email di contatto (facoltativa)"><input className="input" type="email" value={s.contact_email ?? ''} onChange={(e) => setP({ ...p, settings: { ...s, contact_email: e.target.value } })} /></Field>
      <Field label="Messaggio di benvenuto (facoltativo)"><textarea className="textarea" rows={3} maxLength={500} value={s.welcome_message ?? ''} onChange={(e) => setP({ ...p, settings: { ...s, welcome_message: e.target.value } })} /></Field>
      <div><Button variant="primary" loading={busy} onClick={async () => {
        setBusy(true);
        try { await updateParish(p.id, p.name.trim(), p.settings); toast.success('Impostazioni salvate.'); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
      }}>Salva</Button></div>
    </div>
  );
}

function Rights() {
  const { entries } = useLibrary();
  const unknown = entries.filter((e) => e.text_rights === 'unknown');
  const noSource = entries.filter((e) => !e.text_source);
  return (
    <div className="stack">
      <h2>Diritti e fonti</h2>
      <Alert tone="info">Jubilate Deo pubblica solo testi e musiche di cui la parrocchia dispone: opere proprie, pubblico dominio, materiale autorizzato o coperto da licenza. Qui trovi i canti pubblicati per cui mancano informazioni.</Alert>
      <section className="stack-sm">
        <h3 className="section-title">Diritti da verificare ({unknown.length})</h3>
        {unknown.length === 0 ? <p className="small muted">Nessuno.</p> : (
          <ul role="list" className="list">{unknown.map((e) => <li key={e.id} className="list-row"><NavLink to={`/admin/canti/${e.id}`}>{e.number ? `${e.number}. ` : ''}{e.title}</NavLink></li>)}</ul>
        )}
      </section>
      <section className="stack-sm">
        <h3 className="section-title">Fonte non indicata ({noSource.length})</h3>
        {noSource.length === 0 ? <p className="small muted">Nessuno.</p> : (
          <ul role="list" className="list">{noSource.map((e) => <li key={e.id} className="list-row"><NavLink to={`/admin/canti/${e.id}`}>{e.number ? `${e.number}. ` : ''}{e.title}</NavLink></li>)}</ul>
        )}
      </section>
    </div>
  );
}
