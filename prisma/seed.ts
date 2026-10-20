import '../scripts/env';
import { seedGuides } from '../src/data/seed-providers';
import { saveGuide } from '../src/lib/db/guides';
import { db } from '../src/lib/db';
async function main() {
  for (const guide of seedGuides) await saveGuide(guide);
  console.log(`Seeded ${seedGuides.length} guides without duplicates.`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
