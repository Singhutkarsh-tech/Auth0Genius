import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const mode = process.argv[2] || 'generate';
const url = process.env.DATABASE_URL || 'file:./dev.db';
const postgres = /^postgres(?:ql)?:\/\//.test(url);
if (mode === 'production' && !postgres)
  throw new Error('Production requires a hosted PostgreSQL DATABASE_URL.');
const schema = postgres ? 'prisma/schema.postgres.prisma' : 'prisma/schema.prisma';
const run = (args) =>
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', ...args, '--schema', schema],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
  );
if (mode === 'generate') run(['generate']);
else if (mode === 'push' || mode === 'production') {
  run(['db', 'push']);
} else throw new Error('Unsupported database command');
