import { test, expect } from '@playwright/test';
import { newUserPage } from './helpers';
import { sql, USERS } from './env';

test('D — un utente propone una correzione e l’amministratore la approva', async ({ browser }) => {
  const songId = sql(`select id from public.songs where number = 902`);
  const revBefore = sql(`select revision_number from public.song_revisions r join public.songs s on s.current_revision_id = r.id where s.number = 902`);
  const marker = `Rimani accanto a noi ${Date.now() % 100000}`;

  const user = await newUserPage(browser, USERS.user, `/proposte/nuova?tipo=correction&canto=${songId}`);
  await expect(user.getByRole('heading', { name: 'Nuova proposta' })).toBeVisible();
  const text = user.getByRole('textbox', { name: /^Testo di Strofa 1/ });
  await text.click();
  await text.press('Control+End');
  await text.pressSequentially(`\n${marker}`);
  await user.getByLabel("Messaggio per l'amministratore").fill('Aggiunta una riga, fonte: prova automatica.');
  await user.getByRole('button', { name: 'Invia per la revisione' }).click();
  await expect(user).toHaveURL(/\/proposte$/);
  await expect(user.getByText('Inviata').first()).toBeVisible();

  const admin = await newUserPage(browser, USERS.admin, '/admin/proposte');
  await admin.getByRole('link', { name: /Correzione del testo: Resta con noi/ }).first().click();
  await expect(admin.getByText(marker).first()).toBeVisible(); // shown in the diff
  await admin.getByLabel("Nota per l'autore").fill('Grazie, approvata.');
  await admin.getByRole('button', { name: 'Approva' }).click();
  await expect(admin).toHaveURL(/\/admin\/proposte$/);

  // A new official revision exists and readers see the change.
  const revAfter = sql(`select revision_number from public.song_revisions r join public.songs s on s.current_revision_id = r.id where s.number = 902`);
  expect(Number(revAfter)).toBe(Number(revBefore) + 1);
  expect(sql(`select status from public.contribution_requests where title like 'Correzione del testo: Resta con noi%' order by created_at desc limit 1`)).toBe('approved');
  const visitor = await browser.newPage();
  await visitor.goto(`/canti/${songId}`);
  await expect(visitor.getByText(marker)).toBeVisible();
});
