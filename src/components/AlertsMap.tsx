'use client';

import { useEffect, useRef, useState } from 'react';

const COUNTIES: Record<string, string[]> = {
  NC: ['Mecklenburg','Gaston','Lincoln','Cleveland','Catawba','Iredell','Rowan','Cabarrus','Stanly','Union','Forsyth','Guilford','Durham','Wake'],
  SC: ['York','Lancaster','Chester','Spartanburg','Greenville'],
};
const CENTER: [number, number] = [35.2271, -80.8431];

type Listing = {
  id: string; title: string; source: string; address?: string | null; county?: string | null;
  acreage: number; price?: number | null; latitude?: number | null; longitude?: number | null;
  marketStage?: string | null; status?: string | null; listingUrl?: string | null; distanceFromCharlotte?: number | null;
};

declare global { interface Window { L: any; } }

export default function AlertsMap({ listings }: { listings: Listing[] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerLayer = useRef<any>(null);
  const [county, setCounty] = useState('');
  const [stage, setStage] = useState('all');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function addScript(src: string){ return new Promise<void>((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej();document.head.appendChild(s);}); }
    function addCss(href: string){ const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l); }
    (async () => {
      try {
        addCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
        if (!window.L) await addScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
        if (cancelled || !mapEl.current) return;
        const L = window.L;
        const map = L.map(mapEl.current, { zoomControl: true }).setView(CENTER, 8);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
        L.circle(CENTER, { radius: 100 * 1609.34, color: '#E8B04B', weight: 1.2, dashArray: '5 7', fill: false }).addTo(map);
        L.circleMarker(CENTER, { radius: 5, color: '#E8B04B', fillColor: '#E8B04B', fillOpacity: 1 }).addTo(map).bindTooltip('Uptown Charlotte');
        markerLayer.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
      } catch { /* map optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const STAGE_COLOR: Record<string, string> = { 'Pre-Market': '#E8B04B', Listed: '#6FD6E0' };
  const visible = listings.filter(l => {
    if (county && l.county !== county) return false;
    if (stage !== 'all' && (l.marketStage || 'Listed') !== stage) return false;
    return true;
  });

  useEffect(() => {
    if (!ready || !markerLayer.current) return;
    const L = window.L;
    markerLayer.current.clearLayers();
    visible.filter(l => l.latitude && l.longitude).forEach(l => {
      const color = STAGE_COLOR[l.marketStage || 'Listed'] || '#6FD6E0';
      L.circleMarker([l.latitude, l.longitude], { radius: 7, color, fillColor: color, fillOpacity: .85, weight: 1.5 })
        .addTo(markerLayer.current)
        .bindPopup(`<div style="font-family:monospace;font-size:12px;line-height:1.6">
          <b>${(l.title || '').replace(/</g,'&lt;')}</b><br>
          ${l.acreage} ac${l.price ? ' · $' + Math.round(l.price).toLocaleString() : ''}<br>
          ${l.county ? l.county + ' County' : (l.address || '')}<br>
          ${l.listingUrl ? `<a href="${l.listingUrl}" target="_blank">Open listing →</a>` : ''}</div>`);
    });
  }, [ready, county, stage, listings]);

  const allCounties = [...COUNTIES.NC.map(c => [c, 'NC'] as const), ...COUNTIES.SC.map(c => [c, 'SC'] as const)];
  const mapped = visible.filter(l => l.latitude && l.longitude).length;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--amber)' }}>Map</span>
        <select value={county} onChange={e => setCounty(e.target.value)} className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}>
          <option value="">All 19 counties</option>
          <optgroup label="North Carolina">{COUNTIES.NC.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
          <optgroup label="South Carolina">{COUNTIES.SC.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
        </select>
        <select value={stage} onChange={e => setStage(e.target.value)} className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}>
          <option value="all">All stages</option>
          <option value="Listed">Listed</option>
          <option value="Pre-Market">Pre-Market</option>
        </select>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
          {mapped} of {visible.length} mapped{visible.length !== mapped ? ' (rest need geocoding)' : ''}
        </span>
      </div>
      <div ref={mapEl} style={{ height: 380, borderRadius: 10, background: '#0B1416' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
        <button onClick={() => setCounty('')} className="mono"
          style={{ fontSize: 10.5, padding: '5px 9px', borderRadius: 14, cursor: 'pointer', border: '1px solid var(--line2)',
            background: county === '' ? 'var(--amber)' : 'transparent', color: county === '' ? 'var(--ink)' : 'var(--muted)' }}>
          All
        </button>
        {allCounties.map(([c, s]) => (
          <button key={c} onClick={() => setCounty(c)} className="mono"
            style={{ fontSize: 10.5, padding: '5px 9px', borderRadius: 14, cursor: 'pointer', border: '1px solid var(--line2)',
              background: county === c ? 'var(--amber)' : 'transparent', color: county === c ? 'var(--ink)' : 'var(--muted)' }}>
            {c} <span style={{ opacity: .5 }}>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
