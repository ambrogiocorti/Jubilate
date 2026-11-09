import { expect, type Browser, type Page } from '@playwright/test';
import { PASSWORD } from './env';

export async function signIn(page: Page, email: string, next = '/') {
  await page.goto(`/accedi?next=${encodeURIComponent(next)}`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page).not.toHaveURL(/\/accedi/);
  // Roles are resolved after sign-in; wait for the account entry in the nav.
  await page.waitForLoadState('networkidle');
}

export async function newUserPage(browser: Browser, email: string, next = '/') {
  const context = await browser.newContext({ locale: 'it-IT', viewport: { width: 412, height: 860 } });
  const page = await context.newPage();
  await signIn(page, email, next);
  return page;
}

export async function openSong(page: Page, query: string, title: string) {
  await page.goto('/');
  await page.getByRole('searchbox').fill(query);
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}
