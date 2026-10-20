'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="empty-state full-empty">
      <h1>We couldn’t load this workspace.</h1>
      <p>Try again. Your saved guides and browser progress are kept separately.</p>
      <button onClick={reset} className="button primary">
        Try again
      </button>
      <Link href="/" className="text-link">
        Return to the launchpad
      </Link>
    </main>
  );
}
