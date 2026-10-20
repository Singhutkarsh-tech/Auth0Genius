import { rmSync } from 'node:fs';
export default function teardown() {
  if (process.env.A0G_OWNED_TEST_DIRECTORY)
    rmSync(process.env.A0G_OWNED_TEST_DIRECTORY, { recursive: true, force: true });
}
