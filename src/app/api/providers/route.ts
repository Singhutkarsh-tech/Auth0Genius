import { listGuides } from '@/lib/db/guides';
import { matches } from '@/lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').slice(0, 200);
  const category = searchParams.get('category');
  const providers = (await listGuides()).filter(
    (g) => (!q || matches(g, q)) && (!category || g.category === category),
  );
  return Response.json(
    { providers, total: providers.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
