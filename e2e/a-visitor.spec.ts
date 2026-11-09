import { test, expect } from '@playwright/test';

test('A — un visitatore cerca un canto e legge il testo senza registrarsi', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Biblioteca dei canti' })).toBeVisible();
  // Accent- and case-insensitive search on the lyrics.
  await page.getByRole('searchbox').fill('MISERICORDIAE');
  await expect(page.getByRole('link', { name: /Salve Regina/ })).toBeVisible();
  // Search by number.
  await page.getByRole('searchbox').fill('902');
  await page.getByRole('link', { name: /Resta con noi, Signore/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Resta con noi, Signore' })).toBeVisible();
  await expect(page.getByText('Resta con noi, Signore, si fa sera').first()).toBeVisible();
  // Visitors never receive chords: the "Accordi" mode is not available.
  await expect(page.locator('.seg__chord')).toHaveCount(0);
});
