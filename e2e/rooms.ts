import { expect, type Browser, type Page } from '@playwright/test';
import { newUserPage } from './helpers';
import { sql, USERS } from './env';

/** Director (granted via SQL for isolation) creates a room; returns both pages and the code. */
export async function setupRoom(browser: Browser, title: string) {
  sql(`insert into public.user_roles (user_id, role)
       select id, 'director' from auth.users u where email = '${USERS.director}'
       and not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'director' and r.revoked_at is null)`);
  const director = await newUserPage(browser, USERS.director, '/stanze');
  await director.getByLabel('Titolo').fill(title);
  await director.getByRole('button', { name: 'Crea stanza e genera il codice' }).click();
  await expect(director).toHaveURL(/\/stanze\/[0-9a-f-]{36}$/);
  const meta = director.getByRole('region', { name: 'Stanza in diretta' }).locator('.room-banner__meta');
  await expect(meta).toContainText(/codice \d{6}/);
  const code = (await meta.innerText()).match(/\d{6}/)![0];

  const participant = await newUserPage(browser, USERS.participant, '/stanze');
  await participant.getByLabel('Codice della stanza').fill(code);
  await participant.getByRole('button', { name: 'Entra', exact: true }).click();
  await expect(participant).toHaveURL(/\/stanze\/[0-9a-f-]{36}$/);
  await expect(participant.getByText('In attesa del primo canto')).toBeVisible();
  return { director, participant, code };
}

export async function directorPicks(director: Page, query: string, title: string) {
  await director.getByRole('button', { name: 'Scegli canto' }).click();
  const dialog = director.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Cerca canto' }).fill(query);
  await dialog.getByRole('button', { name: new RegExp(title) }).first().click();
  await expect(director.getByRole('heading', { level: 1, name: title })).toBeVisible();
}
