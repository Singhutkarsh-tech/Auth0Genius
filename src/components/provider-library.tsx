'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Clock3,
  SlidersHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  Activity,
} from 'lucide-react';
import type { Guide } from '@/lib/validation';
import { approvalLabel, difficultyTone, matches } from '@/lib/providers';
import { Badge, ProviderLogo } from './ui';
export function ProviderCard({ guide }: { guide: Guide }) {
  return (
    <Link className="featured-card" href={`/providers/${guide.slug}`}>
      <div className="card-heading">
        <ProviderLogo guide={guide} large />
        <Badge tone={difficultyTone(guide.difficulty)}>
          <Activity size={11} />
          {guide.difficulty}
        </Badge>
      </div>
      <h3>{guide.name}</h3>
      <p>{guide.description}</p>
      <div className="card-facts">
        <span>
          <Clock3 size={14} />
          {guide.setupEffort.text}
        </span>
        <span>
          <ShieldCheck size={14} />
          {approvalLabel(guide.approval)}
        </span>
      </div>
      <div className="card-bottom">
        <span>View launch guide</span>
        <ArrowRight size={17} />
      </div>
    </Link>
  );
}
export function Library({ guides, full = false }: { guides: Guide[]; full?: boolean }) {
  const [category, setCategory] = useState('All integrations');
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('All difficulties');
  const categories = [
    'All integrations',
    'Developer tools',
    'Communication',
    'Email',
    'Productivity',
    'CRM',
    'Storage',
  ];
  const filtered = guides.filter(
    (g) =>
      (category === 'All integrations' || g.category === category) &&
      (!query || matches(g, query)) &&
      (difficulty === 'All difficulties' || g.difficulty === difficulty),
  );
  return (
    <section id="integrations" className="library-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE INTEGRATION LIBRARY</div>
          <h2>{full ? 'Explore integrations' : 'Your next integration starts here.'}</h2>
          <p>Real requirements. Clear next steps. Every source in the open.</p>
        </div>
        <Badge>{guides.length} researched guides</Badge>
      </div>
      <div className="library-toolbar">
        <div className="category-tabs" aria-label="Filter category">
          {categories.map((cat) => (
            <button
              className={category === cat ? 'active' : ''}
              onClick={() => setCategory(cat)}
              key={cat}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="library-filters">
          <label className="small-search">
            <Search size={15} />
            <input
              placeholder="Filter integrations..."
              aria-label="Filter integrations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="difficulty-filter">
            <SlidersHorizontal size={14} />
            <select
              value={difficulty}
              aria-label="Filter by difficulty"
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {['All difficulties', 'Easy', 'Moderate', 'Complex', 'Unknown'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="provider-table">
        <div className="table-header">
          <span>INTEGRATION</span>
          <span>SETUP COMPLEXITY</span>
          <span>APPROVAL</span>
          <span>GUIDE</span>
        </div>
        {filtered.map((g) => (
          <Link
            key={g.slug}
            href={`/providers/${g.slug}`}
            className="provider-row"
            data-testid="provider-row"
          >
            <div className="provider-cell">
              <ProviderLogo guide={g} />
              <span>
                <strong>{g.name}</strong>
                <small>{g.category}</small>
              </span>
            </div>
            <div>
              <Badge tone={difficultyTone(g.difficulty)}>{g.difficulty}</Badge>
            </div>
            <div className="approval-cell">
              <span className="status-dot" />
              {approvalLabel(g.approval)}
            </div>
            <div className="row-action">
              View guide
              <ArrowRight size={15} />
            </div>
          </Link>
        ))}
        {!filtered.length && (
          <div className="empty-state">
            <Search />
            <h3>No matching integrations</h3>
            <p>Try another filter, or investigate an unfamiliar provider.</p>
            <Link
              className="button secondary"
              href={`/research/new?q=${encodeURIComponent(query)}`}
            >
              Research with AI
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </div>
      <div className="library-foot">
        <span>
          <span className="status-dot" /> Official documentation first. Unknowns stay visible.
        </span>
        <span>
          {filtered.length} of {guides.length} guides
        </span>
      </div>
      <div className="research-cta">
        <span className="cta-icon">
          <Sparkles size={23} />
        </span>
        <div>
          <h3>Your stack doesn’t stop here.</h3>
          <p>Can’t find your integration? Research it with AI.</p>
        </div>
        <Link href="/research/new" className="button secondary">
          Research an integration
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
