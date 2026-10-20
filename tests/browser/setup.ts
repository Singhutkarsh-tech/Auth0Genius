import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
export default function setup() {
  const url = process.env.PLAYWRIGHT_TEST_DATABASE_URL!;
  const file = url.slice(5);
  if (!existsSync(file)) writeFileSync(file, '');
  process.env.DATABASE_URL = url;
  try {
    execFileSync(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'db',
        'push',
        '--schema',
        'prisma/schema.prisma',
        '--skip-generate',
      ],
      { env: process.env, stdio: 'pipe' },
    );
    execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {
      env: process.env,
      stdio: 'pipe',
    });
  } catch (error) {
    const result = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `Isolated browser database bootstrap failed: ${result.stdout ?? ''} ${result.stderr ?? ''}`,
    );
  }
}
