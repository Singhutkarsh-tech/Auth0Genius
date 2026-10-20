import { notFound } from 'next/navigation';
import { findGuide } from '@/lib/db/guides';
import { GuideWorkspace } from '@/components/guide-workspace';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await findGuide(slug);
  return { title: guide ? `${guide.name} OAuth launch guide` : 'Guide not found' };
}
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await findGuide(slug);
  if (!guide) notFound();
  return <GuideWorkspace guide={guide} />;
}
