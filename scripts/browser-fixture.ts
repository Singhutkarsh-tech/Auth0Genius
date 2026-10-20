import './env';
import { seedGuides } from '../src/data/seed-providers';
import { saveGuide } from '../src/lib/db/guides';
import { db } from '../src/lib/db';
import { liveGuide } from '../tests/helpers/live-guide';
async function main() {
  if (process.argv[2] === 'lease') {
    const job = await db.researchJob.create({
      data: {
        query: 'Abandoned lease regression',
        normalizedProvider: 'lease-regression',
        status: 'running',
        leaseUntil: new Date(Date.now() + 2500),
        completedStages: [],
        context: { sources: [], attempted: [] },
      },
    });
    console.log(JSON.stringify({ id: job.id }));
    return;
  }
  if (process.argv[2] === 'job-delete') {
    await db.researchJob.deleteMany({ where: { id: process.argv[3] } });
    return;
  }
  if (process.argv[2] === 'live-shaped') {
    const g = liveGuide();
    g.slug = 'e2e-live-shaped';
    g.name = 'Live-shaped evidence fixture';
    await saveGuide(g);
    return;
  }
  if (process.argv[2] === 'live-shaped-delete') {
    await db.provider.deleteMany({ where: { slug: 'e2e-live-shaped' } });
    return;
  }

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
