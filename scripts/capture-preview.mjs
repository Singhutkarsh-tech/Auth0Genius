import { chromium } from '@playwright/test';
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
for (const [label, width, height] of [
  ['desktop', 1440, 1000],
  ['mobile', 390, 844],
]) {
  await page.setViewportSize({ width, height });
  for (const [name, path] of [
    ['home', '/'],
    ['guide', '/providers/gmail'],
  ]) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.locator('h1').waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.activeElement?.blur?.();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: `docs/screenshots/${name}-${label}.png`, fullPage: true });
  }
}
await browser.close();
