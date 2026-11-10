import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';
import { sql, USERS } from './env';

// The score catalogue (free sacred scores from PDMX) is built at deploy time and
// served next to the app; here it is replaced by a small fixture.
const CATALOG = {
  source: 'test',
  items: [
    { i: 'QmLuce1', t: 'Luce del mattino', c: 'Anonimo', l: 'pd', y: 1, n: 1 },
    { i: 'QmLuce2', t: 'Luce del mattino (SATB)', c: 'Coro', l: 'cc0', y: 1, n: 4 },
    { i: 'QmAltro', t: 'Adeste fideles', c: '', l: 'pd', y: 1, n: 4 },
  ],
};

// Requests made by the service worker bypass page.route, so keep it out.
test.use({ serviceWorkers: 'block' });

test('M — il catalogo carica da solo lo spartito del canto; resta CPDL come alternativa', async ({ page }) => {
  test.setTimeout(120_000);
  const mxl = readFileSync('e2e/fixtures/esercizio.mxl');
  await page.route('**/catalogo/index.json', (r) => r.fulfill({ json: CATALOG }));
  await page.route('**/catalogo/*.mxl', (r) => r.fulfill({ body: mxl, contentType: 'application/vnd.recordare.musicxml' }));

  const songId = sql(`select id from public.songs where number = 901`);
  await signIn(page, USERS.admin, `/spartiti/nuovo?canto=${songId}`);
  const finder = page.getByRole('region', { name: 'Spartiti liberi' });

  // Automatic: the best match for the song title is loaded without any click.
  const results = finder.getByRole('list', { name: 'Spartiti trovati' });
  await expect(results.getByRole('listitem')).toHaveCount(2);
  await expect(finder.getByRole('button', { name: 'In uso: Luce del mattino' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Esercizio' })).toBeVisible();
  await expect(page.locator('.score-canvas g.note')).toHaveCount(5, { timeout: 60_000 });

  // Another result can be picked with one tap.
  await finder.getByRole('button', { name: 'Usa: Luce del mattino (SATB)' }).click();
  await expect(finder.getByRole('button', { name: 'In uso: Luce del mattino (SATB)' })).toBeVisible();

  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Spartito ufficiale della parrocchia').click();
  await expect(dialog.getByLabel('Fonte')).toHaveValue(/«Luce del mattino \(SATB\)» di Coro, MuseScore \(licenza CC0\), dal catalogo PDMX/);
  await expect(dialog.getByLabel('Diritti')).toHaveValue('public_domain');
  await dialog.getByRole('button', { name: 'Annulla' }).click();

  // Fallback: CPDL search link and upload of the downloaded file.
  const link = finder.getByRole('link', { name: 'Cerca su CPDL' });
  const href = new URL((await link.getAttribute('href'))!);
  expect(href.origin).toBe('https://www.cpdl.org');
  expect(href.searchParams.get('search')).toBe('Luce del mattino');
  await expect(link).toHaveAttribute('target', '_blank');
  await finder.locator('input[type=file]').setInputFiles('e2e/fixtures/esercizio.musicxml');
  await expect(finder.getByText('Caricato: esercizio.musicxml')).toBeVisible();
});

test('M2 — senza catalogo resta la ricerca su CPDL', async ({ page }) => {
  await page.route('**/catalogo/index.json', (r) => r.fulfill({ status: 404, body: 'not found' }));
  const songId = sql(`select id from public.songs where number = 901`);
  await signIn(page, USERS.admin, `/spartiti/nuovo?canto=${songId}`);
  const finder = page.getByRole('region', { name: 'Spartiti liberi' });
  await expect(finder.getByText("Nel catalogo non c'è uno spartito per «Luce del mattino»")).toBeVisible();
  await expect(finder.getByRole('link', { name: 'Cerca su CPDL' })).toBeVisible();
});
