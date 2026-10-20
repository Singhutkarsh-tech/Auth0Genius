import { Prisma } from '@prisma/client';
import { db } from '.';
import { validateEvidence, downgradeUnreviewed, type Guide } from '../validation';
import { seedGuides } from '@/data/seed-providers';
export async function saveGuide(
  input: Guide,
  options: { tx?: Prisma.TransactionClient; publicationId?: string } = {},
) {
  const guide = validateEvidence(input);
  const write = async (tx: Prisma.TransactionClient) => {
    if (options.publicationId) {
      const existing = await tx.guide.findUnique({
        where: { id: options.publicationId },
        include: { provider: true },
      });
      if (existing) return { id: existing.id, slug: existing.provider.slug };
    }
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
        ...(options.publicationId ? { id: options.publicationId } : {}),
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
    if (guide.sources.length > 0) {
      await tx.evidenceSource.createMany({
        data: guide.sources.map((s) => ({
          guideId: record.id,
          sourceId: s.id,
          title: s.title,
          url: s.url,
          domain: s.domain,
          sourceType: s.type,
          accessedAt: new Date(s.accessedAt),
          summary: s.summary,
        })),
      });
    }
    return { id: record.id, slug: provider.slug };
  };
  return options.tx ? write(options.tx) : db.$transaction(write);
}
export async function listGuides(): Promise<Guide[]> {
  try {
    const providers = await db.provider.findMany({
      include: { guides: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });
    if (!providers.length) return seedGuides;
    const saved = providers.flatMap((p) =>
      p.guides.flatMap((g) => {
        // Use current reviewed seed definitions without rewriting the user's database.
        const seed = seedGuides.find((s) => s.slug === p.slug);
        if (
          seed &&
          (g.content as { provenance?: { method?: string } }).provenance?.method === 'seed_research'
        )
          return [seed];
        try {
          return [
            (g.content as { provenance?: { method?: string } }).provenance?.method ===
            'live_research'
              ? downgradeUnreviewed(g.content)
              : validateEvidence(g.content),
          ];
        } catch {
          return [downgradeUnreviewed(g.content)];
        }
      }),
    );
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
