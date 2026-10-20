import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  FileSearch,
  GitBranch,
  Layers3,
  Route,
  Search as SearchIcon,
  Sparkles,
} from 'lucide-react';
import { listGuides } from '@/lib/db/guides';
import { Search } from '@/components/search';
import { Library, ProviderCard } from '@/components/provider-library';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const guides = await listGuides();
  return (
    <main id="main">
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="tiny-spark">
              <Sparkles size={12} />
            </span>{' '}
            OAUTH INTEGRATION INTELLIGENCE <span className="eyebrow-divider" /> BUILT FOR AGENT
            DEVELOPERS
          </div>
          <h1>
            Know what it takes to
            <br />
            <span>launch an integration.</span>
          </h1>
          <p className="hero-description">
            Find provider OAuth requirements, understand approval timelines,
            <br className="desktop-break" /> and get a step-by-step launch plan — researched and
            verified by AI.
          </p>
          <Search guides={guides} />
          <div className="hero-suggestions">
            <span>Try an integration</span>
            {['Gmail', 'Slack', 'GitHub'].map((name) => (
              <Link key={name} href={`/providers/${name.toLowerCase()}`}>
                {name}
                <ArrowRight size={11} />
              </Link>
            ))}
            <span className="search-hint">or bring something new</span>
          </div>
          <div className="hero-assurances">
            <span>
              <BookOpen size={14} />
              Grounded in official docs
            </span>
            <span>
              <GitBranch size={14} />
              Managed or custom auth
            </span>
            <span>
              <Check size={14} />
              Clear human & agent ownership
            </span>
          </div>
        </div>
        <div className="hero-bottom">
          <span className="hero-bottom-label">
            <Layers3 size={14} /> FROM “CAN I CONNECT IT?” TO “READY TO LAUNCH.”
          </span>
          <span>
            Less tab-hopping. More building.
            <ArrowRight size={14} />
          </span>
        </div>
      </section>
      <div className="page-shell">
        <section className="featured-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">A GOOD PLACE TO START</div>
              <h2>Frequently used integrations</h2>
            </div>
            <Link className="text-link subtle" href="/providers">
              Explore all integrations
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="featured-grid">
            {guides
              .filter((g) => g.featured)
              .map((g) => (
                <ProviderCard guide={g} key={g.slug} />
              ))}
          </div>
        </section>
        <div className="value-strip">
          <span className="strip-icon">
            <Route size={21} />
          </span>
          <div>
            <strong>A launch plan. Not another wall of documentation.</strong>
            <p>Setup effort, provider approval, and your next action — in one practical guide.</p>
          </div>
          <span className="strip-tag">Built for the path to production</span>
        </div>
        <Library guides={guides} />
        <section id="how-it-works" className="how-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">FROM QUESTION TO CONNECTION</div>
              <h2>A clearer path to your next launch.</h2>
            </div>
          </div>
          <div className="how-grid">
            {[
              {
                icon: SearchIcon,
                title: 'Find your provider',
                text: 'Search the existing library or submit an unfamiliar application.',
              },
              {
                icon: FileSearch,
                title: 'Let the agent investigate',
                text: 'Research official setup documentation, scopes, and approval policies.',
              },
              {
                icon: Route,
                title: 'Follow your launch plan',
                text: 'Complete actionable steps, identify blockers, and share your guide.',
              },
            ].map((item, i) => (
              <div className="how-card" key={item.title}>
                <span className="how-icon">
                  <item.icon size={21} />
                </span>
                <span className="how-number">0{i + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
          <p className="transparency-note">
            AI-assisted research, with receipts. Source-backed claims, labeled estimates, and
            explicit unknowns.
          </p>
        </section>
      </div>
    </main>
  );
}
