import { test, expect } from '@playwright/test';
import { newUserPage } from './helpers';
import { USERS } from './env';

test('I — l’utente salva alcuni canti, va offline e continua a consultarli', async ({ browser }) => {
  const page = await newUserPage(browser, USERS.user, '/offline');
  // Wait until the service worker controls the page (app shell precached).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  await page.getByRole('button', { name: /Salva tutti/ }).click();
  await expect(page.getByText(/canti salvati sul dispositivo/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('row', { name: /Luce del mattino/ })).toBeVisible();

  await page.context().setOffline(true);
  // A full reload while offline: the app shell comes from the service worker,
  // the library and songs from IndexedDB.
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Biblioteca dei canti' })).toBeVisible();
  await page.getByRole('searchbox').fill('resta con noi');
  await page.getByRole('link', { name: /Resta con noi, Signore/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Resta con noi, Signore' })).toBeVisible();
  await expect(page.getByText('Copia salvata sul dispositivo')).toBeVisible();
  await page.getByRole('group', { name: 'Modalità di visualizzazione' }).getByRole('button', { name: 'Testo' }).click();
  await expect(page.getByText('Resta con noi, Signore, si fa sera').first()).toBeVisible();
  // Registered users keep the chords offline too.
  await page.getByRole('group', { name: 'Modalità di visualizzazione' }).getByRole('button', { name: 'Accordi' }).click();
  await expect(page.locator('.seg__chord').first()).toBeVisible();
  await page.context().setOffline(false);
});
