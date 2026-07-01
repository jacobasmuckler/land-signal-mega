import { prisma } from '@/lib/prisma';
import AlertsMap from '@/components/AlertsMap';

export const dynamic = 'force-dynamic';

function money(value?: number | null) {
  return value ? `$${Math.round(value).toLocaleString()}` : '—';
}
function miles(value?: number | null) {
  return value == null ? 'Unverified' : `${value.toFixed(1)} mi`;
}

export default async function AlertsDashboard() {
  const listings = await prisma.listing.findMany({ orderBy: { dateFound: 'desc' }, take: 300 });
  const logs = await prisma.scanLog.findMany({ orderBy: { startedAt: 'desc' }, take: 5 });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold display">For-Sale Alerts</h1>
          <p style={{ color: 'var(--muted)' }}>20+ acre listed and pre-market leads within 100 miles of Uptown Charlotte.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <form action="/api/backfill" method="post">
            <button className="btn" title="Pull all past LandWatch / Land.com emails">Backfill LandWatch/Land.com</button>
          </form>
          <form action="/api/listings/delete-zillow" method="post">
            <button className="btn danger">Delete all Zillow</button>
          </form>
          <form action="/api/scan" method="post">
            <button className="btn btn-primary">Scan Now</button>
          </form>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Total Leads</div><div className="text-3xl font-bold">{listings.length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Good Picks</div><div className="text-3xl font-bold">{listings.filter((l: any) => l.status === 'Good').length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Pre-Market</div><div className="text-3xl font-bold">{listings.filter((l: any) => l.marketStage === 'Pre-Market').length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Alerts Sent</div><div className="text-3xl font-bold">{listings.filter((l: any) => l.alertSent).length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Last Scan</div><div className="text-sm font-semibold">{logs[0]?.startedAt?.toLocaleString() || 'Never'}</div></div>
      </div>

      <AlertsMap listings={listings.map((l: any) => ({
        id: l.id, title: l.title, source: l.source, address: l.address, county: l.county,
        acreage: l.acreage, price: l.price, latitude: l.latitude, longitude: l.longitude,
        marketStage: l.marketStage, status: l.status, listingUrl: l.listingUrl, distanceFromCharlotte: l.distanceFromCharlotte,
      }))} />

      <div className="card p-4 flex items-center justify-between gap-4 flex-wrap">
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
          Need a clean reset? This removes all rows from the dashboard. It does not delete Gmail emails or scanner settings.
        </div>
        <form action="/api/listings/clear-all" method="post">
          <button className="btn danger" type="submit">Clear all listings</button>
        </form>
      </div>

      {/* Per-listing cards — no horizontal scroll; review controls sit inline */}
      <div className="space-y-3">
        {listings.length === 0 && (
          <div className="card p-8 text-center" style={{ color: 'var(--muted)' }}>No listings yet. Hit “Scan Now” or “Backfill LandWatch/Land.com”.</div>
        )}
        {listings.map((listing: any) => (
          <div key={listing.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div style={{ minWidth: 0, flex: '1 1 340px' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={listing.marketStage === 'Pre-Market' ? 'pill pill-pre' : 'pill pill-good'}>{listing.marketStage}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>{listing.source}</span>
                  {listing.status === 'Good' && <span className="pill pill-good">Good</span>}
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{listing.fitScore}/10</span>
                </div>
                <h3 className="display" style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>
                  {listing.listingUrl
                    ? <a href={listing.listingUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline' }}>{listing.title}</a>
                    : listing.title}
                </h3>
                <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                  <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{listing.acreage} ac</span>
                  <span style={{ color: 'var(--text)' }}>{money(listing.price)}</span>
                  <span>{money(listing.pricePerAcre)}/ac</span>
                  <span>{listing.county ? `${listing.county} Co` : (listing.address || '—')}</span>
                  <span>{miles(listing.distanceFromCharlotte)}</span>
                  {(listing.brokerEmail || listing.brokerPhone) && <span>{listing.brokerEmail || listing.brokerPhone}</span>}
                </div>
                {listing.address && listing.county && <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{listing.address}</div>}
                <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                  {listing.listingUrl && <a href={listing.listingUrl} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>Open listing →</a>}
                  <form action={`/api/listings/${listing.id}`} method="post">
                    <input type="hidden" name="action" value="delete" />
                    <input type="hidden" name="redirectTo" value="/alerts" />
                    <button className="del-row mono" style={{ fontSize: 12 }} type="submit">Delete row</button>
                  </form>
                </div>
              </div>

              {/* review panel, fits inline — no scrolling right */}
              <form action={`/api/listings/${listing.id}`} method="post" style={{ flex: '1 1 300px', maxWidth: 420 }}>
                <input type="hidden" name="action" value="review" />
                <input type="hidden" name="redirectTo" value="/alerts" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                  <input type="checkbox" name="isGood" defaultChecked={listing.status === 'Good'} /> Flag as good
                </label>
                <textarea name="notes" defaultValue={listing.notes || ''} placeholder="Add team comment, next step, owner note…" className="input" style={{ minHeight: 56, fontSize: 13, width: '100%' }} />
                <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13, marginTop: 6 }} type="submit">Save review</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
