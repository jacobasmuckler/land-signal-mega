'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatReport, REPORT_META, REPORT_ORDER } from '@/lib/formatReport';

declare global { interface Window { L: any; } }

function scopeSummary(sc: any) {
  if (!sc) return null;
  return `${sc.polygon ? 'a hand-drawn area' : `within ${sc.radiusMiles} mi`}${sc.newOnly ? ' · new-construction comps only' : ''}${sc.criteria ? ` · ${sc.criteria}` : ''}`;
}

// A small embedded map for the detail view — the parcel pin, plus whatever
// comp area (drawn polygon or radius circle) its analysis was scoped to.
function MiniMap({ lat, lon, polygon, radiusMiles }: { lat: number; lon: number; polygon: [number, number][] | null; radiusMiles: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    function addScript(src: string) { return new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(); document.head.appendChild(s); }); }
    function addCss(href: string) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
    (async () => {
      try {
        addCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
        if (!window.L) await addScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
        if (cancelled || !elRef.current) return;
        const L = window.L;
        const map = L.map(elRef.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([lat, lon], polygon ? 13 : 12);
        mapObjRef.current = map;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
        L.marker([lat, lon]).addTo(map);
        if (polygon?.length) {
          const layer = L.polygon(polygon, { color: '#FF7BD5', weight: 2, dashArray: '6 5', fillColor: '#FF7BD5', fillOpacity: .08 }).addTo(map);
          try { map.fitBounds(layer.getBounds(), { padding: [24, 24] }); } catch {}
        } else if (radiusMiles) {
          const layer = L.circle([lat, lon], { radius: radiusMiles * 1609.34, color: '#6FD6E0', weight: 1.5, fillColor: '#6FD6E0', fillOpacity: .05 }).addTo(map);
          try { map.fitBounds(layer.getBounds(), { padding: [24, 24] }); } catch {}
        }
      } catch { /* map is a nice-to-have — fail quietly */ }
    })();
    return () => { cancelled = true; if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; } };
  }, [lat, lon, polygon, radiusMiles]);
  return <div ref={elRef} style={{ width: '100%', height: 220, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line2)' }} />;
}

function DetailModal({ listing, onClose }: { listing: any; onClose: () => void }) {
  const sc = listing.analysis?.compScope;
  const reports = listing.analysis?.reports || {};
  const pulled = REPORT_ORDER.filter(k => reports[k]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(4,9,10,.72)', zIndex: 1000, display: 'flex', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 720, padding: 24, position: 'relative', height: 'fit-content' }}>
        <button className="btn" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, padding: '2px 10px', fontSize: 13 }}>✕</button>
        <div className="text-2xl font-bold">{listing.acreage ? `${listing.acreage.toLocaleString()} acres` : listing.title}</div>
        <div className="mt-1" style={{ color: 'var(--muted)' }}>{listing.address || listing.title}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {listing.county ? `${listing.county} County · ` : ''}{listing.source} · saved {new Date(listing.dateFound).toLocaleDateString()}
        </div>

        {listing.notes && (
          <div style={{ background: 'var(--ink2)', border: '1px solid var(--line2)', borderRadius: 8, padding: 10, marginTop: 12 }}>
            <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--muted)' }}>Owner / zoning</span>
            <div className="mt-1 text-sm">{listing.notes}</div>
          </div>
        )}

        {listing.latitude != null && listing.longitude != null && (
          <div style={{ marginTop: 14 }}>
            <MiniMap lat={listing.latitude} lon={listing.longitude} polygon={sc?.polygon || null} radiusMiles={sc?.radiusMiles || 0} />
          </div>
        )}
        {sc && <div className="mono" style={{ fontSize: 11.5, color: '#FF7BD5', marginTop: 10 }}>Comps pulled from {scopeSummary(sc)}</div>}

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pulled.length ? pulled.map(k => {
            const r = reports[k], meta = REPORT_META[k];
            return (
              <div key={k} style={{ border: '1px solid var(--line2)', borderRadius: 10, padding: 14 }}>
                <div className="flex items-center justify-between">
                  <b style={{ fontSize: 13.5 }}>{meta.icon} {meta.label}</b>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{new Date(r.at).toLocaleString()}</span>
                </div>
                <div className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.65, marginTop: 8 }}
                  dangerouslySetInnerHTML={{ __html: formatReport(r.text) }} />
              </div>
            );
          }) : (
            <div className="card p-6 text-center" style={{ color: 'var(--muted)', fontSize: 13 }}>
              No saved analysis for this parcel yet — open it in <Link href="/" style={{ color: 'var(--cyan)' }}>Parcel Finder</Link>, pull a report (💰 deal analysis, 📊 market stats, 📋 full report, ⚡ utilities, or 🌱 soil), then save it again to keep the workup here.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2" style={{ marginTop: 8, borderTop: '1px solid var(--line2)', paddingTop: 14 }}>
          {listing.listingUrl && <a href={listing.listingUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Open listing</a>}
          <form action={`/api/listings/${listing.id}/utility-research`} method="post">
            <input type="hidden" name="redirectTo" value="/saved" />
            <button className="btn" style={{ padding: '6px 12px', fontSize: 13 }} type="submit">Research utilities</button>
          </form>
          <form action={`/api/listings/${listing.id}`} method="post">
            <input type="hidden" name="action" value="review" />
            <input type="hidden" name="redirectTo" value="/saved" />
            <input type="hidden" name="notes" value={listing.notes || ''} />
            <button className="btn" style={{ padding: '6px 12px', fontSize: 13 }} type="submit">Unsave</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SavedGrid({ listings }: { listings: any[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = listings.find(l => l.id === selectedId) || null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold display">Saved Plots</h1>
          <p style={{ color: 'var(--muted)' }}>{listings.length} parcel{listings.length === 1 ? '' : 's'} your team flagged as a good opportunity — click one for the full rundown.</p>
        </div>
        <Link href="/alerts" className="btn">← Back to alerts</Link>
      </div>

      {listings.length === 0 ? (
        <div className="card p-10 text-center" style={{ color: 'var(--muted)' }}>
          <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>No saved plots yet</div>
          <p className="mt-2 text-sm">Save a parcel from the <Link href="/" style={{ color: 'var(--cyan)' }}>Parcel Finder</Link>, or flag a listing as good on the <Link href="/alerts" style={{ color: 'var(--cyan)' }}>alerts dashboard</Link> — it will show up here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map(l => {
            const reportCount = l.analysis?.reports ? Object.keys(l.analysis.reports).length : 0;
            return (
              <div key={l.id} className="card flex flex-col gap-3 p-5" style={{ cursor: 'pointer' }} onClick={() => setSelectedId(l.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-bold">{l.acreage ? `${l.acreage.toLocaleString()} acres` : l.title}</div>
                    <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{l.address || l.title}</div>
                    {l.county && <div className="mt-1 mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{l.county} County</div>}
                  </div>
                  <span className="pill pill-good">{l.source}</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: reportCount ? 'var(--cyan)' : 'var(--muted)' }}>
                  {reportCount ? `${reportCount} report${reportCount === 1 ? '' : 's'} pulled` : 'No analysis pulled yet'}
                </div>
                <button className="btn btn-primary mt-auto" style={{ padding: '6px 12px', fontSize: 13 }} onClick={e => { e.stopPropagation(); setSelectedId(l.id); }}>
                  View full rundown →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selected && <DetailModal key={selected.id} listing={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
