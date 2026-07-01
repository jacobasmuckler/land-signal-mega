import { prisma } from '@/lib/prisma';
import AlertsMap from '@/components/AlertsMap';

export const dynamic = 'force-dynamic';

function money(value?: number | null) {
  return value ? `$${Math.round(value).toLocaleString()}` : '—';
}

function miles(value?: number | null) {
  return value == null ? 'Unverified' : `${value.toFixed(1)} mi`;
}

export default async function Dashboard() {
  const listings = await prisma.listing.findMany({ orderBy: { dateFound: 'desc' }, take: 100 });
  const logs = await prisma.scanLog.findMany({ orderBy: { startedAt: 'desc' }, take: 5 });
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold display">For-Sale Alerts</h1>
          <p style={{ color: 'var(--muted)' }}>20+ acre listed and pre-market leads within 100 miles of Uptown Charlotte.</p>
        </div>
        <form action="/api/scan" method="post">
          <button className="btn btn-primary">Scan Now</button>
        </form>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="card p-4"><div className="text-sm text-slate-500">Total Leads</div><div className="text-3xl font-bold">{listings.length}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Pre-Market</div><div className="text-3xl font-bold">{listings.filter((l: any) => l.marketStage === 'Pre-Market').length}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Needs Location</div><div className="text-3xl font-bold">{listings.filter((l: any) => !l.locationVerified).length}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Alerts Sent</div><div className="text-3xl font-bold">{listings.filter((l: any) => l.alertSent).length}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Last Scan</div><div className="text-sm font-semibold">{logs[0]?.startedAt?.toLocaleString() || 'Never'}</div></div>
      </div>

      <AlertsMap listings={listings.map((l: any) => ({
        id: l.id, title: l.title, source: l.source, address: l.address, county: l.county,
        acreage: l.acreage, price: l.price, latitude: l.latitude, longitude: l.longitude,
        marketStage: l.marketStage, status: l.status, listingUrl: l.listingUrl, distanceFromCharlotte: l.distanceFromCharlotte,
      }))} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left"><tr>
            {['Found', 'Stage', 'Source', 'Title', 'Address', 'County', 'Acres', 'Price', '$/Acre', 'Distance', 'Broker', 'Status', 'Score'].map(header => <th key={header} className="p-3">{header}</th>)}
          </tr></thead>
          <tbody>
            {listings.map((listing: any) => (
              <tr key={listing.id} className="border-t">
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
                <td className="p-3">{listing.status}</td>
                <td className="p-3">{listing.fitScore}/10</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
