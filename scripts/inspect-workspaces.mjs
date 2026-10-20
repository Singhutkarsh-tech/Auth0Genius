import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3185';
const browser = await chromium.launch({ headless: true });
const observations = [];
for (const [device, width, height] of [
  ['desktop', 1440, 1000],
  ['mobile', 390, 844],
]) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  for (const slug of ['gmail', 'slack', 'github', 'linear']) {
    await page.goto(`${base}/providers/${slug}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.evaluate(async () => document.fonts.ready);
    observations.push({
      device,
      provider: slug,
      route: await page.locator('main').getAttribute('data-auth-route'),
      checkboxes: await page.getByRole('checkbox').count(),
      nextAction: await page.locator('.next-action strong').textContent(),
      fits: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    });
    if (slug === 'gmail' || slug === 'linear')
      await page.screenshot({ path: `docs/screenshots/p1-${slug}-${device}.png`, fullPage: false });
    if (slug === 'gmail' && device === 'desktop')
      await page
        .locator('#checklist')
        .screenshot({ path: 'docs/screenshots/p1-managed-checklist.png' });
  }
  await context.close();
}
await browser.close();
writeFileSync('docs/p1-ui-verification.json', JSON.stringify(observations, null, 2) + '\n');
console.log(JSON.stringify(observations));
