import { test, expect } from '@playwright/test';
import { setupRoom, directorPicks } from './rooms';

test('G — navigazione libera senza interruzioni e ritorno alla diretta senza codice', async ({ browser }) => {
  const { director, participant } = await setupRoom(browser, 'Prova navigazione libera');
  await directorPicks(director, '901', 'Luce del mattino');
  await expect(participant.getByRole('heading', { level: 1, name: 'Luce del mattino' })).toBeVisible();

  // 2–3. Free browsing to another song.
  await participant.getByRole('button', { name: 'Navigazione libera' }).click();
  await participant.getByRole('searchbox').fill('904');
  await participant.getByRole('link', { name: /Adeste fideles/ }).click();
  await expect(participant.getByRole('heading', { level: 1, name: 'Adeste fideles' })).toBeVisible();

  // 4–5. The director changes song: the participant is not interrupted, only notified.
  await directorPicks(director, '902', 'Resta con noi, Signore');
  const banner = participant.getByRole('region', { name: 'Stanza attiva' });
  await expect(banner).toContainText('Il direttore è passato a: 902 · Resta con noi, Signore');
  await expect(participant.getByRole('heading', { level: 1, name: 'Adeste fideles' })).toBeVisible();

  // Even after a reload the membership is kept (no code needed).
  await participant.reload();
  await expect(participant.getByRole('heading', { level: 1, name: 'Adeste fideles' })).toBeVisible();

  // 6–7. Back to live.
  await participant.getByRole('button', { name: 'Torna alla diretta' }).click();
  await expect(participant.getByRole('heading', { level: 1, name: 'Resta con noi, Signore' })).toBeVisible();
});
