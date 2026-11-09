import { test, expect } from '@playwright/test';
import { signIn, openSong } from './helpers';
import { sql, USERS } from './env';

test('B — un musicista vede gli accordi, cambia tonalità e salva una versione personale', async ({ page }) => {
  await signIn(page, USERS.user);
  await openSong(page, '901', 'Luce del mattino');
  await page.getByRole('group', { name: 'Modalità di visualizzazione' }).getByRole('button', { name: 'Accordi' }).click();
  const firstChord = page.locator('.seg__chord').first();
  await expect(firstChord).toHaveText('Sol');
  // Transpose up a whole tone: G → A (La), with the key shown in the toolbar.
  await page.getByRole('button', { name: 'Alza di un semitono' }).click();
  await page.getByRole('button', { name: 'Alza di un semitono' }).click();
  await expect(page.getByRole('group', { name: 'Tonalità' })).toContainText('La');
  await expect(firstChord).toHaveText('La');
  // Create the personal version.
  await page.getByRole('button', { name: 'Altre azioni' }).click();
  await page.getByRole('button', { name: 'Crea versione personale' }).click();
  await expect(page).toHaveURL(/\/versioni\//);
  await page.getByLabel('Nome della versione').fill('Luce del mattino — in La');
  await page.getByRole('tab', { name: 'Posiziona accordi' }).click();
  await page.getByRole('button', { name: '+1', exact: true }).click();
  await page.getByRole('button', { name: '+1', exact: true }).click();
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(page.getByText('Tutto salvato')).toBeVisible();

  // Stored server-side, official song untouched.
  const stored = sql(`select a.name || '|' || (a.content->'chords'->0->>'chord') from public.personal_arrangements a
    join auth.users u on u.id = a.owner_id where u.email = '${USERS.user}' order by a.created_at desc limit 1`);
  expect(stored).toBe('Luce del mattino — in La|A');
  const official = sql(`select c.placements->0->>'chord' from public.chord_arrangements c join public.songs s on s.current_revision_id = c.revision_id
    where s.number = 901 and c.is_default`);
  expect(official).toBe('G');
});
