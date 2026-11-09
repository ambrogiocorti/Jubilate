import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { sql, USERS } from './env';

// CPDL blocks automated requests (Cloudflare challenge), so Jubilate opens the
// search on CPDL with the song title and the user loads the downloaded file.
test('M — dal titolo del canto si apre la ricerca su CPDL e il file scaricato si carica con la fonte', async ({ page }) => {
  test.setTimeout(120_000);
  const songId = sql(`select id from public.songs where number = 901`);
  await signIn(page, USERS.admin, `/spartiti/nuovo?canto=${songId}`);
  const finder = page.getByRole('region', { name: 'Spartito da CPDL' });

  const link = finder.getByRole('link', { name: 'Cerca su CPDL' });
  const href = new URL((await link.getAttribute('href'))!);
  expect(href.origin).toBe('https://www.cpdl.org');
  expect(href.searchParams.get('search')).toBe('Luce del mattino');
  await expect(link).toHaveAttribute('target', '_blank');

  await finder.locator('input[type=file]').setInputFiles('e2e/fixtures/esercizio.musicxml');
  await expect(page.getByRole('heading', { level: 1, name: 'Esercizio' })).toBeVisible();
  await expect(page.locator('.score-canvas g.note')).toHaveCount(5, { timeout: 60_000 });
  await expect(finder.getByText('Caricato: esercizio.musicxml')).toBeVisible();

  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Spartito ufficiale della parrocchia').click();
  await expect(dialog.getByLabel('Fonte')).toHaveValue(/CPDL \(www\.cpdl\.org\), ricerca «Luce del mattino», file esercizio\.musicxml/);
  await expect(dialog.getByLabel('Diritti')).toHaveValue('licensed');
});
