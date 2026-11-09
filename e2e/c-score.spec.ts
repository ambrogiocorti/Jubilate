import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';
import { sql, USERS } from './env';

test('C — importa un MusicXML, modifica una nota, salva, esporta e reimporta', async ({ page }) => {
  test.setTimeout(120_000);
  const songId = sql(`select id from public.songs where number = 901`);
  await signIn(page, USERS.user, `/spartiti/nuovo?canto=${songId}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // 1. Import
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/esercizio.musicxml');
  await expect(page.getByRole('heading', { level: 1, name: 'Esercizio' })).toBeVisible();
  // 2. Display (Verovio SVG)
  const notes = page.locator('.score-canvas g.note');
  await expect(notes).toHaveCount(5, { timeout: 60_000 });
  // 3. Select the second note (D4)
  await notes.nth(1).click({ force: true }); // the tap may land on a staff line
  await expect(page.getByText(/Battuta 1: Re4/)).toBeVisible();
  // 4. Modify: up one step (E4), then sharp (E#4 → shown as Mi♯4)
  await page.keyboard.press('ArrowUp');
  await expect(page.getByText(/Battuta 1: Mi4/)).toBeVisible();
  await page.keyboard.press('+');
  await expect(page.getByText(/Battuta 1: Mi♯4/)).toBeVisible();
  // Undo/redo
  await page.keyboard.press('Control+z');
  await expect(page.getByText(/Battuta 1: Mi4/)).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByText(/Battuta 1: Mi♯4/)).toBeVisible();
  // 5. Save as a personal score
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(page).toHaveURL(/\/spartiti\/[0-9a-f-]{36}$/);
  const saved = sql(`select v.musicxml from public.score_versions v join public.music_scores m on m.current_version_id = v.id
    join auth.users u on u.id = m.owner_id where u.email = '${USERS.user}' order by m.created_at desc limit 1`);
  expect(saved).toContain('<step>E</step><alter>1</alter>');
  // 6. Export
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Esporta MusicXML' }).click()]);
  const exported = readFileSync((await download.path())!, 'utf8');
  expect(exported).toContain('<score-partwise');
  expect(exported).toContain('<step>E</step><alter>1</alter>');
  expect(exported).toContain('<words>Lento</words>'); // unsupported content preserved
  // 7. Re-import the exported file: the change survives
  await page.goto(`./spartiti/nuovo?canto=${songId}`);
  await page.locator('input[type=file]').setInputFiles({ name: 'esportato.musicxml', mimeType: 'application/xml', buffer: Buffer.from(exported) });
  await expect(page.locator('.score-canvas g.note')).toHaveCount(5, { timeout: 60_000 });
  await page.locator('.score-canvas g.note').nth(1).click({ force: true });
  await expect(page.getByText(/Battuta 1: Mi♯4/)).toBeVisible();
});
