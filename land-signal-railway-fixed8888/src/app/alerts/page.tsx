import { prisma } from '@/lib/prisma';
import AlertsMap from '@/components/AlertsMap';

export const dynamic = 'force-dynamic';

function money(value?: number | null) {
  return value ? `$${Math.round(value).toLocaleString()}` : '—';
}
function miles(value?: number | null) {
  return value == null ? 'Needs location' : `${value.toFixed(1)} mi`;
}
function fmtEastern(value?: Date | null) {
  if (!value) return 'Never';
  return value.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}

export default async function AlertsDashboard() {
  const listings = await prisma.listing.findMany({ orderBy: { dateFound: 'desc' }, take: 300 });
  const logs = await prisma.scanLog.findMany({ orderBy: { startedAt: 'desc' }, take: 5 });

  // A scan is "running" when the newest log has no finish time yet (scans are
  // hard-capped at 3.5 min, so anything older than 10 min is a dead run).
  const newest = logs[0];
  const scanRunning = !!newest && !newest.finishedAt
    && Date.now() - new Date(newest.startedAt).getTime() < 10 * 60 * 1000;

  // The Railway cron should scan at least hourly — if nothing has run in 3+
  // hours the scheduled scanner service is down/misconfigured. Surface that
  // instead of letting the board silently go stale.
  const hoursSinceLastScan = newest ? (Date.now() - new Date(newest.startedAt).getTime()) / 3600000 : Infinity;
  const schedulerLooksDead = !scanRunning && hoursSinceLastScan > 3;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {schedulerLooksDead && (
        <div className="card p-4" style={{ borderColor: 'var(--amber)' }}>
          <b style={{ color: 'var(--amber)' }}>⚠ Automatic scans have stopped.</b>
          <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 14 }}>
            Last scan was {hoursSinceLastScan === Infinity ? 'never' : `${Math.floor(hoursSinceLastScan)}h ago`} — the scheduled scanner should run at least hourly.
            Check Railway → <b>scheduled-scannerPRO</b>: is the latest deploy green, and is a Cron Schedule set under Settings (e.g. <span className="mono">*/15 * * * *</span>)?
          </span>
        </div>
      )}
      {scanRunning && (
        <>
          {/* auto-refresh every 10s while a scan is in flight */}
          <meta httpEquiv="refresh" content="10" />
          <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'var(--cyan)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 10px var(--cyan)' }} />
            <div>
              <b style={{ color: 'var(--cyan)' }}>Scan in progress…</b>
              <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 14 }}>
                started {fmtEastern(newest.startedAt)} — this page refreshes itself; new leads appear as they&apos;re found.
              </span>
            </div>
          </div>
        </>
      )}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold display">For-Sale Alerts</h1>
          <p style={{ color: 'var(--muted)' }}>20+ acre listed and pre-market leads within 100 miles of Uptown Charlotte.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <form action="/api/backfill" method="post">
            <button className="btn" disabled={scanRunning} style={scanRunning ? { opacity: .45, cursor: 'not-allowed' } : undefined} title="Pull a small batch of older LandWatch / Land.com emails">Backfill small batch</button>
          </form>
          <form action="/api/scan" method="post">
            <button className="btn btn-primary" disabled={scanRunning} style={scanRunning ? { opacity: .45, cursor: 'not-allowed' } : undefined}>{scanRunning ? 'Scanning…' : 'Scan Now'}</button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Total Leads</div><div className="text-3xl font-bold">{listings.length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Good Picks</div><div className="text-3xl font-bold" style={{ color: 'var(--lime)' }}>{listings.filter((l: any) => l.status === 'Good').length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Pre-Market</div><div className="text-3xl font-bold" style={{ color: 'var(--amber)' }}>{listings.filter((l: any) => l.marketStage === 'Pre-Market').length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Needs Location</div><div className="text-3xl font-bold" style={{ color: 'var(--cyan)' }}>{listings.filter((l: any) => !l.locationVerified).length}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--muted)' }}>Last Scan</div><div className="text-sm font-semibold" style={{ marginTop: 8 }}>{fmtEastern(logs[0]?.startedAt)}</div></div>
      </div>

      {logs[0]?.notes && (
        <details className="card p-4 mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text)' }}>Last scan details — {fmtEastern(logs[0]?.startedAt)}</summary>
          <div style={{ marginTop: 8, lineHeight: 1.7 }}>{logs[0].notes}</div>
        </details>
      )}

      <AlertsMap listings={listings.map((l: any) => ({
        id: l.id, title: l.title, source: l.source, address: l.address, county: l.county,
        acreage: l.acreage, price: l.price, latitude: l.latitude, longitude: l.longitude,
        marketStage: l.marketStage, status: l.status, listingUrl: l.listingUrl, distanceFromCharlotte: l.distanceFromCharlotte,
      }))} />

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
                  {listing.status === 'Good' && <span className="pill pill-good">★ Good</span>}
                  {!listing.locationVerified && <span className="pill" style={{ border: '1px solid var(--cyan)', color: 'var(--cyan)' }}>Needs location</span>}
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>Fit {listing.fitScore}/10</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>· found {fmtEastern(listing.dateFound)}</span>
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
                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {listing.listingUrl
                    ? <a href={listing.listingUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '5px 13px', fontSize: 12.5 }}>Open listing ↗</a>
                    : <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>No listing link in the alert email</span>}
                  <form action={`/api/listings/${listing.id}/utility-research`} method="post">
                    <input type="hidden" name="redirectTo" value="/alerts" />
                    <button className="del-row mono" style={{ fontSize: 12, color: 'var(--cyan)' }} type="submit">Research utilities</button>
                  </form>
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

      {/* Danger zone — kept at the very bottom so nobody wipes the board by accident */}
      <details className="card p-4" style={{ marginTop: 24 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>Danger zone</summary>
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            Removes every row from the dashboard. Gmail emails and settings are untouched.
          </div>
          <form action="/api/listings/clear-all" method="post">
            <button className="btn danger" type="submit">Clear all listings</button>
          </form>
        </div>
      </details>
    </div>
  );
}
