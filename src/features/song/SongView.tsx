import { memo, useMemo } from 'react';
import { capoShape, formatChord, parseChord, parseKey, transposeChord, transposeKey, type Key } from '../../music/chord';
import type { Notation } from '../../music/pitch';
import { chordsFor, expandSequence, layoutLine, sectionTitle, type SongContent } from '../../domain/song';

export interface ChordOptions {
  transpose: number;
  capo: number;
  notation: Notation;
  /** Show the shapes to play with the capo next to the sounding chords. */
  showShapes: boolean;
}

interface Props {
  content: SongContent;
  showChords: boolean;
  chordOptions: ChordOptions;
  compactRepeats?: boolean;
  /** Key the chords are written in (content.key or song.original_key). */
  baseKey?: string | null;
}

export function displayKeys(baseKey: string | null | undefined, transpose: number, capo: number) {
  const from = parseKey(baseKey ?? null);
  const sounding = from ? transposeKey(from, transpose) : null;
  const shape = sounding && capo ? transposeKey(sounding, -capo) : null;
  return { from, sounding, shape };
}

/** Converts a written chord into what to display (transposed, capo, notation). */
export function renderChord(text: string, opts: ChordOptions, from: Key | null, sounding: Key | null): { main: string; shape?: string } {
  const chord = parseChord(text);
  if (!chord) return { main: text };
  const real = opts.transpose ? transposeChord(chord, opts.transpose, { from, to: sounding }) : chord;
  if (!opts.capo) return { main: formatChord(real, opts.notation) };
  const shape = capoShape(real, opts.capo, sounding);
  // With a capo the guitarist reads the shapes; the sounding chord is shown small.
  return opts.showShapes
    ? { main: formatChord(shape, opts.notation), shape: formatChord(real, opts.notation) }
    : { main: formatChord(real, opts.notation) };
}

export const SongView = memo(function SongView({ content, showChords, chordOptions, compactRepeats, baseKey }: Props) {
  const entries = useMemo(() => expandSequence(content), [content]);
  const { from, sounding } = useMemo(
    () => displayKeys(baseKey ?? content.key, chordOptions.transpose, chordOptions.capo),
    [baseKey, content.key, chordOptions.transpose, chordOptions.capo],
  );
  const chordCache = useMemo(() => new Map<string, { main: string; shape?: string }>(), [chordOptions, from, sounding]);
  const chord = (t: string) => {
    let r = chordCache.get(t);
    if (!r) {
      r = renderChord(t, chordOptions, from, sounding);
      chordCache.set(t, r);
    }
    return r;
  };

  return (
    <div className="song__body">
      {entries.map((entry) => {
        const { section } = entry;
        const title = sectionTitle(section, content);
        const compact = compactRepeats && entry.isRepeat;
        return (
          <section
            key={entry.index}
            className={`song-section song-section--${section.kind}${compact ? ' song-section--repeat-compact' : ''}`}
            aria-label={entry.isRepeat ? `${title} (ripetizione)` : title}
          >
            <span className="song-section__label" aria-hidden>{title}</span>
            <div className="song-section__body">
              {compact ? (
                <p className="song-line song-repeat-ref">{section.lines[0]} …</p>
              ) : (
                section.lines.map((line, i) => {
                  const placements = showChords ? chordsFor(content, section.key, i) : [];
                  if (!placements.length) {
                    return (
                      <p key={i} className={`song-line${line.trim() ? '' : ' song-line--empty'}`}>{line}</p>
                    );
                  }
                  return (
                    <p key={i} className="song-line song-line--chords">
                      {layoutLine(line, placements).map((seg, j) => {
                        const c = seg.chord ? chord(seg.chord) : null;
                        return (
                          <span className="seg" key={j}>
                            <span className="seg__chord" aria-hidden={!c}>
                              {c ? (
                                <>
                                  {c.main}
                                  {c.shape && <small>({c.shape})</small>}
                                </>
                              ) : null}
                            </span>
                            <span className="seg__text">{seg.text}</span>
                          </span>
                        );
                      })}
                    </p>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
});
