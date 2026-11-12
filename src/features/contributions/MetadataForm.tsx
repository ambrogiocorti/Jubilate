import { Field } from '../../components/ui/Field';
import type { Category } from '../../data/types';

export interface SongMeta {
  number?: number | null;
  title?: string;
  alt_titles?: string[];
  author?: string | null;
  composer?: string | null;
  original_key?: string | null;
  time_signature?: string | null;
  tempo_bpm?: number | null;
}

export function MetadataForm({ value, onChange, categories, categoryIds, onCategories }: {
  value: SongMeta;
  onChange: (v: SongMeta) => void;
  categories?: Category[];
  categoryIds?: string[];
  onCategories?: (ids: string[]) => void;
}) {
  const set = (patch: Partial<SongMeta>) => onChange({ ...value, ...patch });
  return (
    <div className="form">
      <div className="form-row">
        <Field label="Titolo"><input className="input" maxLength={200} value={value.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Numero del libretto" hint="Facoltativo.">
          <input className="input" inputMode="numeric" value={value.number ?? ''} onChange={(e) => set({ number: e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null })} />
        </Field>
      </div>
      <Field label="Titoli alternativi" hint="Separati da punto e virgola.">
        <input className="input" value={(value.alt_titles ?? []).join('; ')} onChange={(e) => set({ alt_titles: e.target.value.split(';').map((s) => s.trim()).filter(Boolean).slice(0, 10) })} />
      </Field>
      <div className="form-row">
        <Field label="Autore del testo"><input className="input" maxLength={200} value={value.author ?? ''} onChange={(e) => set({ author: e.target.value || null })} /></Field>
        <Field label="Compositore"><input className="input" maxLength={200} value={value.composer ?? ''} onChange={(e) => set({ composer: e.target.value || null })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Tonalità originale" hint="Es. G, Dm, Bb."><input className="input" maxLength={4} value={value.original_key ?? ''} onChange={(e) => set({ original_key: e.target.value.trim() || null })} /></Field>
        <Field label="Tempo musicale" hint="Es. 4/4, 3/4, 6/8."><input className="input" maxLength={5} value={value.time_signature ?? ''} onChange={(e) => set({ time_signature: e.target.value.trim() || null })} /></Field>
        <Field label="Metronomo (BPM)"><input className="input" inputMode="numeric" value={value.tempo_bpm ?? ''} onChange={(e) => set({ tempo_bpm: e.target.value ? Number(e.target.value.replace(/\D/g, '')) || null : null })} /></Field>
      </div>
      {categories && onCategories && (
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Categorie</legend>
          <div className="chips">
            {categories.map((c) => {
              const on = categoryIds?.includes(c.id) ?? false;
              return (
                <button key={c.id} type="button" className="chip" aria-pressed={on} onClick={() => onCategories(on ? (categoryIds ?? []).filter((x) => x !== c.id) : [...(categoryIds ?? []), c.id])}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function metaFromSong(s: Record<string, unknown>): SongMeta {
  return {
    number: (s.number as number | null) ?? null,
    title: (s.title as string) ?? '',
    alt_titles: (s.alt_titles as string[]) ?? [],
    author: (s.author as string | null) ?? null,
    composer: (s.composer as string | null) ?? null,
    original_key: (s.original_key as string | null) ?? null,
    time_signature: (s.time_signature as string | null) ?? null,
    tempo_bpm: (s.tempo_bpm as number | null) ?? null,
  };
}
