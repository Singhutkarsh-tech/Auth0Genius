import Link from 'next/link';
import { Search } from 'lucide-react';
export default function NotFound() {
  return (
    <main id="main" className="empty-state full-empty">
      <Search size={32} />
      <div className="eyebrow">404 · OFF THE MAP</div>
      <h1>This guide hasn’t been written yet.</h1>
      <p>Find a provider in the library or start a new investigation.</p>
      <Link href="/providers" className="button primary">
        Explore integrations
      </Link>
    </main>
  );
}
