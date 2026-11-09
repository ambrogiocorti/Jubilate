import { test, expect } from '@playwright/test';
import { signIn, openSong } from './helpers';
import { USERS } from './env';

// Toasts live in the top layer; they must be centred and fully on screen on
// both phone and desktop widths (a regression left them clipped at the left).
for (const viewport of [{ width: 412, height: 860 }, { width: 1440, height: 900 }]) {
  test(`messaggi popup centrati e leggibili (${viewport.width}px)`, async ({ browser }) => {
    const context = await browser.newContext({ locale: 'it-IT', viewport });
    const page = await context.newPage();
    await signIn(page, USERS.user);
    await openSong(page, '901', 'Luce del mattino');
    const fav = page.getByRole('button', { name: /preferiti/ });
    await fav.click();
    const toast = page.locator('.toast').filter({ hasText: /preferiti/ });
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(4);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await toast.getByRole('button', { name: 'Chiudi messaggio' }).click();
    await expect(toast).toBeHidden();
    // restore state for other tests
    await fav.click();
    await context.close();
  });
}
