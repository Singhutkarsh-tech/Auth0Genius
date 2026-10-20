import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3182';
const url = new URL(baseURL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Browser tests require a local isolated server');
if (!process.env.PLAYWRIGHT_TEST_DATABASE_URL) {
  const directory = mkdtempSync(join(tmpdir(), 'a0g-browser-'));
  const file = join(directory, 'test.db');
  writeFileSync(file, '');
  process.env.A0G_OWNED_TEST_DIRECTORY = directory;
  process.env.PLAYWRIGHT_TEST_DATABASE_URL = `file:${file}`;
}
process.env.DATABASE_URL = process.env.PLAYWRIGHT_TEST_DATABASE_URL;
export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/setup.ts',
  globalTeardown: './tests/browser/teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] },
    },
  ],
  webServer: {
    command: `npm run ${process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'start' : 'dev'} -- --port ${url.port || '80'}`,
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 120000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || '.next',
      OPENAI_API_KEY: '',
      TAVILY_API_KEY: '',
      RESEARCH_ACCESS_CODE: '',
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
});
