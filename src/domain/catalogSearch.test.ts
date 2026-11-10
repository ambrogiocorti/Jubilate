import { describe, expect, it } from 'vitest';
import { normalizeTitle, searchCatalog, type CatalogItem } from './catalogSearch';

const item = (i: string, t: string, y: 0 | 1 = 1, n = 4): CatalogItem => ({ i, t, c: '', l: 'pd', y, n });
const items = [
  item('a', 'Tu Scendi Dalle Stelle - piano solo', 0, 1),
  item('b', 'Tu scendi dalle stelle'),
  item('c', 'Adeste Fideles'),
  item('d', 'Stelle e strisce'),
  item('e', 'Tu scendi dalle stelle (SATB)', 1, 8),
];

describe('catalogue search', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalizeTitle("  Andrò a vederla un dì!  ")).toBe('andro a vederla un di');
    expect(normalizeTitle('T’adoriam')).toBe("t'adoriam");
  });

  it('needs every significant word and ranks the exact title first', () => {
    const r = searchCatalog(items, 'Tu scendi dalle stelle').map((x) => x.i);
    expect(r[0]).toBe('b');
    expect(r).toEqual(expect.arrayContaining(['a', 'b', 'e']));
    expect(r).not.toContain('d');
    expect(r).not.toContain('c');
  });

  it('matches word prefixes and ignores short queries', () => {
    expect(searchCatalog(items, 'adeste fid').map((x) => x.i)).toEqual(['c']);
    expect(searchCatalog(items, 'a')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchCatalog(items, 'stelle', 2)).toHaveLength(2);
  });
});
