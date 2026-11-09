import { describe, expect, it } from 'vitest';
import { prepareIndex, searchSongs, type SearchableSong } from './search';

const songs: SearchableSong[] = [
  { id: 'a', number: 1, title: 'Luce del mattino', alt_titles: [], author: 'Rossi', first_line: 'Sorge la luce', lyrics: 'pane spezzato sulla mensa', category_ids: ['ingresso'], original_key: 'G' },
  { id: 'b', number: 10, title: 'Salve Regina', alt_titles: ['Antifona mariana'], author: null, first_line: 'Salve, Regína, Mater misericórdiæ', category_ids: ['mariani'], original_key: null },
  { id: 'c', number: 100, title: 'Pane di vita', alt_titles: [], author: 'Bianchi', first_line: 'Pane del cielo', category_ids: ['comunione', 'pasqua'], original_key: 'D' },
];
const idx = prepareIndex(songs);
const ids = (q: string, f = {}) => searchSongs(idx, q, f).map((s) => s.id);

describe('client search', () => {
  it('finds by exact number first', () => expect(ids('10')[0]).toBe('b'));
  it('finds by title ignoring case and accents', () => expect(ids('SALVE regina')[0]).toBe('b'));
  it('finds by alternative title', () => expect(ids('antifona')).toEqual(['b']));
  it('finds by lyrics', () => expect(ids('spezzato')).toEqual(['a']));
  it('accent-insensitive lyrics', () => expect(ids('misericordiae')).toEqual(['b']));
  it('finds by author', () => expect(ids('bianchi')).toEqual(['c']));
  it('ranks title over lyrics', () => expect(ids('pane')).toEqual(['c', 'a']));
  it('ignores extra spaces', () => expect(ids('  luce   del  ')).toEqual(['a']));
  it('filters by category', () => expect(ids('', { categoryIds: ['comunione'] })).toEqual(['c']));
  it('multiple categories in one group match any', () =>
    expect(ids('', { categoryGroups: [['ingresso', 'comunione']] })).toEqual(['a', 'c']));
  it('categories in different groups must all match', () => {
    expect(ids('', { categoryGroups: [['ingresso', 'comunione'], ['pasqua']] })).toEqual(['c']);
    expect(ids('', { categoryGroups: [['ingresso'], ['pasqua']] })).toEqual([]);
  });
  it('empty groups are ignored', () => expect(ids('', { categoryGroups: [[], ['mariani']] })).toEqual(['b']));
  it('filters by key', () => expect(ids('', { key: 'G' })).toEqual(['a']));
  it('empty query lists all in booklet order', () => expect(ids('')).toEqual(['a', 'b', 'c']));
});
