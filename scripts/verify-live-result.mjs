import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [inputPath = 'docs/live-research-p1.json', outputPath = 'docs/live-research-p1-restart.json'] = process.argv.slice(2);
const run = JSON.parse(readFileSync(inputPath, 'utf8'));
assert.equal(run.fresh, true);
assert.equal(run.outcome, 'generated_pending_semantic_review');
const base = new URL(run.outputUrl).origin;
const slug = new URL(run.outputUrl).pathname.split('/').filter(Boolean).at(-1);
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await context.request.get(`${base}/api/providers?q=${encodeURIComponent(slug)}`);
  assert.equal(response.status(), 200);
  const guide = (await response.json()).providers.find((g) => g.slug === slug);
  assert.ok(guide, `Saved guide ${slug} is available in a fresh request context`);
  assert.equal(guide.provenance.method, 'live_research');
  assert.equal(guide.generatedAt >= run.startedAt, true);
  for (const source of guide.sources) {
    assert.equal(source.capture, 'fetched');
    assert.equal(createHash('sha256').update(source.content).digest('hex'), source.contentHash);
  }
  const job = await (await context.request.get(`${base}/api/research/${run.jobId}`)).json();
  assert.equal(job.status, 'completed');
  assert.deepEqual(job.completedStages, [0, 1, 2, 3, 4, 5, 6]);
  await page.goto(`${base}/research/${run.jobId}`);
  await page.waitForURL(run.outputUrl);
  await page.getByRole('heading', { name: guide.name, exact: true }).waitFor();
  await context.close();

  const independent = await browser.newContext();
  const saved = await independent.newPage();
  saved.on('pageerror', (error) => errors.push(error.message));
  await saved.goto(run.outputUrl, { waitUntil: 'networkidle' });
  await saved.getByRole('heading', { name: guide.name, exact: true }).waitFor();
  assert.ok((await saved.getByText(`OAuth ${guide.oauthStatus}`, { exact: true }).count()) > 0);
  assert.ok((await saved.getByText(`Managed auth ${guide.managedAuth}`, { exact: true }).count()) > 0);
  await saved.getByRole('button', { name: /Custom OAuth application/ }).click();
  assert.ok((await saved.getByRole('checkbox').count()) > 0);
  assert.match(
    await saved.locator('.next-action strong').innerText(),
    /Review this step’s source evidence before proceeding/,
  );
  assert.equal(await saved.locator('main').getAttribute('data-auth-route'), 'custom');
  await saved.evaluate(() => window.scrollTo(0, 0));
  await saved.screenshot({ path: `docs/screenshots/${slug}-desktop.png` });
  await independent.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const small = await mobile.newPage();
  await small.goto(run.outputUrl, { waitUntil: 'networkidle' });
  assert.equal(
    await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await small.screenshot({ path: `docs/screenshots/${slug}-mobile.png` });
  await mobile.close();
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    phase: 'Fresh contexts after application restart; preserved isolated SQLite database',
    jobId: run.jobId,
    guideId: job.outputGuideId,
    generatedAt: guide.generatedAt,
    outputUrl: run.outputUrl,
    completedStages: job.completedStages,
    researchPageNavigatedToSavedGuide: true,
    independentSavedUrlOpened: true,
    mobileFits: true,
    pageErrors: errors,
    fetchedSources: guide.sources.map((s) => ({
      id: s.id,
      url: s.url,
      authority: s.authority,
      contentHash: s.contentHash,
      characters: s.content.length,
    })),
    classifications: {
      oauth: guide.oauthStatus,
      managed: guide.managedAuth,
      approval: guide.approval,
    },
    semanticAcceptance:
      'Partial only: see the independent material-claim audit in docs/research-audit.md. No automatic semantic verification is claimed.',
  };
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
