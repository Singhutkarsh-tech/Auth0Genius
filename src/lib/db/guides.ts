import { Prisma } from '@prisma/client';
import { db } from '.';
import { validateEvidence, type Guide } from '../validation';
import { seedGuides } from '@/data/seed-providers';
export async function saveGuide(input: Guide) {
  const guide = validateEvidence(input);
  return db.$transaction(async (tx) => {
    const previous = await tx.provider.findUnique({ where: { slug: guide.slug } });
    const aliases = [
      ...new Set([
        ...(Array.isArray(previous?.aliases)
          ? previous.aliases.filter((a): a is string => typeof a === 'string')
          : []),
        ...guide.aliases,
      ]),
    ];
    const provider = await tx.provider.upsert({
      where: { slug: guide.slug },
      update: {
        name: guide.name,
        website: guide.website,
        description: guide.description,
        category: guide.category,
        aliases,
        ...(guide.logo ? { logo: guide.logo } : {}),
        ...(guide.provenance.method === 'seed_research' ? { featured: guide.featured } : {}),
      },
      create: {
        slug: guide.slug,
        name: guide.name,
        website: guide.website,
        description: guide.description,
        category: guide.category,
        aliases,
        logo: guide.logo,
        featured: guide.featured,
      },
    });
    const latest = await tx.guide.findFirst({
      where: { providerId: provider.id },
      orderBy: { version: 'desc' },
    });
    const version =
      guide.provenance.method === 'seed_research' ? guide.version : (latest?.version ?? 0) + 1;
    const content = {
      ...guide,
      version,
      aliases,
      featured: provider.featured,
      logo: provider.logo,
    };
    const record = await tx.guide.upsert({
      where: { providerId_version: { providerId: provider.id, version } },
      update: {
        status: guide.status,
        oauthStatus: guide.oauthStatus,
        managedAuth: guide.managedAuth,
        difficulty: guide.difficulty,
        approval: guide.approval,
        checkedAt: guide.checkedAt ? new Date(guide.checkedAt) : null,
        content: content as unknown as Prisma.InputJsonValue,
      },
      create: {
        providerId: provider.id,
        version,
        status: guide.status,
        oauthStatus: guide.oauthStatus,
        managedAuth: guide.managedAuth,
        difficulty: guide.difficulty,
        approval: guide.approval,
        content: content as unknown as Prisma.InputJsonValue,
        checkedAt: guide.checkedAt ? new Date(guide.checkedAt) : null,
        generatedAt: new Date(guide.generatedAt),
      },
    });
    await tx.evidenceSource.deleteMany({ where: { guideId: record.id } });
    for (const s of guide.sources)
      await tx.evidenceSource.create({
        data: {
          guideId: record.id,
          sourceId: s.id,
          title: s.title,
          url: s.url,
          domain: s.domain,
          sourceType: s.type,
          accessedAt: new Date(s.accessedAt),
          summary: s.summary,
        },
      });
    return { id: record.id, slug: provider.slug };
  });
}
export async function listGuides(): Promise<Guide[]> {
  try {
    const providers = await db.provider.findMany({
      include: { guides: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });
    if (!providers.length) return seedGuides;
    const saved = providers.flatMap((p) => p.guides.map((g) => validateEvidence(g.content)));
    return [...new Map([...seedGuides, ...saved].map((g) => [g.slug, g])).values()];
  } catch (error) {
    console.error(
      'Saved guide storage unavailable:',
      error instanceof Error ? error.message : 'database error',
    );
    return seedGuides;
  }
}
export async function findGuide(slug: string) {
  return (await listGuides()).find((g) => g.slug === slug);
}
