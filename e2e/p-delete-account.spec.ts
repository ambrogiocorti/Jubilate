import { test, expect } from '@playwright/test';
import { localStack, sql, PASSWORD } from './env';
import { signIn } from './helpers';

// A user can delete their own account from the profile, after typing ELIMINA.
test('P — elimina il mio account dal profilo', async ({ page }) => {
  const email = `elimina-${Date.now()}@jubilate.test`;
  const { url, secret } = localStack();
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: 'Da eliminare' } }),
  });
  expect(res.ok).toBeTruthy();

  await signIn(page, email, '/profilo');
  await page.getByRole('button', { name: 'Elimina il mio account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminare il tuo account?' });
  const confirm = dialog.getByRole('button', { name: 'Elimina definitivamente' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Per confermare scrivi ELIMINA').fill('elimina');
  await confirm.click();

  await expect(page.getByText('Il tuo account è stato eliminato.')).toBeVisible();
  await expect(page).not.toHaveURL(/profilo/);
  expect(sql(`select count(*) from auth.users where email = '${email}'`)).toBe('0');

  // The account no longer exists: signing in fails.
  await page.goto('./accedi');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page.getByText('E-mail o password non corretti.')).toBeVisible();
});
