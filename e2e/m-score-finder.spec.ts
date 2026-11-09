import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';
import { sql, USERS } from './env';

// The CPDL proxy (Edge Function) is mocked: the test checks the app side, i.e.
// that the song title triggers a search, and that one tap imports the score
// into the editor with its source pre-filled. The real CPDL is not contacted.
test('M — dal titolo del canto lo spartito MusicXML si importa da CPDL con un tocco', async ({ page }) => {
  test.setTimeout(120_000);
  const songId = sql(`select id from public.songs where number = 901`);
  const searches: string[] = [];
  const candidate = {
    page: 'Luce del mattino (Prova)', pageUrl: 'https://www.cpdl.org/wiki/index.php/Luce_del_mattino_(Prova)',
    file: 'Luce-del-mattino.musicxml', url: 'https://www.cpdl.org/wiki/images/a/ab/Luce-del-mattino.musicxml', size: 4096,
  };
  await page.route('**/functions/v1/score-search', async (route) => {
    const body = route.request().postDataJSON() as { action: string; title?: string; url?: string };
    expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
    if (body.action === 'search') {
      searches.push(body.title!);
      return route.fulfill({ json: { results: [candidate] } });
    }
    expect(body.url).toBe(candidate.url);
    return route.fulfill({ body: readFileSync('e2e/fixtures/esercizio.musicxml'), contentType: 'application/octet-stream' });
  });

  await signIn(page, USERS.admin, `/spartiti/nuovo?canto=${songId}`);
  const finder = page.getByRole('region', { name: 'Spartiti trovati su CPDL' });
  await expect(finder.getByText('Luce del mattino (Prova)')).toBeVisible();
  expect(searches).toContain('Luce del mattino');

  await finder.getByRole('button', { name: 'Importa' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Esercizio' })).toBeVisible();
  await expect(page.locator('.score-canvas g.note')).toHaveCount(5, { timeout: 60_000 });
  await expect(finder.getByRole('button', { name: 'Importato' })).toBeVisible();

  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Spartito ufficiale della parrocchia').click();
  await expect(dialog.getByLabel('Fonte')).toHaveValue(/CPDL – Luce del mattino \(Prova\)/);
  await expect(dialog.getByLabel('Diritti')).toHaveValue('licensed');
});
