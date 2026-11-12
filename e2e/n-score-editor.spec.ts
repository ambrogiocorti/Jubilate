import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { USERS } from './env';

// The editing palette works by touch alone: select, change pitch and duration,
// add a note and type a syllable, without keyboard shortcuts.
test('N — il pannello di modifica guida la scrittura di uno spartito con il tocco', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, USERS.user, '/spartiti/nuovo');
  const panel = page.getByRole('region', { name: 'Modifica dello spartito' });
  await expect(panel.getByText('Tocca una nota nello spartito per modificarla.')).toBeVisible();
  await expect(page.locator('.score-canvas svg').first()).toBeVisible({ timeout: 60_000 });

  await panel.getByRole('button', { name: 'Inizia dalla prima nota' }).click();
  await expect(panel.getByText(/^Battuta 1: pausa/)).toBeVisible();

  // Pitch: the rest becomes a G.
  await panel.getByRole('button', { name: 'Sol', exact: true }).click();
  await expect(panel.getByText(/^Battuta 1: Sol4/)).toBeVisible();
  await panel.getByRole('button', { name: 'Diesis' }).click();
  await expect(panel.getByText(/^Battuta 1: Sol♯4/)).toBeVisible();

  // Duration.
  await panel.getByRole('tab', { name: 'Durata' }).click();
  await panel.getByRole('button', { name: 'Semiminima' }).click();
  await expect(panel.getByText(/^Battuta 1: Sol♯4, semiminima$/)).toBeVisible();

  // Add a note after it: the new note is selected.
  await panel.getByRole('tab', { name: 'Aggiungi' }).click();
  await panel.getByRole('button', { name: 'Nota dopo questa' }).click();
  await expect(panel.getByRole('button', { name: 'Nota precedente' })).toBeVisible();

  // Lyrics: Enter saves the syllable and moves on.
  await panel.getByRole('button', { name: 'Nota precedente' }).click();
  await expect(panel.getByText(/^Battuta 1: Sol♯4, semiminima$/)).toBeVisible();
  await panel.getByRole('tab', { name: 'Testo e accordi' }).click();
  await panel.getByLabel('Sillaba sotto la nota').fill('Glo');
  await panel.getByLabel('Sillaba sotto la nota').press('Enter');
  await panel.getByRole('button', { name: 'Nota precedente' }).click();
  await expect(panel.getByLabel('Sillaba sotto la nota')).toHaveValue('Glo');

  // Closing the note brings back the score-wide settings.
  await panel.getByRole('button', { name: 'Chiudi la nota' }).click();
  await expect(panel.getByLabel('Titolo dello spartito')).toBeVisible();
});
