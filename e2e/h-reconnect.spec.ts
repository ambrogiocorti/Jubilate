import { test, expect } from '@playwright/test';
import { setupRoom, directorPicks } from './rooms';

test('H — dopo una perdita di connessione il partecipante recupera il canto corrente', async ({ browser }) => {
  const { director, participant } = await setupRoom(browser, 'Prova riconnessione');
  await directorPicks(director, '901', 'Luce del mattino');
  await expect(participant.getByRole('heading', { level: 1, name: 'Luce del mattino' })).toBeVisible();

  await participant.context().setOffline(true);
  await expect(participant.getByText(/Offline: il canto resta visibile/)).toBeVisible();
  // The song stays readable while offline.
  await expect(participant.getByRole('heading', { level: 1, name: 'Luce del mattino' })).toBeVisible();

  // Changes made while the participant is offline.
  await directorPicks(director, '905', 'Veni Creator Spiritus');

  await participant.context().setOffline(false);
  await expect(participant.getByRole('heading', { level: 1, name: 'Veni Creator Spiritus' })).toBeVisible({ timeout: 30_000 });
  await expect(participant.getByText(/In diretta · codice/)).toBeVisible();
});
