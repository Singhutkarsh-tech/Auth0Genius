import { ResearchWorkspace } from '@/components/research-workspace';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Research an integration' };
export default async function ResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ q?: string; provider?: string; refresh?: string }>;
}) {
  const { jobId } = await params;
  const { q, provider, refresh } = await searchParams;
  return (
    <ResearchWorkspace
      jobId={jobId}
      initialQuery={q?.slice(0, 200) ?? ''}
      initialProviderSlug={provider}
      refresh={refresh === 'true'}
      protectedResearch={!!process.env.RESEARCH_ACCESS_CODE && process.env.RESEARCH_PUBLIC_ACCESS !== 'true'}
    />
  );
}
