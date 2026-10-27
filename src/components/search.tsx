'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Search as SearchIcon, Sparkles } from 'lucide-react';
import type { Guide } from '@/lib/validation';
import { matches } from '@/lib/providers';
import { ProviderLogo } from './ui';
export function Search({ guides, compact = false }: { guides: Guide[]; compact?: boolean }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [keyboardSelected, setKeyboardSelected] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const results = query.trim()
    ? guides.filter((g) => matches(g, query)).slice(0, 5)
    : guides.filter((g) => g.featured);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) ||
        ((e.metaKey || e.ctrlKey) && e.key === 'k')
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('mousedown', outside);
    };
  }, []);
  const research = () => router.push(`/research/new?q=${encodeURIComponent(query.trim())}`);
  const go = () => {
    if (keyboardSelected && results[index]) router.push(`/providers/${results[index].slug}`);
    else if (query.trim().length >= 2) research();
  };
  return (
    <div className={compact ? 'search-wrap compact' : 'search-wrap'} ref={root}>
      <form
        className="hero-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <SearchIcon size={21} />
        <input
          ref={input}
          aria-label="Search integrations"
          aria-controls="provider-suggestions"
          aria-expanded={open}
          role="combobox"
          autoComplete="off"
          placeholder="Search Gmail, Slack, GitHub, or paste an app URL..."
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setIndex(0);
            setKeyboardSelected(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'ArrowDown') {
              setKeyboardSelected(true);
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === 'ArrowUp') {
              setKeyboardSelected(true);
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
          }}
        />
        <kbd>⌘ K</kbd>
        <button className="search-submit" aria-label="Search provider" type="submit">
          <ArrowRight size={18} />
        </button>
      </form>
      {open && (
        <div className="search-results" id="provider-suggestions" role="listbox">
          <div className="search-caption">
            {query ? 'Matching integrations' : 'Popular integrations'}
          </div>
          {results.map((g, i) => (
            <button
              key={g.slug}
              role="option"
              aria-selected={i === index}
              className={i === index ? 'search-result selected' : 'search-result'}
              onClick={() => router.push(`/providers/${g.slug}`)}
            >
              <ProviderLogo guide={g} />
              <span>
                {g.name}
                <small>{new URL(g.website).hostname} · Saved guide</small>
              </span>
              <CornerDownLeft size={15} />
            </button>
          ))}
          {query.trim().length >= 2 && (
            <button className="research-result" onClick={research}>
              <Sparkles size={17} />
              <span>
                Research “{query.slice(0, 70)}” with AI
                <small>Investigate OAuth support and requirements</small>
              </span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
