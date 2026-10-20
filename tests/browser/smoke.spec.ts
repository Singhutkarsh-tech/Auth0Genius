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
  await page.screenshot({ path: 'test-results/screenshots/home-desktop.png', fullPage: true });
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
  await expect(page.getByRole('button', { name: /Managed authentication/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('checkbox')).toHaveCount(5);
  const boxes = page.getByRole('checkbox');
  const firstTitle = await page.locator('.setup-step h3').first().textContent();
  await boxes.first().check();
  await expect(page.locator('.next-action')).not.toContainText(firstTitle!);
  await expect(page.locator('.route-stage').nth(1)).toContainText('In progress');
  await page.reload();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await page.getByRole('button', { name: 'Mark blocked' }).nth(1).click();
  await expect(page.locator('.route-stage').nth(1)).toContainText('Blocked');
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'test-results/screenshots/guide-desktop.png', fullPage: true });
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
test('a direct Figma URL stays the research identity and shows its resolved domain', async ({
  page,
}) => {
  const jobId = 'directfigmaidentityjob123';
  let submitted: { query?: string } = {};
  await page.route('**/api/research', async (route) => {
    submitted = JSON.parse(route.request().postData() ?? '{}') as { query?: string };
    await route.fulfill({
      status: 201,
      json: { jobId, url: `/research/${jobId}` },
    });
  });
  await page.route(`**/api/research/${jobId}`, (route) =>
    route.fulfill({
      json: {
        id: jobId,
        query: 'https://www.figma.com',
        identity: { name: 'Figma design platform', website: 'https://figma.com' },
        status: 'running',
        currentStage: 1,
        completedStages: [0],
        error: null,
        outputUrl: null,
        attempted: ['Fetched supplied Figma domain and confirmed its design-platform identity.'],
        sources: [],
        identityCandidates: [],
        execution: {
          claimable: false,
          blocked: false,
          leaseUntil: new Date(Date.now() + 60000).toISOString(),
          retryAfterMs: 60000,
          terminal: false,
        },
      },
    }),
  );
  await page.goto('/research/new?q=https%3A%2F%2Fwww.figma.com');
  await expect(page.getByLabel('Provider name or official website')).toHaveValue(
    'https://www.figma.com',
  );
  await page.getByRole('button', { name: 'Research with AI', exact: true }).click();
  await expect(page).toHaveURL(`/research/${jobId}`);
  expect(submitted.query).toBe('https://www.figma.com');
  await expect(page.locator('.job-heading')).toContainText('Figma design platform');
  await expect(page.locator('.job-heading')).toContainText('https://figma.com');
  await expect(page.locator('.job-heading')).not.toContainText('figma.jp');
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
test('ambiguous provider research pauses and submits the developer’s identity choice', async ({ page }) => {
  const jobId = 'ambiguousidentityjob123';
  const candidates = [
    {
      index: 0,
      name: 'Figma design platform',
      website: 'https://www.figma.com',
      description: 'Collaborative product design and prototyping.',
      evidenceUrl: 'https://www.figma.com/about/',
      evidenceSummary: 'Fetched identity page summary.',
    },
    {
      index: 1,
      name: 'Figma Japan',
      website: 'https://figma.jp',
      description: 'A separate country-domain business.',
      evidenceUrl: 'https://figma.jp/about/',
      evidenceSummary: 'Fetched identity page summary.',
    },
  ];
  let selected: number | undefined;
  await page.route(`**/api/research/${jobId}`, async (route) => {
    if (route.request().method() === 'POST') {
      selected = (JSON.parse(route.request().postData() ?? '{}') as { candidateIndex: number })
        .candidateIndex;
    }
    await route.fulfill({
      json: {
        id: jobId,
        query: 'Figma',
        identity:
          selected === undefined
            ? null
            : { name: 'Figma design platform', website: 'https://figma.com' },
        status: selected === undefined ? 'blocked' : 'running',
        currentStage: selected === undefined ? 0 : 1,
        completedStages: selected === undefined ? [] : [0],
        error: selected === undefined ? 'Two credible identities were found.' : null,
        outputUrl: null,
        attempted: ['Fetched identity evidence; OAuth research has not started.'],
        sources: [],
        identityCandidates: candidates,
        execution: {
          claimable: selected === undefined,
          blocked: selected === undefined,
          leaseUntil: selected === undefined ? null : new Date(Date.now() + 60000).toISOString(),
          retryAfterMs: selected === undefined ? 0 : 60000,
          terminal: false,
        },
      },
    });
  });
  await page.goto(`/research/${jobId}`);
  await expect(page.getByRole('heading', { name: 'Which provider do you mean?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inspect identity evidence' }).first()).toHaveAttribute(
    'href',
    'https://www.figma.com/about/',
  );
  await page.getByRole('button', { name: 'Select provider' }).first().click();
  await expect.poll(() => selected).toBe(0);
  await expect(page.locator('.job-heading')).toContainText('Figma design platform');
  await expect(page.locator('.job-heading')).toContainText('https://figma.com');
  await expect(page.getByRole('heading', { name: 'Which provider do you mean?' })).toHaveCount(0);
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
  await page.screenshot({ path: 'test-results/screenshots/guide-mobile.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know what it takes');
  await expect(page.getByTestId('provider-row')).toHaveCount(10);
  await page.screenshot({ path: 'test-results/screenshots/home-mobile.png', fullPage: true });
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
    await expect(page.locator('.next-action')).toContainText(
      'Review this step’s source evidence before proceeding',
    );
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
for (const [slug, count] of [
  ['gmail', 8],
  ['slack', 7],
  ['github', 7],
] as const)
  test(`${slug}: route switching and reload keep progress and recommendations separate`, async ({
    page,
  }) => {
    await page.goto(`/providers/${slug}`);
    const managed = page.getByRole('button', { name: /Managed authentication/ });
    const custom = page.getByRole('button', { name: /Custom OAuth application/ });
    await expect(managed).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('checkbox')).toHaveCount(5);
    await page.getByRole('checkbox').first().check();
    await expect(page.locator('.next-action')).toContainText(
      'Review this step’s source evidence before proceeding',
    );
    await expect(page.locator('.next-action')).not.toContainText('Cloud project');
    await custom.click();
    await expect(custom).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('checkbox')).toHaveCount(count);
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
    await page.getByRole('checkbox').first().check();
    await page.reload();
    await expect(custom).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('checkbox').first()).toBeChecked();
    await managed.click();
    await expect(page.getByRole('checkbox')).toHaveCount(5);
    await expect(page.getByRole('checkbox').first()).toBeChecked();
    await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();
    await expect(page.locator('.sidebar-progress')).toContainText('1 of 5');
    await expect(page.locator('.route-stage').first()).toContainText('Not applicable');
  });
test('unknown managed availability stays uncertain and custom is a deliberate selection', async ({
  page,
}) => {
  await page.goto('/providers/linear');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('checkbox').check();
  await expect(page.locator('.next-action')).toContainText(
    'Check managed authentication availability',
  );
  await expect(page.locator('.route-stage').first()).toContainText('Not researched');
  await page.getByRole('button', { name: /Custom OAuth application/ }).click();
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('button', { name: /Custom OAuth application/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('legacy local progress is migrated only to custom OAuth', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'auth0genius:gmail:v1',
      JSON.stringify({ completed: ['gmail-1'], blocked: [] }),
    ),
  );
  await page.goto('/providers/gmail');
  await expect(page.getByRole('button', { name: /Custom OAuth application/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await page.getByRole('button', { name: /Managed authentication/ }).click();
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
});
function fixture(command: string, ...args: string[]) {
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/browser-fixture.ts', command, ...args],
    { cwd: process.cwd(), env: process.env, stdio: 'pipe' },
  ).toString();
}
test('two tabs automatically recover an abandoned lease and terminal jobs stay terminal', async ({
  page,
  context,
  request,
}) => {
  const { id } = JSON.parse(fixture('lease'));
  const second = await context.newPage();
  try {
    await Promise.all([page.goto(`/research/${id}`), second.goto(`/research/${id}`)]);
    await expect(page.locator('.research-error[role=alert]')).toContainText('OPENAI_API_KEY', {
      timeout: 15000,
    });
    await expect(second.locator('.research-error[role=alert]')).toContainText('TAVILY_API_KEY', {
      timeout: 15000,
    });
    const state = await request.get(`/api/research/${id}`).then((r) => r.json());
    expect(state.status).toBe('failed');
    expect(state.currentStage).toBe(0);
    expect(state.completedStages).toEqual([]);
    const terminal = await request.post(`/api/research/${id}`).then((r) => r.json());
    expect(terminal.executionResult).toMatchObject({ claimed: false, outcome: 'terminal' });
    let postCount = 0;
    second.on('request', (req) => {
      if (req.method() === 'POST') postCount++;
    });
    await second.reload();
    await expect(second.locator('.research-error')).toBeVisible();
    expect(postCount).toBe(0);
  } finally {
    await second.close();
    fixture('job-delete', id);
  }
});
test('a transient advancement failure is retried without page reload', async ({ page }) => {
  let posts = 0;
  const state = {
    id: 'transientregressionjob123',
    query: 'Example',
    status: 'running',
    currentStage: 0,
    completedStages: [],
    error: null,
    outputUrl: null,
    attempted: [],
    sources: [],
  };
  await page.route('**/api/research/transientregressionjob123', (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      if (posts === 1)
        return route.fulfill({
          status: 503,
          json: { error: { message: 'Transient advancement error' } },
        });
      return route.fulfill({
        json: {
          ...state,
          status: 'failed',
          error: 'Expected terminal fixture after automatic retry.',
        },
      });
    }
    return route.fulfill({ json: state });
  });
  await page.goto('/research/transientregressionjob123');
  await expect(page.locator('.research-error')).toContainText('Expected terminal fixture', {
    timeout: 10000,
  });
  expect(posts).toBe(2);
});
test('live-shaped evidence remains unknown and does not inherit a dangling callback citation', async ({
  page,
}) => {
  fixture('live-shaped');
  try {
    await page.goto('/providers/e2e-live-shaped');
    await expect(page.locator('.guide-meta')).toContainText('OAuth unknown');
    await expect(page.locator('.guide-heading p')).toContainText('Partial provider research');
    await expect(page.locator('.guide-meta')).toContainText('Managed auth unknown');
    await page.getByRole('button', { name: /Custom OAuth application/ }).click();
    await expect(page.locator('.callback-panel')).toHaveCount(0);
    await expect(page.locator('.auth-detail')).toContainText(
      'Review OAuth evidence before registration',
    );
    await expect(page.locator('.auth-detail')).not.toContainText('Register with the provider');
    await expect(page.locator('#source-s1')).toContainText('Synthetic fetched');
    await expect(page.locator('#source-c1')).toBeAttached();
    await expect(page.locator('.next-action')).toContainText('Verify OAuth support');
  } finally {
    fixture('live-shaped-delete');
  }
});
