'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Parcel Finder' },
  { href: '/alerts', label: 'For-Sale Alerts' },
  { href: '/saved', label: 'Saved' },
  { href: '/add', label: 'Add Listing' },
  { href: '/settings', label: 'Settings' },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 text-sm">
      {LINKS.map(l => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2"
            style={active
              ? { color: 'var(--ink)', background: 'var(--amber)', fontWeight: 600 }
              : { color: 'var(--text)' }}>
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
