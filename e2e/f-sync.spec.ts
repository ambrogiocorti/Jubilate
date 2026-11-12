import { test, expect } from '@playwright/test';
import { setupRoom, directorPicks } from './rooms';

test('F — il direttore cambia canto e il dispositivo del partecipante si aggiorna', async ({ browser }) => {
  const { director, participant } = await setupRoom(browser, 'Prova sincronizzazione');
  await directorPicks(director, '901', 'Luce del mattino');
  await expect(participant.getByRole('heading', { level: 1, name: 'Luce del mattino' })).toBeVisible();
  await directorPicks(director, '903', 'Salve Regina');
  await expect(participant.getByRole('heading', { level: 1, name: 'Salve Regina' })).toBeVisible();
});
