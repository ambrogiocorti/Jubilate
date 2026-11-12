import { test, expect } from '@playwright/test';

// Privacy notice and rights page are public and reachable from every page and from sign-up.
test('O — informativa privacy e diritti dei canti raggiungibili senza account', async ({ page }) => {
  await page.goto('./');
  const legal = page.getByRole('navigation', { name: 'Informazioni legali' });
  await legal.getByRole('link', { name: 'Informativa privacy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Informativa sulla privacy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'I tuoi diritti' })).toBeVisible();
  await expect(page.getByText(/Il titolare del trattamento è/)).toBeVisible();

  await page.getByRole('navigation', { name: 'Informazioni legali' }).getByRole('link', { name: 'Diritti dei canti e degli spartiti' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Diritti dei canti e degli spartiti' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Segnalare un problema' })).toBeVisible();

  await page.goto('./registrati');
  await page.getByRole('link', { name: 'informativa privacy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Informativa sulla privacy' })).toBeVisible();
});
