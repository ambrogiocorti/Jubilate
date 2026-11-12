import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './helpers';
import { sql, USERS } from './env';

/** Automated WCAG 2.x A/AA checks (axe-core) on the main pages. Not a substitute for a manual audit. */
const pages = ['/', '/accedi', '/registrati', '/stanze', '/privacy', '/diritti'];

for (const path of pages) {
  test(`accessibilità (visitatore) ${path}`, async ({ page }) => {
    // Entrance animations (opacity) would be measured mid-fade: check the settled UI.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`.${path}`);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('accessibilità (utente) lettore con accordi, editor e profilo', async ({ page }) => {
  const songId = sql(`select id from public.songs where number = 901`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, USERS.user);
  for (const path of [`/canti/${songId}`, '/profilo', '/proposte/nuova', '/offline']) {
    await page.goto(`.${path}`);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});
