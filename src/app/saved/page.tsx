import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function money(value?: number | null) { return value ? `$${Math.round(value).toLocaleString()}` : '—'; }
function miles(value?: number | null) { return value == null ? 'Unverified' : `${value.toFixed(1)} mi`; }

export default async function SavedPage() {
  const listings = await prisma.listing.findMany({
    where: { status: 'Good' },
    orderBy: [{ fitScore: 'desc' }, { dateFound: 'desc' }],
  });
  const totalAcres = listings.reduce((sum: number, l: any) => sum + l.acreage, 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold display">Saved Plots</h1>
          <p style={{ color: 'var(--muted)' }}>Every parcel your team flagged as a good opportunity.</p>
        </div>
        <Link href="/alerts" className="btn">← Back to alerts</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:max-w-md">
        <div className="card p-5"><div className="text-sm" style={{ color: 'var(--muted)' }}>Saved</div><div className="mt-1 text-3xl font-bold">{listings.length}</div></div>
        <div className="card p-5"><div className="text-sm" style={{ color: 'var(--muted)' }}>Total acres</div><div className="mt-1 text-3xl font-bold">{totalAcres.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div></div>
      </div>

      {listings.length === 0 ? (
        <div className="card p-10 text-center" style={{ color: 'var(--muted)' }}>
          <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>No saved plots yet</div>
          <p className="mt-2 text-sm">On the <Link href="/alerts" style={{ color: 'var(--cyan)' }}>alerts dashboard</Link>, tick <b>Flag as good</b> on any listing and save the review — it will show up here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {listings.map((listing: any) => (
            <div key={listing.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold">{listing.acreage.toLocaleString()} <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>acres</span></div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{listing.address || listing.title}</div>
                  {listing.county && <div className="mt-1 mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{listing.county} County</div>}
                </div>
                <span className="pill pill-good">{listing.source}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><div className="text-xs" style={{ color: 'var(--muted)' }}>Price</div><div className="font-semibold">{money(listing.price)}</div></div>
                <div><div className="text-xs" style={{ color: 'var(--muted)' }}>Per acre</div><div className="font-semibold">{money(listing.pricePerAcre)}</div></div>
                <div><div className="text-xs" style={{ color: 'var(--muted)' }}>Distance</div><div className="font-semibold">{miles(listing.distanceFromCharlotte)}</div></div>
              </div>
              {listing.notes && (
                <div style={{ background: 'var(--ink2)', border: '1px solid var(--line2)', borderRadius: 8, padding: 10 }}>
                  <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--muted)' }}>Team note</span>
                  <div className="mt-1 text-sm">{listing.notes}</div>
                </div>
              )}
              <div className="mt-auto flex items-center gap-2 pt-1">
                {listing.listingUrl && <a href={listing.listingUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Open listing</a>}
                <form action={`/api/listings/${listing.id}/utility-research`} method="post">
                  <input type="hidden" name="redirectTo" value="/saved" />
                  <button className="btn" style={{ padding: '6px 12px', fontSize: 13 }} type="submit">Research utilities</button>
                </form>
                <form action={`/api/listings/${listing.id}`} method="post">
                  <input type="hidden" name="action" value="review" />
                  <input type="hidden" name="redirectTo" value="/saved" />
                  <input type="hidden" name="notes" value={listing.notes || ''} />
                  {/* no isGood field => status returns to New, removing from Saved */}
                  <button className="btn" style={{ padding: '6px 12px', fontSize: 13 }} type="submit">Unsave</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
