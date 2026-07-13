'use client';

import { useEffect, useRef, useState } from 'react';
import { MAP_LAYERS, buildOverlay } from './mapLayers';
import { downloadDXF, downloadSHP } from './parcelExport';

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

declare global { interface Window { L: any; SOURCES: any[]; } }

export default function AlertsMap({ listings }: { listings: Listing[] }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerLayer = useRef<any>(null);
  const overlayLayers = useRef<Record<string, any>>({});
  const outlineLayer = useRef<any>(null);
  const listingsRef = useRef<Listing[]>(listings);
  listingsRef.current = listings;
  const [outlineMsg, setOutlineMsg] = useState('');
  const [outlineGeo, setOutlineGeo] = useState<{ rings: number[][][]; name: string } | null>(null);

  // "Show exact parcel" in a pin's popup: the pin is only the geocoder's best
  // point, so we ask the county parcel GIS for a parcel near that point whose
  // acreage matches the listing, and draw the actual property boundary.
  useEffect(() => {
    async function onOutline(e: any) {
      const l = listingsRef.current.find(x => x.id === e.detail);
      const L = window.L, map = mapRef.current;
      if (!l || !map || l.latitude == null || l.longitude == null) return;
      setOutlineMsg(`Searching county GIS for the exact ~${l.acreage} ac parcel…`);
      try {
        if (!window.SOURCES) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script');
            s.src = '/sources.js';
            s.onload = () => res();
            s.onerror = () => rej(new Error('could not load parcel sources'));
            document.head.appendChild(s);
          });
        }
        const isSC = COUNTIES.SC.includes(l.county || '') || /,\s*SC\b/.test(l.address || '');
        const stateName = isSC ? 'south carolina' : 'north carolina';
        const sources = (window.SOURCES || []).filter((s: any) => s.state?.toLowerCase() === stateName);

        let best: any = null;
        for (const s of sources.slice(0, 3)) {
          const base = s.serviceUrl.replace(/\/$/, '') + '/' + s.layerId + '/query';
          const params = new URLSearchParams();
          const where: string[] = [];
          if (s.acreageField && !s.acreageIsCalculated && l.acreage) {
            const unit = s.acreageUnit === 'sqft' ? 43560 : s.acreageUnit === 'sqm' ? 4046.86 : 1;
            where.push(`${s.acreageField} >= ${(l.acreage * 0.85 * unit).toFixed(2)}`);
            where.push(`${s.acreageField} <= ${(l.acreage * 1.15 * unit).toFixed(2)}`);
          }
          params.set('where', where.length ? where.join(' AND ') : '1=1');
          params.set('geometry', `${l.longitude},${l.latitude}`);
          params.set('geometryType', 'esriGeometryPoint');
          params.set('inSR', '4326');
          params.set('distance', '2500');
          params.set('units', 'esriSRUnit_Meter');
          params.set('spatialRel', 'esriSpatialRelIntersects');
          params.set('outSR', '4326');
          params.set('outFields', '*');
          params.set('returnGeometry', 'true');
          params.set('resultRecordCount', '50');
          params.set('f', 'json');
          try {
            const res = await fetch(base + '?' + params.toString());
            const data = await res.json();
            const feats = (data.features || []).filter((f: any) => f.geometry?.rings?.length);
            if (!feats.length) continue;
            // pick the candidate whose centroid sits closest to the geocoded pin
            let bestD = Infinity;
            for (const f of feats) {
              const ring = f.geometry.rings[0];
              let x = 0, y = 0;
              for (const [lo, la] of ring) { x += lo; y += la; }
              const d = (y / ring.length - l.latitude) ** 2 + (x / ring.length - l.longitude) ** 2;
              if (d < bestD) { bestD = d; best = { f, label: s.label || s.state }; }
            }
            if (best) break;
          } catch { /* this source is down or doesn't cover here — try the next */ }
        }

        if (!best) {
          setOutlineMsg(`No ~${l.acreage} ac parcel found in county GIS near this pin — location stays approximate.`);
          setOutlineGeo(null);
          return;
        }
        if (outlineLayer.current) map.removeLayer(outlineLayer.current);
        outlineLayer.current = L.geoJSON(
          { type: 'Feature', geometry: { type: 'Polygon', coordinates: best.f.geometry.rings }, properties: {} },
          { style: { color: '#E8B04B', weight: 2, fillColor: '#E8B04B', fillOpacity: .15 } },
        ).addTo(map);
        map.fitBounds(outlineLayer.current.getBounds(), { maxZoom: 16, padding: [40, 40] });
        setOutlineMsg(`✓ Exact parcel boundary drawn (~${l.acreage} ac match from ${best.label}).`);
        setOutlineGeo({ rings: best.f.geometry.rings, name: l.address || l.title || 'parcel' });
      } catch (err: any) {
        setOutlineMsg('Parcel lookup failed: ' + (err?.message || 'network error'));
      }
    }
    window.addEventListener('alert-outline', onOutline);
    return () => window.removeEventListener('alert-outline', onOutline);
  }, []);
  const [counties, setCounties] = useState<string[]>([]);
  const [stage, setStage] = useState('all');
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  function toggleCounty(name: string) {
    setCounties(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  }

  function toggleLayer(id: string) {
    const L = window.L, map = mapRef.current;
    if (!map) return;
    const def: any = MAP_LAYERS.find(l => l.id === id)!;
    if (overlayLayers.current[id]) {
      map.removeLayer(overlayLayers.current[id]);
      delete overlayLayers.current[id];
      setActiveLayers(a => a.filter(x => x !== id));
      return;
    }
    const lyr = buildOverlay(L, map, def);
    lyr.addTo(map);
    overlayLayers.current[id] = lyr;
    setActiveLayers(a => [...a, id]);
  }

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
    if (counties.length && !counties.includes(l.county || '')) return false;
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
        .bindPopup(`<div style="font-family:monospace;font-size:12px;line-height:1.6;min-width:180px">
          ${l.listingUrl
            ? `<a href="${l.listingUrl}" target="_blank" rel="noreferrer" style="font-weight:700;text-decoration:underline">${(l.title || 'Open listing').replace(/</g,'&lt;')}</a>`
            : `<b>${(l.title || '').replace(/</g,'&lt;')}</b>`}<br>
          ${l.acreage} ac${l.price ? ' · $' + Math.round(l.price).toLocaleString() : ''}<br>
          ${l.county ? l.county + ' County' : (l.address || '')}${l.distanceFromCharlotte != null ? ' · ' + l.distanceFromCharlotte.toFixed(0) + ' mi' : ''}<br>
          ${l.listingUrl ? `<a href="${l.listingUrl}" target="_blank" rel="noreferrer" style="font-weight:600">Open listing →</a>` : '<span style="opacity:.6">No listing link in the alert email</span>'}<br>
          <a href="#" onclick="event.preventDefault();window.dispatchEvent(new CustomEvent('alert-outline',{detail:'${l.id}'}))" style="font-weight:600;color:#E8B04B">◱ Show exact parcel</a></div>`);
    });
  }, [ready, counties, stage, listings]);

  const allCounties = [...COUNTIES.NC.map(c => [c, 'NC'] as const), ...COUNTIES.SC.map(c => [c, 'SC'] as const)];
  const mapped = visible.filter(l => l.latitude && l.longitude).length;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--amber)' }}>Map</span>
        <select value={stage} onChange={e => setStage(e.target.value)} className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}>
          <option value="all">All stages</option>
          <option value="Listed">Listed</option>
          <option value="Pre-Market">Pre-Market</option>
        </select>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          {counties.length ? `${counties.length} count${counties.length === 1 ? 'y' : 'ies'} selected` : 'All 19 counties'}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
          {mapped} of {visible.length} mapped{visible.length !== mapped ? ' (rest need geocoding)' : ''}
        </span>
      </div>
      {/* feasibility layer toggles — same layers as the Parcel Finder */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--cyan)', alignSelf: 'center', marginRight: 3 }}>Layers</span>
        {MAP_LAYERS.map(l => {
          const on = activeLayers.includes(l.id);
          return (
            <button key={l.id} onClick={() => toggleLayer(l.id)} disabled={!ready} title={l.note} className="mono"
              style={{ fontSize: 10.5, padding: '5px 9px', borderRadius: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                border: `1px solid ${on ? 'var(--cyan)' : 'var(--line2)'}`,
                background: on ? 'rgba(111,214,224,.12)' : 'transparent', color: on ? 'var(--cyan)' : 'var(--muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: l.color }} />
              {l.name}
            </button>
          );
        })}
      </div>
      <div ref={mapEl} style={{ height: 380, borderRadius: 10, background: '#0B1416' }} />
      {outlineMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="mono" style={{ fontSize: 11.5, color: outlineMsg.startsWith('✓') ? 'var(--lime)' : 'var(--muted)' }}>{outlineMsg}</span>
          {outlineGeo && (
            <>
              <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5 }}
                onClick={() => { try { downloadDXF(outlineGeo.rings, outlineGeo.name); } catch {} }}>⬇ DXF (CAD)</button>
              <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5 }}
                onClick={() => { downloadSHP(outlineGeo.rings, outlineGeo.name).catch(() => {}); }}>⬇ Shapefile</button>
            </>
          )}
        </div>
      )}
      {/* county chips — click as many as you want; All clears */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
        <button onClick={() => setCounties([])} className="mono"
          style={{ fontSize: 10.5, padding: '5px 9px', borderRadius: 14, cursor: 'pointer', border: '1px solid var(--line2)',
            background: counties.length === 0 ? 'var(--amber)' : 'transparent', color: counties.length === 0 ? 'var(--ink)' : 'var(--muted)' }}>
          All
        </button>
        {allCounties.map(([c, s]) => {
          const on = counties.includes(c);
          return (
            <button key={c} onClick={() => toggleCounty(c)} className="mono"
              style={{ fontSize: 10.5, padding: '5px 9px', borderRadius: 14, cursor: 'pointer', border: `1px solid ${on ? 'var(--amber)' : 'var(--line2)'}`,
                background: on ? 'var(--amber)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)' }}>
              {on ? '✓ ' : ''}{c} <span style={{ opacity: .5 }}>{s}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
