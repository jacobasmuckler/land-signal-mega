import './globals.css';
import Link from 'next/link';
import { cookies } from 'next/headers';
import NavLinks from '@/components/NavLinks';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

export const metadata = { title: 'Land Signal' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySessionToken(cookies().get(SESSION_COOKIE)?.value).catch(() => null);
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
            </Link>
            <div className="flex items-center gap-3">
              <NavLinks />
              {session && (
                <form action="/api/auth/logout" method="post" className="flex items-center gap-2" style={{ borderLeft: '1px solid var(--line)', paddingLeft: 12 }}>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{session.name.split(' ')[0]}</span>
                  <button className="mono" style={{ fontSize: 11, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--line2)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Log out</button>
                </form>
              )}
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
