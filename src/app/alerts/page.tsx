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
  const listings = await prisma.listing.findMany({ orderBy: { dateFound: 'desc' }, take: 200 });
  const logs = await prisma.scanLog.findMany({ orderBy: { startedAt: 'desc' }, take: 5 });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold display">For-Sale Alerts</h1>
          <p style={{ color: 'var(--muted)' }}>20+ acre listed and pre-market leads within 100 miles of Uptown Charlotte.</p>
        </div>
        <div className="flex gap-2">
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

      <div className="card p-4 flex items-center justify-between gap-4">
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
          Need a clean reset? This removes all rows from the dashboard. It does not delete Gmail emails or scanner settings.
        </div>
        <form action="/api/listings/clear-all" method="post">
          <button className="btn danger" type="submit">Clear all listings</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left"><tr>
            {['Found', 'Stage', 'Source', 'Title', 'Address', 'County', 'Acres', 'Price', '$/Acre', 'Distance', 'Broker', 'Status', 'Score', 'Team Review'].map(header => <th key={header} className="p-3">{header}</th>)}
          </tr></thead>
          <tbody>
            {listings.map((listing: any) => (
              <tr key={listing.id} className="border-t align-top">
                <td className="p-3 whitespace-nowrap">{listing.dateFound.toLocaleDateString()}</td>
                <td className="p-3"><span className={listing.marketStage === 'Pre-Market' ? 'pill pill-pre' : 'pill pill-good'}>{listing.marketStage}</span></td>
                <td className="p-3">{listing.source}</td>
                <td className="p-3 font-medium">{listing.listingUrl ? <a className="underline" href={listing.listingUrl} target="_blank">{listing.title}</a> : listing.title}</td>
                <td className="p-3">{listing.address || '—'}</td>
                <td className="p-3">{listing.county || '—'}</td>
                <td className="p-3">{listing.acreage}</td>
                <td className="p-3">{money(listing.price)}</td>
                <td className="p-3">{money(listing.pricePerAcre)}</td>
                <td className="p-3">{miles(listing.distanceFromCharlotte)}</td>
                <td className="p-3">{listing.brokerEmail || listing.brokerPhone || '—'}</td>
                <td className="p-3">{listing.status === 'Good' ? <span className="pill pill-good">Good</span> : listing.status}</td>
                <td className="p-3">{listing.fitScore}/10</td>
                <td className="p-3" style={{ minWidth: 240 }}>
                  <form action={`/api/listings/${listing.id}`} method="post" className="space-y-2">
                    <input type="hidden" name="action" value="review" />
                    <input type="hidden" name="redirectTo" value="/alerts" />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" name="isGood" defaultChecked={listing.status === 'Good'} /> Flag as good
                    </label>
                    <textarea name="notes" defaultValue={listing.notes || ''} placeholder="Add team comment, next step, owner note…" className="input" style={{ minHeight: 54, fontSize: 13 }} />
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} type="submit">Save review</button>
                  </form>
                  <form action={`/api/listings/${listing.id}`} method="post" style={{ marginTop: 6 }}>
                    <input type="hidden" name="action" value="delete" />
                    <input type="hidden" name="redirectTo" value="/alerts" />
                    <button className="btn danger" style={{ padding: '6px 12px', fontSize: 13 }} type="submit">Delete row</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
