import { describe, expect, it } from 'vitest';
import {
  addChordNote, appendMeasure, checkMeasures, createEmptyScore, deleteNote, insertNoteAfter, listNotes,
  MusicXmlError, parseMusicXml, scoreTitle, serializeMusicXml, setDuration, setHarmony, setKeySignature,
  setLyric, setPitch, setScoreTitle, setTimeSignature, stepPitch, toggleTie,
} from './musicxml';

// Small original exercise (not a copyrighted work). Contains an element the
// editor does not model (<direction>) to check that it survives round trips.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Esercizio</work-title></work>
  <part-list><score-part id="P1"><part-name>Voce</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction placement="above"><direction-type><words>Lento</words></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric><syllabic>single</syllabic><text>Can</text></lyric></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

describe('MusicXML prototype (7 steps)', () => {
  it('imports, selects, edits, saves, exports and re-imports without losing supported edits', () => {
    // 1. Import
    const doc = parseMusicXml(SAMPLE);
    expect(scoreTitle(doc)).toBe('Esercizio');
    // 2. "Display": every note has a stable id usable by the renderer (Verovio keeps it in the SVG)
    const notes = listNotes(doc);
    expect(notes).toHaveLength(5);
    expect(new Set(notes.map((n) => n.id)).size).toBe(5);
    // 3. Select a note (by id, as a click on the SVG would)
    const second = notes[1]!;
    expect(second.pitch).toEqual({ step: 'D', alter: 0, octave: 4 });
    // 4. Modify: pitch to F#4, duration to eighth, plus lyric and chord symbol
    setPitch(doc, second.id, { step: 'F', alter: 1, octave: 4 });
    setDuration(doc, second.id, 'eighth');
    setLyric(doc, second.id, 'to');
    setHarmony(doc, notes[0]!.id, 'Am7');
    // 5. Save (serialize to the string stored in score_versions)
    const saved = serializeMusicXml(doc);
    expect(saved).toContain('<?xml');
    // 6. Export as MusicXML: same serialized payload, valid partwise document
    expect(saved).toContain('<score-partwise');
    // 7. Re-import
    const again = parseMusicXml(saved);
    const n2 = listNotes(again).find((n) => n.id === second.id)!;
    expect(n2.pitch).toEqual({ step: 'F', alter: 1, octave: 4 });
    expect(n2.type).toBe('eighth');
    expect(n2.lyric).toBe('to');
    expect(listNotes(again)[0]!.harmony).toBe('Am7');
    expect(listNotes(again)[0]!.lyric).toBe('Can');
    // Unsupported content is preserved
    expect(saved).toContain('<words>Lento</words>');
    // Divisions were rescaled: the other quarter notes keep their length
    const q = listNotes(again)[0]!;
    expect(q.type).toBe('quarter');
    expect(q.duration).toBe(2);
    // An underfull first measure is tolerated (possible pickup); later ones are reported
    expect(checkMeasures(again)).toEqual([]);
    setDuration(again, listNotes(again)[4]!.id, 'half');
    expect(checkMeasures(again)).toEqual([{ partId: 'P1', measure: '2', expected: 8, actual: 4 }]);
  });

  it('keeps ids stable across round trips', () => {
    const doc = parseMusicXml(SAMPLE);
    const ids = listNotes(doc).map((n) => n.id);
    const ids2 = listNotes(parseMusicXml(serializeMusicXml(doc))).map((n) => n.id);
    expect(ids2).toEqual(ids);
  });
});

describe('MusicXML parsing safety', () => {
  it('rejects invalid input', () => {
    expect(() => parseMusicXml('<nope')).toThrow(MusicXmlError);
    expect(() => parseMusicXml('<html></html>')).toThrow(/non è una partitura/);
    expect(() => parseMusicXml('<score-timewise></score-timewise>')).toThrow(/timewise/);
  });
  it('drops an internal DTD subset (no entity expansion)', () => {
    const evil = SAMPLE.replace(/<!DOCTYPE[^>]*>/, '<!DOCTYPE x [<!ENTITY a "aaaa">]>');
    expect(() => parseMusicXml(evil)).not.toThrow();
  });
});

describe('MusicXML editing operations', () => {
  it('steps pitch diatonically across octaves', () => {
    const doc = parseMusicXml(SAMPLE);
    const last = listNotes(doc)[4]!;
    stepPitch(doc, last.id, 4); // G4 -> D5
    expect(listNotes(doc)[4]!.pitch).toEqual({ step: 'D', alter: 0, octave: 5 });
    stepPitch(doc, last.id, -8); // D5 -> C4
    expect(listNotes(doc)[4]!.pitch).toEqual({ step: 'C', alter: 0, octave: 4 });
  });

  it('deleting a note keeps the rhythm (becomes a rest)', () => {
    const doc = parseMusicXml(SAMPLE);
    const id = listNotes(doc)[2]!.id;
    deleteNote(doc, id);
    const n = listNotes(doc)[2]!;
    expect(n.isRest).toBe(true);
    expect(n.duration).toBe(1);
    expect(checkMeasures(doc)).toEqual([]);
  });

  it('inserts notes and chord members', () => {
    const doc = parseMusicXml(SAMPLE);
    const first = listNotes(doc)[0]!.id;
    const added = insertNoteAfter(doc, first, { step: 'B', alter: -1, octave: 3 }, 'quarter');
    const list = listNotes(doc);
    expect(list[1]!.id).toBe(added);
    expect(list[1]!.pitch).toEqual({ step: 'B', alter: -1, octave: 3 });
    const chordId = addChordNote(doc, first, { step: 'E', alter: 0, octave: 4 });
    const c = listNotes(doc).find((n) => n.id === chordId)!;
    expect(c.isChord).toBe(true);
    expect(c.duration).toBe(1);
  });

  it('ties two notes of the same pitch', () => {
    const doc = parseMusicXml(SAMPLE);
    const [a, b] = listNotes(doc);
    setPitch(doc, b!.id, { step: 'C', alter: 0, octave: 4 });
    toggleTie(doc, a!.id);
    const [a2, b2] = listNotes(doc);
    expect(a2!.tieStart).toBe(true);
    expect(b2!.tieStop).toBe(true);
    toggleTie(doc, a!.id);
    expect(listNotes(doc)[0]!.tieStart).toBe(false);
    expect(listNotes(doc)[1]!.tieStop).toBe(false);
  });

  it('changes key, time and measures', () => {
    const doc = parseMusicXml(SAMPLE);
    const first = listNotes(doc)[0]!.id;
    setKeySignature(doc, first, -1);
    setTimeSignature(doc, first, 3, 4);
    const xml = serializeMusicXml(doc);
    expect(xml).toMatch(/<fifths>-1<\/fifths>/);
    expect(xml).toMatch(/<beats>3<\/beats>/);
    expect(checkMeasures(doc).length).toBeGreaterThan(0);
    appendMeasure(doc);
    expect(doc.getElementsByTagName('measure')).toHaveLength(3);
  });

  it('creates an empty score and renames it', () => {
    const doc = parseMusicXml(createEmptyScore({ title: 'Nuovo <canto>', measures: 2, beats: 3, beatType: 4 }));
    expect(scoreTitle(doc)).toBe('Nuovo <canto>');
    expect(checkMeasures(doc)).toEqual([]);
    setScoreTitle(doc, 'Altro');
    expect(scoreTitle(parseMusicXml(serializeMusicXml(doc)))).toBe('Altro');
  });
});
