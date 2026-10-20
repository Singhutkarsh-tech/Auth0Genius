import type { Metadata } from 'next';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist-mono/400.css';
import './globals.css';
import { Header, Footer } from '@/components/layout';
export const metadata: Metadata = {
  title: { default: 'Auth0Genius — Your OAuth launchpad', template: '%s · Auth0Genius' },
  description:
    'From integration idea to production-ready OAuth. Source-backed provider setup, approval intelligence, and actionable launch plans.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
