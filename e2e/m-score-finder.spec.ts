import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';
import { sql, USERS } from './env';

// CPDL and the score-search proxy are simulated: the tests check the app side
// (the song title triggers a search; one tap imports the score with its source
// pre-filled). The real CPDL is not contacted.
const PAGE = 'Luce del mattino (Prova)';
const FILE_URL = 'https://www.cpdl.org/wiki/images/a/ab/Luce-del-mattino.musicxml';
const fixture = () => readFileSync('e2e/fixtures/esercizio.musicxml');

async function mockCpdl(page: Page, searches: string[]) {
  await page.route('https://www.cpdl.org/**', async (route) => {
    const url = new URL(route.request().url());
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (url.pathname === '/wiki/api.php') {
      const p = Object.fromEntries(url.searchParams);
      expect(p.origin).toBe('*');
      if (p.list === 'search') {
        searches.push(p.srsearch!);
        return route.fulfill({ headers: cors, json: { query: { search: [{ title: PAGE, pageid: 7 }] } } });
      }
      if (p.prop === 'images') return route.fulfill({ headers: cors, json: { query: { pages: [{ pageid: 7, title: PAGE, images: [{ title: 'File:Luce-del-mattino.musicxml' }, { title: 'File:Luce.pdf' }] }] } } });
      if (p.prop === 'imageinfo') return route.fulfill({ headers: cors, json: { query: { pages: [{ title: 'File:Luce-del-mattino.musicxml', imageinfo: [{ url: FILE_URL, size: 4096 }] }] } } });
    }
    if (url.href === FILE_URL) return route.fulfill({ headers: cors, body: fixture(), contentType: 'application/xml' });
    return route.abort();
  });
}

async function importAndCheck(page: Page) {
  const songId = sql(`select id from public.songs where number = 901`);
  await signIn(page, USERS.admin, `/spartiti/nuovo?canto=${songId}`);
  const finder = page.getByRole('region', { name: 'Spartiti trovati su CPDL' });
  await expect(finder.getByText(PAGE)).toBeVisible();
  await finder.getByRole('button', { name: 'Importa' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Esercizio' })).toBeVisible();
  await expect(page.locator('.score-canvas g.note')).toHaveCount(5, { timeout: 60_000 });
  await expect(finder.getByRole('button', { name: 'Importato' })).toBeVisible();
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Spartito ufficiale della parrocchia').click();
  await expect(dialog.getByLabel('Fonte')).toHaveValue(/CPDL – Luce del mattino \(Prova\)/);
  await expect(dialog.getByLabel('Diritti')).toHaveValue('licensed');
}

test('M — dal titolo del canto lo spartito si cerca su CPDL e si importa con un tocco', async ({ page }) => {
  test.setTimeout(120_000);
  const searches: string[] = [];
  let proxyCalls = 0;
  await mockCpdl(page, searches);
  await page.route('**/functions/v1/score-search', (route) => { proxyCalls++; return route.abort(); });
  await importAndCheck(page);
  expect(searches).toContain('Luce del mattino');
  expect(proxyCalls).toBe(0);
});

test('M2 — se CPDL non è raggiungibile dal browser si usa il servizio di Jubilate', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('https://www.cpdl.org/**', (route) => route.abort());
  await page.route('**/functions/v1/score-search', async (route) => {
    const body = route.request().postDataJSON() as { action: string; title?: string; url?: string };
    expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
    if (body.action === 'search') {
      return route.fulfill({ json: { results: [{ page: PAGE, pageUrl: 'https://www.cpdl.org/wiki/index.php/X', file: 'Luce-del-mattino.musicxml', url: FILE_URL, size: 4096 }] } });
    }
    expect(body.url).toBe(FILE_URL);
    return route.fulfill({ body: fixture(), contentType: 'application/octet-stream' });
  });
  await importAndCheck(page);
});
