// Renders the PWA icons from the logo SVG (run: node scripts/generate-icons.mjs).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const inner = svg.replace(/<svg[^>]*>|<\/svg>/g, '').replace(/<rect[^>]*\/>/, '');
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const page = await (await chromium.launch()).newPage();
async function render(file, size, { rounded, pad }) {
  const scale = (1 - pad * 2);
  const html = `<html><body style="margin:0;background:transparent">
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="#0f2744"/>
      <g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${inner}</g>
    </svg></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.locator('svg').screenshot({ path: new URL(file, out).pathname, omitBackground: true });
}
await render('icon-192.png', 192, { rounded: true, pad: 0 });
await render('icon-512.png', 512, { rounded: true, pad: 0 });
await render('icon-maskable-512.png', 512, { rounded: false, pad: 0.12 });
await render('apple-touch-icon.png', 180, { rounded: false, pad: 0.06 });
await page.context().browser().close();
console.log('icons written');
