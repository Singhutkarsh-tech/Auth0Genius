import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test('homepage loads with ten providers and exactly three featured integrations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know what it takes');
  await expect(page.getByTestId('provider-row')).toHaveCount(10);
  await expect(page.locator('.featured-card')).toHaveCount(3);
  for (const name of ['Gmail', 'Slack', 'GitHub'])
    await expect(
      page.locator('.featured-card').getByRole('heading', { name, exact: true }),
    ).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true });
});
test('search resolves an alias and opens the saved guide', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search integrations' });
  await search.fill('Google Mail');
  await search.press('Enter');
  await expect(page).toHaveURL('/providers/gmail');
  await expect(page.getByRole('heading', { level: 1, name: 'Gmail', exact: true })).toBeVisible();
});
test('search keyboard shortcut and suggestions work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search integrations' }).click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'Search integrations' })).toBeFocused();
  await page.keyboard.type('slac');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/providers/slack');
});
test('library filtering works with meaningful empty state', async ({ page }) => {
  await page.goto('/providers');
  await page.getByRole('button', { name: 'CRM', exact: true }).click();
  await expect(page.getByTestId('provider-row')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Filter integrations' }).fill('no-such-provider');
  await expect(page.getByRole('heading', { name: 'No matching integrations' })).toBeVisible();
});
test('checklist saves progress, launch route and next best action update', async ({ page }) => {
  await page.goto('/providers/gmail');
  const boxes = page.getByRole('checkbox');
  const firstTitle = await page.locator('.setup-step h3').first().textContent();
  await boxes.first().check();
  await expect(page.locator('.next-action')).not.toContainText(firstTitle!);
  await expect(page.locator('.route-stage').first()).toContainText('In progress');
  await page.reload();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await page.getByRole('button', { name: 'Mark blocked' }).nth(1).click();
  await expect(page.locator('.route-stage').first()).toContainText('Blocked');
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'docs/screenshots/guide-desktop.png', fullPage: true });
});
test('share copies a valid persistent provider URL', async ({ page }) => {
  await page.goto('/providers/github');
  await page.getByRole('button', { name: 'Share guide' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/providers\/github$/);
});
test('unmatched provider opens explicit research flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search integrations' }).fill('Airtable');
  await page.getByRole('button', { name: 'Research “Airtable” with AI' }).click();
  await expect(page).toHaveURL(/\/research\/new\?q=Airtable/);
  await expect(page.getByLabel('Provider name or official website')).toHaveValue('Airtable');
});
test('research errors are honest and no stage is falsely completed', async ({ page }) => {
  await page.route('**/api/research', (route) =>
    route.fulfill({
      status: 201,
      json: { jobId: 'mockresearchfailure12345', url: '/research/mockresearchfailure12345' },
    }),
  );
  await page.route('**/api/research/mockresearchfailure12345', (route) =>
    route.fulfill({
      json: {
        id: 'mockresearchfailure12345',
        query: 'Airtable',
        status: 'failed',
        currentStage: 0,
        completedStages: [],
        error:
          'Live research is not configured. Add OPENAI_API_KEY and TAVILY_API_KEY on the server.',
        outputUrl: null,
        attempted: [],
        sources: [],
      },
    }),
  );
  await page.goto('/research/new?q=Airtable');
  await page.getByRole('button', { name: 'Research with AI', exact: true }).click();
  await expect(page.locator('.research-error[role=alert]')).toContainText('OPENAI_API_KEY');
  await expect(page.locator('.research-stage.done')).toHaveCount(0);
});
test('mobile navigation, guide and layout fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Explore integrations' })
    .click();
  await expect(page).toHaveURL('/providers');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/providers/slack');
  await expect(page.getByRole('heading', { name: 'Slack', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/guide-mobile.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know what it takes');
  await expect(page.getByTestId('provider-row')).toHaveCount(10);
  await page.screenshot({ path: 'docs/screenshots/home-mobile.png', fullPage: true });
});
test('a persisted generated fixture opens independently by URL', async ({ page }) => {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/browser-fixture.ts', 'create'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
  try {
    await page.goto('/providers/e2e-generated-fixture');
    await expect(page.getByRole('heading', { name: 'Generated fixture', level: 1 })).toBeVisible();
    await expect(page.locator('.guide-content')).toContainText('Evidence, not just answers.');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Generated fixture', level: 1 })).toBeVisible();
  } finally {
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/browser-fixture.ts', 'delete'], {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
  }
});
test('provider API resolves domains and bad URLs are rejected', async ({ request }) => {
  const response = await request.get('/api/providers?q=GMAIL.COM');
  expect(response.status()).toBe(200);
  expect((await response.json()).providers.map((p: { slug: string }) => p.slug)).toEqual(['gmail']);
  const unsafe = await request.post('/api/research', { data: { query: 'https://127.0.0.1' } });
  expect(unsafe.status()).toBe(400);
});
