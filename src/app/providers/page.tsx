import { listGuides } from '@/lib/db/guides';
import { Library } from '@/components/provider-library';
import { Search } from '@/components/search';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Explore integrations' };
export default async function Providers() {
  const guides = await listGuides();
  return (
    <main id="main" className="page-shell directory-page">
      <div className="directory-intro">
        <div className="eyebrow">YOUR OAUTH LAUNCHPAD</div>
        <h1>Less research. More building.</h1>
        <p>Find a source-backed launch plan for your agent’s next integration.</p>
        <Search guides={guides} compact />
      </div>
      <Library guides={guides} full />
    </main>
  );
}
