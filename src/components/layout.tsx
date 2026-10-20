'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Code2, Menu, X, MoveUpRight } from 'lucide-react';
export function Header() {
  const [open, setOpen] = useState(false);
  const repo = process.env.NEXT_PUBLIC_GITHUB_URL;
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link href="/" className="brand" aria-label="Auth0Genius home">
          <span className="brand-icon">
            <MoveUpRight size={21} strokeWidth={2.8} />
          </span>
          Auth0Genius<span className="brand-beta">LAUNCHPAD</span>
        </Link>
        <nav aria-label="Main navigation" className={open ? 'nav-links open' : 'nav-links'}>
          <Link href="/providers" onClick={() => setOpen(false)}>
            Explore integrations
          </Link>
          <Link href="/#how-it-works" onClick={() => setOpen(false)}>
            How it works
          </Link>
          <a href="https://docs.composio.dev/docs/authentication" target="_blank" rel="noreferrer">
            Composio docs
            <ArrowUpRight size={13} />
          </a>
          {repo && (
            <a className="github-link" href={repo} target="_blank" rel="noreferrer">
              <Code2 size={16} />
              GitHub
            </a>
          )}
        </nav>
        <button
          className="icon-button menu-button"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <Link href="/" className="brand">
          <span className="brand-icon small">
            <MoveUpRight size={15} />
          </span>
          Auth0Genius
        </Link>
        <span>From integration idea to production-ready OAuth.</span>
        <span className="footer-note">An independent Composio concept · POC</span>
      </div>
    </footer>
  );
}
