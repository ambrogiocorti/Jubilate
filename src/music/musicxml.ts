/**
 * Editable MusicXML model.
 *
 * The XML document itself is the model: edits are applied to the DOM of the
 * imported file, so everything the editor does not understand (layout,
 * articulations, credits, other parts...) is preserved on export. Every <note>
 * gets a stable `id` attribute (valid MusicXML 3.1+), which Verovio keeps in the
 * rendered SVG; that is how a click on the score maps to the note to edit.
 *
 * Supported edits: pitch (step/alter/octave), duration and dots, rest <-> note,
 * delete (becomes a rest of the same duration), insert note / chord note,
 * accidentals, ties, slurs, lyrics, chord symbols (<harmony>), measures
 * (append/delete), key, time signature and clef changes. Voices are edited
 * note by note (each note keeps its voice and staff).
 */
import { parseChord } from './chord';

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export type NoteType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd';
export const NOTE_TYPES: NoteType[] = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd'];
const TYPE_QUARTERS: Record<NoteType, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125 };

export interface Pitch {
  step: Step;
  alter: number;
  octave: number;
}

export interface NoteInfo {
  id: string;
  partId: string;
  measure: string;
  measureIndex: number;
  isRest: boolean;
  isChord: boolean;
  pitch: Pitch | null;
  type: NoteType | null;
  dots: number;
  duration: number;
  voice: string;
  staff: string;
  tieStart: boolean;
  tieStop: boolean;
  slurStart: boolean;
  slurStop: boolean;
  lyric: string;
  syllabic: string | null;
  harmony: string | null;
}

export class MusicXmlError extends Error {}

// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------

export function parseMusicXml(text: string): Document {
  if (text.length > 5 * 1024 * 1024) throw new MusicXmlError('Il file supera il limite di 5 MB.');
  // Strip DOCTYPE (external DTD is never fetched; avoids entity expansion).
  const clean = text.replace(/<!DOCTYPE[^>[]*(\[[^\]]*\])?>/i, '');
  const doc = new DOMParser().parseFromString(clean, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new MusicXmlError('Il file non è un XML valido.');
  const root = doc.documentElement.nodeName;
  if (root === 'score-timewise') throw new MusicXmlError('Il formato «score-timewise» non è supportato: esporta il file come «partwise».');
  if (root !== 'score-partwise') throw new MusicXmlError('Il file non è una partitura MusicXML.');
  if (!doc.getElementsByTagName('part').length) throw new MusicXmlError('La partitura non contiene parti.');
  ensureIds(doc);
  return doc;
}

export function serializeMusicXml(doc: Document): string {
  const body = new XMLSerializer().serializeToString(doc.documentElement);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n${body}\n`;
}

let idCounter = 0;
function newId(): string {
  idCounter = (idCounter + 1) % 1e6;
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `n${rnd}${idCounter.toString(36)}`;
}

/** Gives every note a unique id (keeps existing unique ids). */
export function ensureIds(doc: Document): void {
  const seen = new Set<string>();
  for (const n of Array.from(doc.getElementsByTagName('note'))) {
    let id = n.getAttribute('id');
    if (!id || seen.has(id) || !/^[A-Za-z_][\w.-]*$/.test(id)) {
      id = newId();
      n.setAttribute('id', id);
    }
    seen.add(id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const child = (el: Element, name: string): Element | null => {
  for (const c of Array.from(el.children)) if (c.nodeName === name) return c;
  return null;
};
const children = (el: Element, name: string): Element[] => Array.from(el.children).filter((c) => c.nodeName === name);
const text = (el: Element | null): string | null => (el ? el.textContent?.trim() ?? null : null);

function ensureChild(doc: Document, parent: Element, name: string, before?: string[]): Element {
  let el = child(parent, name);
  if (el) return el;
  el = doc.createElement(name);
  const ref = before?.map((b) => child(parent, b)).find(Boolean) ?? null;
  parent.insertBefore(el, ref);
  return el;
}

function setText(doc: Document, parent: Element, name: string, value: string, before?: string[]) {
  ensureChild(doc, parent, name, before).textContent = value;
}

export function findNote(doc: Document, id: string): Element {
  for (const n of Array.from(doc.getElementsByTagName('note'))) if (n.getAttribute('id') === id) return n;
  throw new MusicXmlError('Nota non trovata.');
}

function measureOf(note: Element): Element {
  let el: Element | null = note.parentElement;
  while (el && el.nodeName !== 'measure') el = el.parentElement;
  if (!el) throw new MusicXmlError('Struttura della battuta non valida.');
  return el;
}

/** Divisions in effect for a measure (last <divisions> at or before it). */
export function divisionsAt(measure: Element): number {
  let m: Element | null = measure;
  while (m) {
    const d = m.getElementsByTagName('divisions')[0];
    if (d) return Number(d.textContent) || 1;
    m = m.previousElementSibling;
  }
  return 1;
}

/** Time signature (beats, beat-type) in effect for a measure. */
export function timeAt(measure: Element): { beats: number; beatType: number } | null {
  let m: Element | null = measure;
  while (m) {
    const t = m.getElementsByTagName('time')[0];
    if (t) return { beats: Number(text(child(t, 'beats'))) || 4, beatType: Number(text(child(t, 'beat-type'))) || 4 };
    m = m.previousElementSibling;
  }
  return null;
}

// Child order inside <note> (MusicXML schema sequence) for correct insertion.
const NOTE_ORDER = ['grace', 'cue', 'chord', 'pitch', 'unpitched', 'rest', 'duration', 'tie', 'instrument', 'footnote', 'level', 'voice', 'type', 'dot', 'accidental', 'time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];
function insertInOrder(doc: Document, note: Element, el: Element) {
  const idx = NOTE_ORDER.indexOf(el.nodeName);
  const after = NOTE_ORDER.slice(idx + 1);
  const ref = Array.from(note.children).find((c) => after.includes(c.nodeName)) ?? null;
  note.insertBefore(el, ref);
  void doc;
}
function upsertNoteChild(doc: Document, note: Element, name: string): Element {
  const existing = child(note, name);
  if (existing) return existing;
  const el = doc.createElement(name);
  insertInOrder(doc, note, el);
  return el;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function readPitch(note: Element): Pitch | null {
  const p = child(note, 'pitch');
  if (!p) return null;
  return {
    step: (text(child(p, 'step')) ?? 'C') as Step,
    alter: Number(text(child(p, 'alter')) ?? 0) || 0,
    octave: Number(text(child(p, 'octave')) ?? 4),
  };
}

export function noteInfo(note: Element, measureIndex = 0): NoteInfo {
  const measure = measureOf(note);
  const part = measure.parentElement!;
  const notations = child(note, 'notations');
  const lyric = child(note, 'lyric');
  const prev = note.previousElementSibling;
  return {
    id: note.getAttribute('id') ?? '',
    partId: part.getAttribute('id') ?? '',
    measure: measure.getAttribute('number') ?? '',
    measureIndex,
    isRest: Boolean(child(note, 'rest')),
    isChord: Boolean(child(note, 'chord')),
    pitch: readPitch(note),
    type: (text(child(note, 'type')) as NoteType | null) ?? null,
    dots: children(note, 'dot').length,
    duration: Number(text(child(note, 'duration')) ?? 0),
    voice: text(child(note, 'voice')) ?? '1',
    staff: text(child(note, 'staff')) ?? '1',
    tieStart: children(note, 'tie').some((t) => t.getAttribute('type') === 'start'),
    tieStop: children(note, 'tie').some((t) => t.getAttribute('type') === 'stop'),
    slurStart: notations ? children(notations, 'slur').some((s) => s.getAttribute('type') === 'start') : false,
    slurStop: notations ? children(notations, 'slur').some((s) => s.getAttribute('type') === 'stop') : false,
    lyric: lyric ? text(child(lyric, 'text')) ?? '' : '',
    syllabic: lyric ? text(child(lyric, 'syllabic')) : null,
    harmony: prev && prev.nodeName === 'harmony' ? harmonyText(prev) : null,
  };
}

export function listNotes(doc: Document): NoteInfo[] {
  const out: NoteInfo[] = [];
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    children(part, 'measure').forEach((m, mi) => {
      for (const n of children(m, 'note')) out.push(noteInfo(n, mi));
    });
  }
  return out;
}

export function scoreTitle(doc: Document): string {
  return (
    text(doc.querySelector('work > work-title')) ||
    text(doc.querySelector('movement-title')) ||
    text(doc.querySelector('credit-words')) ||
    'Partitura'
  );
}

export function setScoreTitle(doc: Document, title: string) {
  const root = doc.documentElement;
  let work = child(root, 'work');
  if (!work) {
    work = doc.createElement('work');
    root.insertBefore(work, root.firstElementChild);
  }
  setText(doc, work, 'work-title', title);
}

export interface MeasureCheck {
  partId: string;
  measure: string;
  expected: number;
  actual: number;
}

/** Measures whose content (per voice) does not match the time signature. */
/**
 * Length of a measure in divisions: the furthest point reached by any voice,
 * following <backup>/<forward> like a reader does. Chord members and grace
 * notes take no time; a voice that rests silently (no notes, only <forward>)
 * is not counted as missing.
 */
function measureLength(m: Element): number {
  let pos = 0;
  let max = 0;
  for (const c of Array.from(m.children)) {
    const dur = Number(text(child(c, 'duration')) ?? 0) || 0;
    if (c.nodeName === 'note') {
      if (child(c, 'grace') || child(c, 'chord')) continue;
      pos += dur;
    } else if (c.nodeName === 'backup') pos -= dur;
    else if (c.nodeName === 'forward') pos += dur;
    if (pos > max) max = pos;
  }
  return max;
}

const hasRepeatOrEnding = (m: Element) => children(m, 'barline').some((b) => child(b, 'repeat') || child(b, 'ending'));
const startsRepeat = (m: Element | undefined) => !!m && children(m, 'barline').some((b) => child(b, 'repeat')?.getAttribute('direction') === 'forward');

/**
 * Measures whose length does not match the time signature. Overfull measures
 * are always reported. Short measures are accepted where scores legitimately
 * have them: a pickup (first measure or implicit="yes"), a last measure that
 * completes the pickup, measures at repeats or volta endings, and a measure
 * split in two (two consecutive short measures that add up to one).
 */
export function checkMeasures(doc: Document): MeasureCheck[] {
  const issues: MeasureCheck[] = [];
  const eps = 1e-6;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const measures = children(part, 'measure');
    const info = measures.map((m) => {
      const time = timeAt(m);
      return { m, actual: measureLength(m), expected: time ? (time.beats * 4 * divisionsAt(m)) / time.beatType : null };
    });
    info.forEach(({ m, actual, expected }, idx) => {
      if (expected === null || m.getAttribute('implicit') === 'yes') return;
      const report = () => issues.push({ partId: part.getAttribute('id') ?? '', measure: m.getAttribute('number') ?? '', expected, actual });
      if (actual > expected + eps) return report();
      if (actual >= expected - eps || idx === 0 || actual === 0) return;
      if (idx === info.length - 1) {
        if (Math.abs(info[0]!.actual + actual - expected) > eps) report();
        return;
      }
      if (hasRepeatOrEnding(m) || startsRepeat(measures[idx + 1])) return;
      const prev = info[idx - 1]!;
      if (prev.expected !== null && prev.actual < prev.expected - eps && Math.abs(prev.actual + actual - expected) < eps) return;
      if (Math.abs(actual + info[idx + 1]!.actual - expected) < eps) return;
      report();
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Editing operations (mutate the document)
// ---------------------------------------------------------------------------

export function setPitch(doc: Document, id: string, pitch: Pitch): void {
  const note = findNote(doc, id);
  const rest = child(note, 'rest');
  if (rest) note.removeChild(rest);
  const p = upsertNoteChild(doc, note, 'pitch');
  setText(doc, p, 'step', pitch.step, ['alter', 'octave']);
  const alter = child(p, 'alter');
  if (pitch.alter) {
    if (alter) alter.textContent = String(pitch.alter);
    else p.insertBefore(Object.assign(doc.createElement('alter'), { textContent: String(pitch.alter) }), child(p, 'octave'));
  } else if (alter) p.removeChild(alter);
  setText(doc, p, 'octave', String(pitch.octave));
  syncAccidental(doc, note, pitch.alter);
}

function syncAccidental(doc: Document, note: Element, alter: number) {
  const names: Record<number, string> = { [-2]: 'flat-flat', [-1]: 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };
  const acc = child(note, 'accidental');
  if (alter === 0) {
    if (acc && acc.textContent !== 'natural') note.removeChild(acc);
    return;
  }
  const el = acc ?? upsertNoteChild(doc, note, 'accidental');
  el.textContent = names[alter] ?? 'natural';
}

/** Moves a note by diatonic steps (arrow up/down), keeping the alteration at 0. */
export function stepPitch(doc: Document, id: string, steps: number): void {
  const note = findNote(doc, id);
  const p = readPitch(note);
  if (!p) return;
  let idx = STEPS.indexOf(p.step) + steps;
  let octave = p.octave;
  while (idx > 6) { idx -= 7; octave++; }
  while (idx < 0) { idx += 7; octave--; }
  setPitch(doc, id, { step: STEPS[idx]!, alter: 0, octave: Math.max(0, Math.min(9, octave)) });
}

export function setAlter(doc: Document, id: string, alter: number): void {
  const note = findNote(doc, id);
  const p = readPitch(note);
  if (!p) return;
  setPitch(doc, id, { ...p, alter: Math.max(-2, Math.min(2, alter)) });
  if (alter === 0) {
    // Explicit natural sign (useful after a key signature alteration).
    const acc = upsertNoteChild(doc, note, 'accidental');
    acc.textContent = 'natural';
  }
}

export function durationFor(type: NoteType, dots: number, divisions: number): number {
  let q = TYPE_QUARTERS[type];
  let add = q / 2;
  for (let i = 0; i < dots; i++) {
    q += add;
    add /= 2;
  }
  return Math.round(q * divisions);
}

/** Smallest divisions value that represents `type`+`dots` exactly. */
function requiredDivisions(type: NoteType, dots: number): number {
  let q = TYPE_QUARTERS[type];
  let add = q / 2;
  for (let i = 0; i < dots; i++) {
    q += add;
    add /= 2;
  }
  let d = 1;
  while (Math.abs(q * d - Math.round(q * d)) > 1e-9 && d < 1024) d *= 2;
  return d;
}

/** Multiplies all durations in a part so that finer values can be expressed. */
function rescaleDivisions(doc: Document, measure: Element, factor: number) {
  const part = measure.parentElement!;
  for (const m of children(part, 'measure')) {
    for (const d of Array.from(m.getElementsByTagName('divisions'))) d.textContent = String(Number(d.textContent) * factor);
    for (const d of Array.from(m.getElementsByTagName('duration'))) d.textContent = String(Number(d.textContent) * factor);
  }
  void doc;
}

export function setDuration(doc: Document, id: string, type: NoteType, dots = 0): void {
  const note = findNote(doc, id);
  const measure = measureOf(note);
  let div = divisionsAt(measure);
  const need = requiredDivisions(type, dots);
  if (div % need !== 0) {
    const factor = need / gcd(div, need);
    rescaleDivisions(doc, measure, factor);
    div = divisionsAt(measure);
  }
  setText(doc, note, 'duration', String(durationFor(type, dots, div)));
  const t = upsertNoteChild(doc, note, 'type');
  t.textContent = type;
  for (const d of children(note, 'dot')) note.removeChild(d);
  for (let i = 0; i < dots; i++) insertInOrder(doc, note, doc.createElement('dot'));
  // Chord members share the duration of their chord.
  let next = note.nextElementSibling;
  while (next && next.nodeName === 'note' && child(next, 'chord')) {
    setText(doc, next, 'duration', String(durationFor(type, dots, div)));
    upsertNoteChild(doc, next, 'type').textContent = type;
    for (const d of children(next, 'dot')) next.removeChild(d);
    for (let i = 0; i < dots; i++) insertInOrder(doc, next, doc.createElement('dot'));
    next = next.nextElementSibling;
  }
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function toRest(doc: Document, id: string): void {
  const note = findNote(doc, id);
  if (child(note, 'chord')) {
    // A chord member cannot become a rest: remove it from the chord.
    note.parentElement!.removeChild(note);
    return;
  }
  for (const name of ['pitch', 'unpitched', 'accidental', 'tie', 'stem', 'notehead', 'beam']) {
    for (const c of children(note, name)) note.removeChild(c);
  }
  const notations = child(note, 'notations');
  if (notations) note.removeChild(notations);
  for (const l of children(note, 'lyric')) note.removeChild(l);
  if (!child(note, 'rest')) insertInOrder(doc, note, doc.createElement('rest'));
  // Promote the next chord member (if any) to the head of the chord.
  const next = note.nextElementSibling;
  if (next && next.nodeName === 'note' && child(next, 'chord')) {
    note.parentElement!.removeChild(next);
  }
}

export function toNote(doc: Document, id: string, pitch: Pitch = { step: 'B', alter: 0, octave: 4 }): void {
  const note = findNote(doc, id);
  const rest = child(note, 'rest');
  if (rest) note.removeChild(rest);
  setPitch(doc, id, pitch);
}

/** "Delete" in notation editors keeps the rhythm: the note becomes a rest. */
export const deleteNote = toRest;

/** Inserts a new note after `id` (same voice/staff). Returns the new id. */
export function insertNoteAfter(doc: Document, id: string, pitch: Pitch | null, type: NoteType, dots = 0): string {
  const ref = findNote(doc, id);
  let anchor: Element = ref;
  while (anchor.nextElementSibling && anchor.nextElementSibling.nodeName === 'note' && child(anchor.nextElementSibling, 'chord')) {
    anchor = anchor.nextElementSibling;
  }
  const div = divisionsAt(measureOf(ref));
  const n = doc.createElement('note');
  const nid = newId();
  n.setAttribute('id', nid);
  if (pitch) {
    const p = doc.createElement('pitch');
    p.appendChild(Object.assign(doc.createElement('step'), { textContent: pitch.step }));
    if (pitch.alter) p.appendChild(Object.assign(doc.createElement('alter'), { textContent: String(pitch.alter) }));
    p.appendChild(Object.assign(doc.createElement('octave'), { textContent: String(pitch.octave) }));
    n.appendChild(p);
  } else n.appendChild(doc.createElement('rest'));
  n.appendChild(Object.assign(doc.createElement('duration'), { textContent: String(durationFor(type, dots, div)) }));
  n.appendChild(Object.assign(doc.createElement('voice'), { textContent: text(child(ref, 'voice')) ?? '1' }));
  n.appendChild(Object.assign(doc.createElement('type'), { textContent: type }));
  for (let i = 0; i < dots; i++) n.appendChild(doc.createElement('dot'));
  const staff = text(child(ref, 'staff'));
  if (staff) n.appendChild(Object.assign(doc.createElement('staff'), { textContent: staff }));
  anchor.parentElement!.insertBefore(n, anchor.nextSibling);
  if (pitch?.alter) syncAccidental(doc, n, pitch.alter);
  if (div % requiredDivisions(type, dots) !== 0) setDuration(doc, nid, type, dots);
  return nid;
}

/** Adds a note to the chord of `id` (stacked, same duration). Returns the new id. */
export function addChordNote(doc: Document, id: string, pitch: Pitch): string {
  const ref = findNote(doc, id);
  if (child(ref, 'rest')) throw new MusicXmlError('Non è possibile aggiungere note a una pausa.');
  const info = noteInfo(ref);
  const nid = insertNoteAfter(doc, id, pitch, info.type ?? 'quarter', info.dots);
  const n = findNote(doc, nid);
  insertInOrder(doc, n, doc.createElement('chord'));
  setText(doc, n, 'duration', String(info.duration));
  return nid;
}

export function toggleTie(doc: Document, id: string): void {
  const note = findNote(doc, id);
  const hasStart = children(note, 'tie').some((t) => t.getAttribute('type') === 'start');
  const next = nextNoteSameVoice(note);
  if (hasStart) {
    removeTie(note, 'start');
    if (next) removeTie(next, 'stop');
    return;
  }
  if (!next || !child(note, 'pitch') || !child(next, 'pitch')) throw new MusicXmlError('La legatura di valore richiede una nota successiva della stessa altezza.');
  const a = readPitch(note)!;
  const b = readPitch(next)!;
  if (a.step !== b.step || a.octave !== b.octave || a.alter !== b.alter) throw new MusicXmlError('La legatura di valore unisce due note della stessa altezza.');
  addTie(doc, note, 'start');
  addTie(doc, next, 'stop');
}

function addTie(doc: Document, note: Element, type: 'start' | 'stop') {
  const tie = doc.createElement('tie');
  tie.setAttribute('type', type);
  insertInOrder(doc, note, tie);
  const notations = upsertNoteChild(doc, note, 'notations');
  const tied = doc.createElement('tied');
  tied.setAttribute('type', type);
  notations.appendChild(tied);
}
function removeTie(note: Element, type: string) {
  for (const t of children(note, 'tie')) if (t.getAttribute('type') === type) note.removeChild(t);
  const notations = child(note, 'notations');
  if (notations) {
    for (const t of children(notations, 'tied')) if (t.getAttribute('type') === type) notations.removeChild(t);
    if (!notations.children.length) note.removeChild(notations);
  }
}

function nextNoteSameVoice(note: Element): Element | null {
  const voice = text(child(note, 'voice')) ?? '1';
  const part = measureOf(note).parentElement!;
  const all = Array.from(part.getElementsByTagName('note'));
  const i = all.indexOf(note);
  for (let j = i + 1; j < all.length; j++) {
    const n = all[j]!;
    if (child(n, 'chord')) continue;
    if ((text(child(n, 'voice')) ?? '1') === voice) return n;
  }
  return null;
}

/** Toggles a slur start on `id`, or a slur stop if a slur is open before it. */
export function toggleSlur(doc: Document, id: string, kind: 'start' | 'stop'): void {
  const note = findNote(doc, id);
  const notations = upsertNoteChild(doc, note, 'notations');
  const existing = children(notations, 'slur').find((s) => s.getAttribute('type') === kind);
  if (existing) {
    notations.removeChild(existing);
    if (!notations.children.length) note.removeChild(notations);
    return;
  }
  const slur = doc.createElement('slur');
  slur.setAttribute('type', kind);
  slur.setAttribute('number', '1');
  notations.appendChild(slur);
}

export function setLyric(doc: Document, id: string, value: string, syllabic: 'single' | 'begin' | 'middle' | 'end' = 'single'): void {
  const note = findNote(doc, id);
  const existing = children(note, 'lyric').find((l) => (l.getAttribute('number') ?? '1') === '1');
  if (!value.trim()) {
    if (existing) note.removeChild(existing);
    return;
  }
  const lyric = existing ?? doc.createElement('lyric');
  if (!existing) {
    lyric.setAttribute('number', '1');
    insertInOrder(doc, note, lyric);
  }
  while (lyric.firstChild) lyric.removeChild(lyric.firstChild);
  lyric.appendChild(Object.assign(doc.createElement('syllabic'), { textContent: syllabic }));
  lyric.appendChild(Object.assign(doc.createElement('text'), { textContent: value.trim() }));
}

// ----- chord symbols (<harmony>) -----

const KIND_BY_SUFFIX: Record<string, string> = {
  '': 'major', m: 'minor', '7': 'dominant', maj7: 'major-seventh', m7: 'minor-seventh', dim: 'diminished',
  dim7: 'diminished-seventh', aug: 'augmented', m7b5: 'half-diminished', sus4: 'suspended-fourth', sus2: 'suspended-second',
  '6': 'major-sixth', m6: 'minor-sixth', '9': 'dominant-ninth', maj9: 'major-ninth', m9: 'minor-ninth', '7sus4': 'dominant', add9: 'major',
};

export function harmonyText(h: Element): string {
  const root = child(h, 'root');
  if (!root) return '';
  const step = text(child(root, 'root-step')) ?? '';
  const alter = Number(text(child(root, 'root-alter')) ?? 0);
  const kind = child(h, 'kind');
  const suffix = kind?.getAttribute('text') ?? Object.entries(KIND_BY_SUFFIX).find(([, v]) => v === text(kind))?.[0] ?? '';
  const bass = child(h, 'bass');
  const bassTxt = bass ? `/${text(child(bass, 'bass-step'))}${Number(text(child(bass, 'bass-alter')) ?? 0) > 0 ? '#' : Number(text(child(bass, 'bass-alter')) ?? 0) < 0 ? 'b' : ''}` : '';
  return `${step}${alter > 0 ? '#' : alter < 0 ? 'b' : ''}${suffix}${bassTxt}`;
}

/** Sets (or removes, with empty text) the chord symbol attached before a note. */
export function setHarmony(doc: Document, id: string, chordText: string): void {
  const note = findNote(doc, id);
  const prev = note.previousElementSibling;
  if (prev && prev.nodeName === 'harmony') prev.parentElement!.removeChild(prev);
  if (!chordText.trim()) return;
  const chord = parseChord(chordText);
  if (!chord) throw new MusicXmlError('Accordo non riconosciuto.');
  const h = doc.createElement('harmony');
  const root = doc.createElement('root');
  root.appendChild(Object.assign(doc.createElement('root-step'), { textContent: chord.root.letter }));
  if (chord.root.accidental) root.appendChild(Object.assign(doc.createElement('root-alter'), { textContent: String(chord.root.accidental) }));
  h.appendChild(root);
  const kind = doc.createElement('kind');
  kind.textContent = KIND_BY_SUFFIX[chord.suffix] ?? (chord.suffix.startsWith('m') ? 'minor' : 'major');
  kind.setAttribute('text', chord.suffix);
  h.appendChild(kind);
  if (chord.bass) {
    const bass = doc.createElement('bass');
    bass.appendChild(Object.assign(doc.createElement('bass-step'), { textContent: chord.bass.letter }));
    if (chord.bass.accidental) bass.appendChild(Object.assign(doc.createElement('bass-alter'), { textContent: String(chord.bass.accidental) }));
    h.appendChild(bass);
  }
  note.parentElement!.insertBefore(h, note);
}

// ----- measures and attributes -----

function partOfNote(doc: Document, id: string): Element {
  return measureOf(findNote(doc, id)).parentElement!;
}

/** Appends a measure (whole-measure rest per staff) to every part. */
export function appendMeasure(doc: Document): void {
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const measures = children(part, 'measure');
    const last = measures[measures.length - 1];
    if (!last) continue;
    const time = timeAt(last) ?? { beats: 4, beatType: 4 };
    const div = divisionsAt(last);
    const m = doc.createElement('measure');
    const num = Number(last.getAttribute('number'));
    m.setAttribute('number', String(Number.isFinite(num) ? num + 1 : measures.length + 1));
    const staves = Number(text(last.ownerDocument.querySelector(`part[id="${part.getAttribute('id')}"] staves`)) ?? 1) || 1;
    for (let s = 1; s <= staves; s++) {
      if (s > 1) {
        const backup = doc.createElement('backup');
        backup.appendChild(Object.assign(doc.createElement('duration'), { textContent: String((time.beats * 4 * div) / time.beatType) }));
        m.appendChild(backup);
      }
      const n = doc.createElement('note');
      n.setAttribute('id', newId());
      const rest = doc.createElement('rest');
      rest.setAttribute('measure', 'yes');
      n.appendChild(rest);
      n.appendChild(Object.assign(doc.createElement('duration'), { textContent: String((time.beats * 4 * div) / time.beatType) }));
      n.appendChild(Object.assign(doc.createElement('voice'), { textContent: s === 1 ? '1' : String(s * 4 - 3) }));
      if (staves > 1) n.appendChild(Object.assign(doc.createElement('staff'), { textContent: String(s) }));
      m.appendChild(n);
    }
    part.appendChild(m);
  }
}

/** Deletes the measure containing `id` from every part (keeps at least one). */
export function deleteMeasureOf(doc: Document, id: string): void {
  const measure = measureOf(findNote(doc, id));
  const part = measure.parentElement!;
  const index = children(part, 'measure').indexOf(measure);
  if (children(part, 'measure').length <= 1) throw new MusicXmlError('La partitura deve contenere almeno una battuta.');
  for (const p of Array.from(doc.getElementsByTagName('part'))) {
    const m = children(p, 'measure')[index];
    if (!m) continue;
    // Keep attributes (key/time/clef/divisions) by moving them to the next measure.
    const attrs = child(m, 'attributes');
    const next = m.nextElementSibling;
    if (attrs && next && !child(next, 'attributes')) next.insertBefore(attrs, next.firstChild);
    p.removeChild(m);
  }
  void part;
}

function measureAttributes(doc: Document, measure: Element): Element {
  let attrs = child(measure, 'attributes');
  if (!attrs) {
    attrs = doc.createElement('attributes');
    measure.insertBefore(attrs, measure.firstChild);
  }
  return attrs;
}
const ATTR_ORDER = ['footnote', 'level', 'divisions', 'key', 'time', 'staves', 'part-symbol', 'instruments', 'clef', 'staff-details', 'transpose', 'for-part', 'directive', 'measure-style'];
function upsertAttr(doc: Document, attrs: Element, name: string): Element {
  const ex = child(attrs, name);
  if (ex) return ex;
  const el = doc.createElement(name);
  const after = ATTR_ORDER.slice(ATTR_ORDER.indexOf(name) + 1);
  attrs.insertBefore(el, Array.from(attrs.children).find((c) => after.includes(c.nodeName)) ?? null);
  return el;
}

/** Key signature from the measure of `id` onward (all parts). fifths: -7..7 */
export function setKeySignature(doc: Document, id: string, fifths: number, mode: 'major' | 'minor' = 'major'): void {
  const measure = measureOf(findNote(doc, id));
  const index = children(measure.parentElement!, 'measure').indexOf(measure);
  for (const p of Array.from(doc.getElementsByTagName('part'))) {
    const m = children(p, 'measure')[index];
    if (!m) continue;
    const key = upsertAttr(doc, measureAttributes(doc, m), 'key');
    while (key.firstChild) key.removeChild(key.firstChild);
    key.appendChild(Object.assign(doc.createElement('fifths'), { textContent: String(Math.max(-7, Math.min(7, fifths))) }));
    key.appendChild(Object.assign(doc.createElement('mode'), { textContent: mode }));
  }
}

export function setTimeSignature(doc: Document, id: string, beats: number, beatType: number): void {
  if (![1, 2, 4, 8, 16].includes(beatType) || beats < 1 || beats > 32) throw new MusicXmlError('Indicazione di tempo non valida.');
  const measure = measureOf(findNote(doc, id));
  const index = children(measure.parentElement!, 'measure').indexOf(measure);
  for (const p of Array.from(doc.getElementsByTagName('part'))) {
    const m = children(p, 'measure')[index];
    if (!m) continue;
    const time = upsertAttr(doc, measureAttributes(doc, m), 'time');
    while (time.firstChild) time.removeChild(time.firstChild);
    time.appendChild(Object.assign(doc.createElement('beats'), { textContent: String(beats) }));
    time.appendChild(Object.assign(doc.createElement('beat-type'), { textContent: String(beatType) }));
  }
}

export type ClefName = 'treble' | 'bass' | 'alto' | 'tenor' | 'treble8vb';
const CLEFS: Record<ClefName, { sign: string; line: number; octave?: number }> = {
  treble: { sign: 'G', line: 2 }, bass: { sign: 'F', line: 4 }, alto: { sign: 'C', line: 3 }, tenor: { sign: 'C', line: 4 }, treble8vb: { sign: 'G', line: 2, octave: -1 },
};

export function setClef(doc: Document, id: string, clef: ClefName): void {
  const note = findNote(doc, id);
  const measure = measureOf(note);
  const staff = text(child(note, 'staff')) ?? '1';
  const attrs = measureAttributes(doc, measure);
  let el = children(attrs, 'clef').find((c) => (c.getAttribute('number') ?? '1') === staff);
  if (!el) {
    el = doc.createElement('clef');
    if (staff !== '1') el.setAttribute('number', staff);
    const after = ATTR_ORDER.slice(ATTR_ORDER.indexOf('clef') + 1);
    attrs.insertBefore(el, Array.from(attrs.children).find((c) => after.includes(c.nodeName)) ?? null);
  }
  while (el.firstChild) el.removeChild(el.firstChild);
  const c = CLEFS[clef];
  el.appendChild(Object.assign(doc.createElement('sign'), { textContent: c.sign }));
  el.appendChild(Object.assign(doc.createElement('line'), { textContent: String(c.line) }));
  if (c.octave) el.appendChild(Object.assign(doc.createElement('clef-octave-change'), { textContent: String(c.octave) }));
  void partOfNote;
}

// ---------------------------------------------------------------------------
// New score
// ---------------------------------------------------------------------------

export function createEmptyScore(opts: { title: string; partName?: string; fifths?: number; beats?: number; beatType?: number; clef?: ClefName; measures?: number }): string {
  const beats = opts.beats ?? 4;
  const beatType = opts.beatType ?? 4;
  const clef = CLEFS[opts.clef ?? 'treble'];
  const div = 2;
  const measureDur = (beats * 4 * div) / beatType;
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
  const measures = Array.from({ length: Math.max(1, opts.measures ?? 4) }, (_, i) => {
    const attrs = i === 0
      ? `<attributes><divisions>${div}</divisions><key><fifths>${opts.fifths ?? 0}</fifths><mode>major</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>${clef.sign}</sign><line>${clef.line}</line>${clef.octave ? `<clef-octave-change>${clef.octave}</clef-octave-change>` : ''}</clef></attributes>`
      : '';
    return `<measure number="${i + 1}">${attrs}<note id="${newId()}"><rest measure="yes"/><duration>${measureDur}</duration><voice>1</voice></note></measure>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${esc(opts.title)}</work-title></work><identification><encoding><software>Jubilate Deo</software></encoding></identification><part-list><score-part id="P1"><part-name>${esc(opts.partName ?? 'Voce')}</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

// ---------------------------------------------------------------------------
// Compressed MusicXML (.mxl = ZIP). Minimal reader using DecompressionStream.
// ---------------------------------------------------------------------------

export async function readMxl(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Locate End Of Central Directory.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new MusicXmlError('File .mxl non valido.');
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const entries: { name: string; method: number; size: number; offset: number }[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const size = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const offset = view.getUint32(ptr + 42, true);
    entries.push({ name: dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen)), method, size, offset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (e: (typeof entries)[number]): Promise<string> => {
    const lh = e.offset;
    const nameLen = view.getUint16(lh + 26, true);
    const extraLen = view.getUint16(lh + 28, true);
    const start = lh + 30 + nameLen + extraLen;
    const data = bytes.slice(start, start + e.size);
    if (e.method === 0) return dec.decode(data);
    if (e.method !== 8) throw new MusicXmlError('Compressione .mxl non supportata.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  };
  const container = entries.find((e) => e.name === 'META-INF/container.xml');
  let target: (typeof entries)[number] | undefined;
  if (container) {
    const xml = await read(container);
    const path = /full-path="([^"]+)"/.exec(xml)?.[1];
    target = entries.find((e) => e.name === path);
  }
  target ??= entries.find((e) => /\.(musicxml|xml)$/i.test(e.name) && !e.name.startsWith('META-INF/'));
  if (!target) throw new MusicXmlError('Nessuna partitura trovata nel file .mxl.');
  return read(target);
}
