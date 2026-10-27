import { test, expect } from '@playwright/test';
test('text-only saved-name submission opens research instead of silently selecting a saved provider', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').fill('Google Mail');
  await page.getByRole('combobox').press('Enter');
  await expect(page).toHaveURL(/\/research\/new\?q=Google%20Mail/);
});
test('one name candidate requires an explicit choice and remains paused after reload', async ({ page }) => {
  const jobId = 'singlecandidateconfirmation123';
  let selected = false;
  let posts = 0;
  await page.route(`**/api/research/${jobId}`, async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      expect(JSON.parse(route.request().postData()!)).toEqual({ candidateIndex: 0 });
      selected = true;
    }
    await route.fulfill({ json: { id: jobId, query: 'Orbit', identity: selected ? { name: 'Orbit', website: 'https://orbit.dev' } : null, status: selected ? 'failed' : 'blocked', selectionState: selected ? 'confirmed' : 'awaiting_provider_selection', currentStage: selected ? 1 : 0, completedStages: selected ? [0] : [], error: selected ? 'Expected terminal test fixture' : 'Select the intended provider.', outputUrl: null, sources: [], attempted: [], identityCandidates: selected ? [] : [{ index: 0, name: 'Orbit', website: 'https://orbit.dev', description: 'Orbit developer platform', evidenceUrl: 'https://orbit.dev/about', evidenceSummary: 'Fetched company description.' }] } });
  });
  await page.goto(`/research/${jobId}`);
  await expect(page.getByRole('heading', { name: 'Which provider do you mean?' })).toBeVisible();
  await expect(page.locator('.research-stage.done')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Select provider' })).toBeVisible();
  expect(posts).toBe(0);
  await page.getByRole('button', { name: 'Select provider' }).click();
  await expect(page.locator('.job-heading')).toContainText('https://orbit.dev');
  expect(posts).toBe(1);
});
test('no candidate offers a website and explicit refresh preserves the selected provider', async ({ page }) => {
  await page.route('**/api/research/nocandidateconfirmation123', (route) => route.fulfill({ json: { id: 'nocandidateconfirmation123', query: 'Invented company', status: 'blocked', currentStage: 0, completedStages: [], error: 'Enter the intended website.', outputUrl: null, attempted: [], sources: [], identityCandidates: [] } }));
  await page.goto('/research/nocandidateconfirmation123');
  await expect(page.getByRole('heading', { name: 'Confirm the official website' })).toBeVisible();
  await expect(page.getByLabel('Official website')).toBeVisible();
  await page.goto('/providers/github');
  await page.getByRole('button', { name: /Custom OAuth application/ }).click();
  await page.getByRole('checkbox').first().check();
  const progress = await page.evaluate(() => localStorage.getItem('auth0genius:github:v1'));
  await page.getByRole('link', { name: 'Re-research', exact: true }).click();
  await expect(page.getByLabel('Provider name or official website')).toHaveValue('https://github.com');
  await expect(page.locator('.research-form')).toContainText('Existing guide versions and local progress are preserved');
  let body: Record<string, unknown> = {};
  await page.route('**/api/research', async (route) => { body = JSON.parse(route.request().postData()!); await route.fulfill({ status: 429, json: { error: { message: 'Expected quota fixture; no paid research.' } } }); });
  await page.getByRole('button', { name: 'Research with AI', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Expected quota fixture');
  expect(body).toMatchObject({ query: 'https://github.com', selectedProviderSlug: 'github', refresh: true });
  expect(await page.evaluate(() => localStorage.getItem('auth0genius:github:v1'))).toBe(progress);
});
