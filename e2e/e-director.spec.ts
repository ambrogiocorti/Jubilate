import { test, expect } from '@playwright/test';
import { newUserPage } from './helpers';
import { USERS } from './env';

test('E — richiesta del ruolo di direttore, approvazione e creazione di una stanza', async ({ browser }) => {
  const candidate = await newUserPage(browser, USERS.director, '/direttore');
  await candidate.getByLabel('Perché chiedi il ruolo?').fill('Dirigo il coro dei giovani alla Messa delle 11.');
  await candidate.getByRole('button', { name: 'Invia la richiesta' }).click();
  await expect(candidate.getByText('Richiesta in attesa')).toBeVisible();

  const admin = await newUserPage(browser, USERS.admin, '/admin/direttori');
  const item = admin.getByRole('listitem').filter({ hasText: 'Dirigo il coro dei giovani' }).filter({ hasText: 'in attesa' });
  await item.getByRole('button', { name: 'Approva' }).click();
  await expect(admin.getByText('Ruolo di direttore assegnato.')).toBeVisible();

  // Roles are read from the database: a reload picks up the new role.
  await candidate.goto('/stanze');
  await candidate.reload();
  await candidate.getByLabel('Titolo').fill('Messa delle 11 (prova)');
  await candidate.getByRole('button', { name: 'Crea stanza e genera il codice' }).click();
  await expect(candidate).toHaveURL(/\/stanze\/[0-9a-f-]{36}$/);
  await expect(candidate.getByRole('region', { name: 'Stanza in diretta' })).toContainText(/codice \d{6}/);
});
