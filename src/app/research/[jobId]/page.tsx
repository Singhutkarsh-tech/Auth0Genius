import { ResearchWorkspace } from '@/components/research-workspace';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Research an integration' };
export default async function ResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { jobId } = await params;
  const { q } = await searchParams;
  return (
    <ResearchWorkspace
      jobId={jobId}
      initialQuery={q?.slice(0, 200) ?? ''}
      protectedResearch={!!process.env.RESEARCH_ACCESS_CODE}
    />
  );
}
