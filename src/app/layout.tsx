import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'Land Signal — Northbridge' };

const LINKS = [
  { href: '/', label: 'For-Sale Alerts' },
  { href: '/finder', label: 'Parcel Finder' },
  { href: '/add', label: 'Add Listing' },
  { href: '/settings', label: 'Settings' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav style={{ borderBottom: '1px solid var(--line)', background: 'var(--ink2)' }}>
          <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
            <Link href="/" className="flex items-center gap-2">
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--lime)', boxShadow: '0 0 13px var(--lime)' }} />
              <span className="display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: '.04em' }}>LAND SIGNAL</span>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)', marginLeft: 6 }}>Northbridge</span>
            </Link>
            <div className="flex gap-1 text-sm">
              {LINKS.map(l => (
                <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2"
                  style={{ color: 'var(--text)' }}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
