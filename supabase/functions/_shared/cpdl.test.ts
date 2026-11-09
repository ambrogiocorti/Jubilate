import { describe, expect, it } from 'vitest';
import { findScores, isAllowedFileUrl, cleanTitle, type FetchJson } from './cpdl';

const api = (url: string) => Object.fromEntries(new URL(url).searchParams);

function fakeCpdl(): { fetchJson: FetchJson; calls: string[] } {
  const calls: string[] = [];
  const fetchJson: FetchJson = async (url) => {
    calls.push(url);
    const p = api(url);
    if (p.list === 'search') {
      return p.srwhat === 'title'
        ? { query: { search: [{ title: 'Adeste fideles (John Francis Wade)', pageid: 1 }, { title: 'Adeste fideles (Anonymous)', pageid: 2 }] } }
        : { query: { search: [] } };
    }
    if (p.prop === 'images') {
      return { query: { pages: [
        { pageid: 2, title: 'Adeste fideles (Anonymous)', images: [{ title: 'File:Adeste-anon.pdf' }, { title: 'File:Adeste-anon.musicxml' }] },
        { pageid: 1, title: 'Adeste fideles (John Francis Wade)', images: [{ title: 'File:Adeste.xml' }, { title: 'File:Adeste.mxl' }, { title: 'File:Adeste.mid' }] },
      ] } };
    }
    if (p.prop === 'imageinfo') {
      return { query: { pages: [
        { title: 'File:Adeste.mxl', imageinfo: [{ url: 'https://www.cpdl.org/wiki/images/a/ab/Adeste.mxl', size: 20000 }] },
        { title: 'File:Adeste.xml', imageinfo: [{ url: 'https://www.cpdl.org/wiki/images/c/cd/Adeste.xml', size: 9000000 }] },
        { title: 'File:Adeste-anon.musicxml', imageinfo: [{ url: 'https://evil.example/wiki/images/x.musicxml', size: 100 }] },
      ] } };
    }
    throw new Error('unexpected ' + url);
  };
  return { fetchJson, calls };
}

describe('CPDL score search', () => {
  it('returns MusicXML files of the best matching pages, .mxl first', async () => {
    const { fetchJson } = fakeCpdl();
    const r = await findScores('Adeste fideles', fetchJson);
    expect(r.map((c) => c.file)).toEqual(['Adeste.mxl']);
    expect(r[0]).toMatchObject({ page: 'Adeste fideles (John Francis Wade)', size: 20000 });
    expect(r[0]!.pageUrl).toBe('https://www.cpdl.org/wiki/index.php/Adeste_fideles_(John_Francis_Wade)');
  });
  it('drops files over 5 MB and files not hosted on CPDL', async () => {
    const r = await findScores('Adeste fideles', fakeCpdl().fetchJson);
    expect(r.some((c) => c.file === 'Adeste.xml' || c.url.includes('evil'))).toBe(false);
  });
  it('falls back to a full-text search and gives up on short titles', async () => {
    const { fetchJson, calls } = fakeCpdl();
    expect(await findScores('ab', fetchJson)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it('only proxies CPDL MusicXML files', () => {
    expect(isAllowedFileUrl('https://www.cpdl.org/wiki/images/a/ab/X.mxl')).toBe(true);
    expect(isAllowedFileUrl('https://www.cpdl.org/wiki/images/a/ab/X.pdf')).toBe(false);
    expect(isAllowedFileUrl('http://www.cpdl.org/wiki/images/a/ab/X.mxl')).toBe(false);
    expect(isAllowedFileUrl('https://www.cpdl.org.evil.com/wiki/images/X.mxl')).toBe(false);
    expect(isAllowedFileUrl('https://www.cpdl.org/wiki/index.php?x=/wiki/images/X.mxl')).toBe(false);
  });
  it('cleans titles', () => expect(cleanTitle('  Tu\tscendi\n dalle   stelle ')).toBe('Tu scendi dalle stelle'));
});
