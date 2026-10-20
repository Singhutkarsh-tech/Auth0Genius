import './env';
import { seedGuides } from '../src/data/seed-providers';
import { saveGuide } from '../src/lib/db/guides';
import { db } from '../src/lib/db';
async function main() {
  if (process.argv[2] === 'delete') {
    await db.provider.deleteMany({ where: { slug: 'e2e-generated-fixture' } });
    return;
  }
  const guide = structuredClone(seedGuides[2]);
  guide.slug = 'e2e-generated-fixture';
  guide.name = 'Generated fixture';
  guide.featured = false;
  guide.provenance = {
    method: 'live_research',
    attempted: ['Deterministic browser test fixture; no live research claimed.'],
    limitations: ['Fixture only. Deleted after browser tests.'],
  };
  await saveGuide(guide);
}
main().finally(() => db.$disconnect());
