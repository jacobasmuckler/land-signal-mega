'use client';

import { useEffect, useRef, useState } from 'react';
import { MAP_LAYERS as LAYERS, buildOverlay } from '@/components/mapLayers';
import { downloadDXF, downloadSHP } from '@/components/parcelExport';
import { formatReport } from '@/lib/formatReport';

const MILES_TO_M = 1609.34;
const TILE_THRESHOLD = 2500;
const MAX_SOURCE_RESULTS = 25000;
// Default analysis setup a parcel gets until you customize it.
const DEFAULT_SCOPE = { radiusMiles: 3, polygon: null as [number, number][] | null, newOnly: false, criteria: '' };
// Parcel styles: normal, the clicked parcel, and everything else while one is selected.
const BASE_STYLE = { color: '#E8B04B', weight: 1.4, fillColor: '#E8B04B', fillOpacity: .12, opacity: 1 };
const SEL_STYLE  = { color: '#FFDD99', weight: 2.6, fillColor: '#E8B04B', fillOpacity: .3, opacity: 1 };
const FADE_STYLE = { color: '#E8B04B', weight: .8, fillColor: '#E8B04B', fillOpacity: .03, opacity: .25 };
// Session-only "come back where you left off" cache for the finder page —
// survives navigating to Saved/Alerts and back, cleared when the tab closes.
const SESSION_KEY = 'landSignalFinderState_v1';

declare global { interface Window { L: any; SOURCES: any[]; } }

export default function FinderPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const parcelLayerRef = useRef<any>(null);
  const overlayLayers = useRef<Record<string, any>>({});
  const centerMarker = useRef<any>(null);
  const circle = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [city, setCity] = useState('Gastonia, NC');
  const [radius, setRadius] = useState(10);
  const [minAcres, setMinAcres] = useState(20);
  const [maxAcres, setMaxAcres] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState('Search a city or jump to a county to begin.');
  const [busy, setBusy] = useState(false);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [parcelNo, setParcelNo] = useState('');
  const resultsRef = useRef<any[]>([]);
  const [utilReport, setUtilReport] = useState<{ title: string; text: string; loading: boolean; loadingMsg?: string } | null>(null);
  // The session-restore effect flips this once it's done applying (or found
  // nothing to apply) — persistState() no-ops until then, so the reactive
  // effect below can't fire on mount with blank state and clobber a session
  // the async restore (map load → sessionStorage) hasn't read back yet. This
  // has to be a plain-default useState above (not a sessionStorage-derived
  // one): reading sessionStorage during render would make the client's first
  // render diverge from the server's (no `window` there) and break hydration.
  const restoredAppliedRef = useRef(false);

  // Per-parcel analysis setup: click a parcel → the rest fade → draw the comp
  // area / set the rules for THAT parcel. Keyed by parcel __id (kept for the
  // whole session) and included when the parcel is saved. AI reports pulled
  // for a parcel are stashed the same way so a save persists them too.
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [selScope, setSelScope] = useState<any>({ ...DEFAULT_SCOPE });
  const scopeByParcel = useRef<Record<string, any>>({});
  const reportsByParcel = useRef<Record<string, Record<string, { text: string; at: string }>>>({});
  // The finder can also search inside a drawn polygon instead of city+radius.
  const [searchArea, setSearchArea] = useState<[number, number][] | null>(null);
  const searchAreaLayer = useRef<any>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawTarget, setDrawTarget] = useState<'comp' | 'search'>('comp');
  const compAreaLayer = useRef<any>(null);
  const drawRef = useRef<{ active: boolean; dragging: boolean; target: 'comp' | 'search'; pts: [number, number][]; layer: any }>({ active: false, dragging: false, target: 'comp', pts: [], layer: null });

  function scopeFor(p: any) { return (p && scopeByParcel.current[p.__id]) || { ...DEFAULT_SCOPE }; }
  function scopeSummary(sc: any) {
    return `${sc.polygon ? 'your drawn area' : `within ${sc.radiusMiles} mi`}${sc.newOnly ? ' · new builds only' : ''}${sc.criteria ? ` · ${sc.criteria}` : ''}`;
  }
  function stashReport(p: any, kind: string, text: string) {
    if (!p?.__id || !text) return;
    const cur = reportsByParcel.current[p.__id] || {};
    cur[kind] = { text, at: new Date().toISOString() };
    reportsByParcel.current[p.__id] = cur;
    persistState();
  }
  function updateSelScope(patch: any) {
    if (selIdx == null) return;
    const p = resultsRef.current[selIdx]; if (!p) return;
    const merged = { ...scopeFor(p), ...patch };
    scopeByParcel.current[p.__id] = merged;
    setSelScope(merged);
    persistState();
  }
  // Cache search inputs/results/drawn areas/per-parcel analysis/map view to
  // sessionStorage so navigating to Saved/Alerts and back restores it — refs
  // (scopeByParcel, reportsByParcel) aren't covered by the effect below, so
  // their mutators call this directly too. Quota-safe: drops the (largest)
  // results array and retries rather than losing everything.
  function persistState() {
    if (typeof window === 'undefined' || !restoredAppliedRef.current) return;
    const map = mapRef.current;
    const payload = {
      city, radius, minAcres, maxAcres, parcelNo,
      results: resultsRef.current, selIdx, searchArea, activeLayers,
      scopeByParcel: scopeByParcel.current, reportsByParcel: reportsByParcel.current,
      view: map ? { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() } : null,
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload)); }
    catch { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...payload, results: [] })); } catch {} }
  }
  // Select a parcel: highlight it, fade the rest, show its stored analysis
  // area on the map, and open its setup panel. null = deselect.
  function selectParcel(idx: number | null) {
    const map = mapRef.current, pl = parcelLayerRef.current, L = window.L;
    setSelIdx(idx);
    try { pl?.setStyle((f: any) => idx == null ? BASE_STYLE : (f?.properties?.idx === idx ? SEL_STYLE : FADE_STYLE)); } catch {}
    if (compAreaLayer.current && map) { map.removeLayer(compAreaLayer.current); compAreaLayer.current = null; }
    if (idx != null) {
      const p = resultsRef.current[idx], sc = scopeFor(p);
      setSelScope(sc);
      if (sc.polygon && map && L) compAreaLayer.current = L.polygon(sc.polygon, DRAW_STYLE.comp).addTo(map);
    } else setSelScope({ ...DEFAULT_SCOPE });
  }
  const selectFns = useRef<any>({});
  selectFns.current = { selectParcel };

  // One draw engine, two targets: 'comp' (magenta, comps/market data area) and
  // 'search' (cyan, the finder's own search boundary).
  const DRAW_STYLE: Record<'comp' | 'search', any> = {
    comp:   { color: '#FF7BD5', weight: 2, dashArray: '6 5', fillColor: '#FF7BD5', fillOpacity: .05, interactive: false },
    search: { color: '#6FD6E0', weight: 2, dashArray: '9 6', fillColor: '#6FD6E0', fillOpacity: .04, interactive: false },
  };
  function redrawTempArea() {
    const L = window.L, map = mapRef.current, d = drawRef.current;
    if (!map || !window.L) return;
    if (d.layer) { map.removeLayer(d.layer); d.layer = null; }
    if (d.pts.length >= 2) {
      d.layer = (d.pts.length >= 3 ? L.polygon : L.polyline)(d.pts, DRAW_STYLE[d.target]).addTo(map);
    }
  }
  // A finished trace whose on-screen footprint is basically a dot (an
  // accidental click, not a drag) doesn't count — let the user try again
  // without kicking them out of draw mode.
  function traceTooSmall(pts: [number, number][]) {
    const map = mapRef.current; if (!map || pts.length < 2) return true;
    const px = pts.map(p => map.latLngToContainerPoint(p));
    const w = Math.max(...px.map(p => p.x)) - Math.min(...px.map(p => p.x));
    const h = Math.max(...px.map(p => p.y)) - Math.min(...px.map(p => p.y));
    return w < 16 && h < 16;
  }
  function startDraw(target: 'comp' | 'search') {
    const map = mapRef.current; if (!map) return;
    if (drawRef.current.active) cancelDraw();
    // Hide (don't erase) the stored comp polygon while redrawing; the search
    // polygon is single-purpose so clearing it is fine.
    if (target === 'comp') { if (compAreaLayer.current) { map.removeLayer(compAreaLayer.current); compAreaLayer.current = null; } }
    else clearSearchArea();
    drawRef.current = { active: true, dragging: false, target, pts: [], layer: null };
    // Freehand tracing owns the mouse while drawing — the map itself must not
    // pan on drag, or every stroke would just scroll the map instead.
    map.dragging.disable();
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = 'crosshair';
    setDrawTarget(target); setDrawing(true);
  }
  function cancelDraw() {
    const map = mapRef.current, L = window.L, d = drawRef.current;
    if (d.layer && map) map.removeLayer(d.layer);
    drawRef.current = { active: false, dragging: false, target: d.target, pts: [], layer: null };
    if (map) { map.dragging.enable(); map.doubleClickZoom.enable(); map.getContainer().style.cursor = ''; }
    // Restore the selected parcel's stored comp polygon if we were redrawing it.
    if (d.target === 'comp' && selScope.polygon && map && L && !compAreaLayer.current) {
      compAreaLayer.current = L.polygon(selScope.polygon, DRAW_STYLE.comp).addTo(map);
    }
    setDrawing(false);
  }
  // Mouse-down starts a fresh trace; mouse-move (while down) appends points
  // that are actually a few pixels apart so the polygon stays smooth without
  // ballooning; mouse-up commits it — a real "draw a shape" gesture instead
  // of click-a-corner-per-click.
  function beginStroke(latlng: { lat: number; lng: number }) {
    const map = mapRef.current, d = drawRef.current;
    if (!map || !d.active) return;
    d.dragging = true; d.pts = [[latlng.lat, latlng.lng]];
    redrawTempArea();
  }
  function extendStroke(latlng: { lat: number; lng: number }) {
    const map = mapRef.current, d = drawRef.current;
    if (!map || !d.active || !d.dragging) return;
    const last = d.pts[d.pts.length - 1];
    const a = map.latLngToContainerPoint(last), b = map.latLngToContainerPoint(latlng);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 5) return;
    d.pts.push([latlng.lat, latlng.lng]);
    redrawTempArea();
  }
  function endStroke() {
    const L = window.L, map = mapRef.current, d = drawRef.current;
    if (!map || !d.active || !d.dragging) return;
    d.dragging = false;
    if (d.pts.length < 3 || traceTooSmall(d.pts)) {
      // Too small to be a real shape — clear it and stay in draw mode.
      if (d.layer) { map.removeLayer(d.layer); d.layer = null; }
      d.pts = [];
      return;
    }
    const pts = d.pts;
    if (d.layer) map.removeLayer(d.layer);
    const target = d.target;
    drawRef.current = { active: false, dragging: false, target, pts: [], layer: null };
    map.dragging.enable(); map.doubleClickZoom.enable(); map.getContainer().style.cursor = '';
    const layer = L.polygon(pts, DRAW_STYLE[target]).addTo(map);
    if (target === 'comp') { compAreaLayer.current = layer; updateSelScope({ polygon: pts }); }
    else { searchAreaLayer.current = layer; setSearchArea(pts); }
    setDrawing(false);
  }
  function clearCompArea() {
    const map = mapRef.current;
    if (compAreaLayer.current && map) map.removeLayer(compAreaLayer.current);
    compAreaLayer.current = null;
    updateSelScope({ polygon: null });
  }
  function clearSearchArea() {
    const map = mapRef.current;
    if (searchAreaLayer.current && map) map.removeLayer(searchAreaLayer.current);
    searchAreaLayer.current = null;
    setSearchArea(null);
  }
  const drawFns = useRef<any>({});
  drawFns.current = { beginStroke, extendStroke, endStroke };

  // Reactive half of the session cache — refs (scope/reports per parcel) are
  // persisted from their own mutators above instead, since effect deps can't
  // see into a ref.
  useEffect(() => { persistState(); }, [results, selIdx, searchArea, activeLayers, city, radius, minAcres, maxAcres, parcelNo]);

  // Map-popup buttons fire CustomEvents with the parcel's index — research,
  // exports, and comps all hang off these listeners.
  useEffect(() => {
    async function research(p: any, mode: 'utilities' | 'full') {
      const sc = scopeFor(p);
      const title = `${mode === 'full' ? '📋' : '⚡'} ${p.acres != null ? p.acres.toFixed(1) + ' ac · ' : ''}${p.address || p.parcel || 'parcel'}`;
      setUtilReport({ title, text: '', loading: true, loadingMsg: mode === 'full'
        ? `Researching zoning, schools & comparable land sales (comps ${scopeSummary(sc)})… usually 20–40 seconds.`
        : 'Researching water, sewer, electric & gas for this parcel… usually 20–40 seconds.' });
      try {
        const res = await fetch('/api/parcels/utility-research', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            acres: p.acres, address: p.address, owner: p.owner, zoning: p.zoning,
            parcel: p.parcel, county: p.county, state: p.state,
            lat: p.center?.[0], lon: p.center?.[1],
            ...(mode === 'full' ? { compScope: sc } : {}),
          }),
        });
        const j = await res.json();
        if (j.report) stashReport(p, mode, j.report);
        setUtilReport({ title, text: j.report || j.error || 'No report returned.', loading: false });
      } catch (err: any) {
        setUtilReport({ title, text: 'Research failed: ' + (err?.message || 'network error'), loading: false });
      }
    }
    function onUtility(e: any) { const p = resultsRef.current[e.detail]; if (p) research(p, 'utilities'); }
    function onFullReport(e: any) { const p = resultsRef.current[e.detail]; if (p) research(p, 'full'); }

    // 📊 Market stats — census-tract housing numbers + AI sold-comps pass.
    async function onMarket(e: any) {
      const p = resultsRef.current[e.detail];
      if (!p?.center) return;
      const sc = scopeFor(p);
      const title = `📊 Market — ${p.address || p.parcel || 'area'}`;
      setUtilReport({ title, text: '', loading: true, loadingMsg: `Pulling census housing data + recent sold prices (${scopeSummary(sc)})… usually 15–30 seconds.` });
      try {
        const res = await fetch('/api/market-snapshot', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: p.center[0], lon: p.center[1], address: p.address ? `${p.address}, ${p.county || ''} ${p.state || 'NC'}` : undefined, compScope: sc }),
        });
        const j = await res.json();
        const money = (v: number | null) => v ? '$' + Math.round(v).toLocaleString() : 'n/a';
        const lines: string[] = [];
        if (j.stats) {
          lines.push('**Census tract housing data** (' + (j.stats.areaName || 'this tract') + ')');
          lines.push(`Median home value: ${money(j.stats.medianHomeValue)}`);
          lines.push(`Median household income: ${money(j.stats.medianHouseholdIncome)}`);
          if (j.stats.medianYearBuilt) lines.push(`Median year built: ${j.stats.medianYearBuilt}`);
          if (j.stats.ownerOccupiedPct != null) lines.push(`Owner-occupied: ${j.stats.ownerOccupiedPct}%`);
          if (j.stats.avgHouseholdSize) lines.push(`Avg household size: ${j.stats.avgHouseholdSize}`);
        } else if (j.statsUnavailableReason) {
          lines.push(`Census stats unavailable: ${j.statsUnavailableReason}`);
        }
        if (j.ai) { lines.push('', '**Recent sold market (web search)**', j.ai); }
        else { lines.push('', 'Sold $/sqft lookup needs OPENAI_API_KEY (already set if utility research works).'); }
        if (j.stats || j.ai) stashReport(p, 'market', lines.join('\n'));
        setUtilReport({ title, text: lines.join('\n'), loading: false });
      } catch (err: any) {
        setUtilReport({ title, text: 'Market lookup failed: ' + (err?.message || 'network error'), loading: false });
      }
    }

    // ⬇ DXF / Shapefile — export the parcel boundary for AutoCAD or GIS.
    async function onExport(e: any) {
      const p = resultsRef.current[e.detail?.idx];
      const rings = p?.geojson?.coordinates;
      if (!rings?.length) return;
      const name = p.parcel || p.address || `${(p.acres || 0).toFixed(1)}ac_parcel`;
      try {
        if (e.detail.fmt === 'dxf') downloadDXF(rings, name);
        else await downloadSHP(rings, name, { acres: p.acres ?? null, address: p.address ?? '', owner: p.owner ?? '', parcel: p.parcel ?? '', zoning: p.zoning ?? '' });
      } catch (err: any) {
        setStatusMsg('Export failed: ' + (err?.message || 'unknown error'));
      }
    }

    // ≈ Similar lots — rerun the search centered on this parcel, ±25% acreage, 5 mi.
    function onSimilar(e: any) {
      const p = resultsRef.current[e.detail];
      if (!p?.center || p.acres == null) return;
      const geo = { lat: p.center[0], lon: p.center[1], state: p.state, county: p.county, label: p.address || 'this parcel' };
      const minA = Math.max(1, Math.round(p.acres * 0.75)), maxA = Math.ceil(p.acres * 1.25);
      setRadius(5); setMinAcres(minA); setMaxAcres(String(maxA));
      runSearchRef.current?.({ geo, mi: 5, minA, maxA });
    }
    // "★ Save parcel" in a popup — same save as the sidebar list, with the
    // popup button itself giving the "✓ Saved" feedback.
    function onSave(e: any) {
      const p = resultsRef.current[e.detail];
      if (!p) return;
      const btn = document.querySelector('.leaflet-popup-content button[data-save-parcel]') as HTMLButtonElement | null;
      saveParcel(p, btn || undefined);
    }
    // 💰 Deal analysis — residual land valuation → max-offer range.
    async function onDeal(e: any) {
      const p = resultsRef.current[e.detail];
      if (!p?.center || p.acres == null) return;
      const sc = scopeFor(p);
      const title = `💰 Deal analysis — ${p.acres.toFixed(1)} ac · ${p.address || p.parcel || 'parcel'}`;
      setUtilReport({ title, text: '', loading: true, loadingMsg: `Running the numbers: lot yield, sold comps (${scopeSummary(sc)}), development costs, max offer… usually 30–60 seconds.` });
      try {
        const res = await fetch('/api/parcels/deal-analysis', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: p.center[0], lon: p.center[1], acres: p.acres,
            address: p.address, county: p.county, state: p.state, zoning: p.zoning, owner: p.owner,
            compScope: sc,
          }),
        });
        const j = await res.json();
        if (j.report) stashReport(p, 'deal', j.report);
        setUtilReport({ title, text: j.report || j.error || 'No analysis returned.', loading: false });
      } catch (err: any) {
        setUtilReport({ title, text: 'Deal analysis failed: ' + (err?.message || 'network error'), loading: false });
      }
    }

    // 🌱 Soil / septic — USDA soil survey + septic suitability rating.
    async function onSoil(e: any) {
      const p = resultsRef.current[e.detail];
      if (!p?.center) return;
      const title = `🌱 Soil — ${p.address || p.parcel || 'parcel'}`;
      setUtilReport({ title, text: '', loading: true, loadingMsg: 'Looking up USDA soil survey + septic suitability… usually 5–15 seconds.' });
      try {
        const res = await fetch('/api/parcels/soil', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: p.center[0], lon: p.center[1] }),
        });
        const j = await res.json();
        if (j.error) { setUtilReport({ title, text: j.error, loading: false }); return; }
        const lines: string[] = [];
        lines.push(`**Soil at parcel center**: ${j.soilName || 'no survey data here'}`);
        if (j.components?.length) {
          lines.push('', '**Septic suitability by soil component** (USDA "Septic Tank Absorption Fields"):');
          for (const c of j.components) lines.push(`- ${c.name} (${c.pct}% of unit): **${c.septicRating}**`);
          lines.push('', 'How to read it: "Not limited" = septic-friendly. "Somewhat limited" = usually workable with design tweaks. "Very limited" = expect engineered systems or public sewer — fewer, larger lots without it.');
          lines.push('Note: this is the soil at the parcel’s center point; large parcels can span multiple soil types.');
        } else if (j.note) lines.push(j.note);
        stashReport(p, 'soil', lines.join('\n'));
        setUtilReport({ title, text: lines.join('\n'), loading: false });
      } catch (err: any) {
        setUtilReport({ title, text: 'Soil lookup failed: ' + (err?.message || 'network error'), loading: false });
      }
    }

    window.addEventListener('parcel-utility', onUtility);
    window.addEventListener('parcel-fullreport', onFullReport);
    window.addEventListener('parcel-market', onMarket);
    window.addEventListener('parcel-deal', onDeal);
    window.addEventListener('parcel-soil', onSoil);
    window.addEventListener('parcel-export', onExport);
    window.addEventListener('parcel-similar', onSimilar);
    window.addEventListener('parcel-save', onSave);
    return () => {
      window.removeEventListener('parcel-utility', onUtility);
      window.removeEventListener('parcel-fullreport', onFullReport);
      window.removeEventListener('parcel-market', onMarket);
      window.removeEventListener('parcel-deal', onDeal);
      window.removeEventListener('parcel-soil', onSoil);
      window.removeEventListener('parcel-export', onExport);
      window.removeEventListener('parcel-similar', onSimilar);
      window.removeEventListener('parcel-save', onSave);
    };
  }, []);

  // load Leaflet + sources, init map
  useEffect(() => {
    let cancelled = false;
    function addScript(src: string){ return new Promise<void>((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej();document.head.appendChild(s);}); }
    function addCss(href: string){ const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l); }
    (async () => {
      try {
        addCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
        if (!window.L) await addScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
        if (!window.SOURCES) await addScript('/sources.js');
        if (cancelled || !mapEl.current) return;
        const L = window.L;
        const map = L.map(mapEl.current, { zoomControl: true, preferCanvas: true }).setView([35.35,-81.0], 8);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { attribution:'© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19 }).addTo(map);
        const pl = L.geoJSON(null, {
          style:{ color:'#E8B04B', weight:1.4, fillColor:'#E8B04B', fillOpacity:.12 },
          onEachFeature:(f:any,l:any)=> l.bindPopup(popupHtml(f.properties)),
        }).addTo(map);
        // Comp/search-area drawing: while active, press-drag-release traces a
        // real shape on the map (and never opens parcel popups mid-stroke).
        map.on('mousedown', (e:any) => { if (drawRef.current.active) { map.closePopup(); drawFns.current.beginStroke(e.latlng); } });
        map.on('mousemove', (e:any) => { if (drawRef.current.active && drawRef.current.dragging) drawFns.current.extendStroke(e.latlng); });
        map.on('mouseup', () => { if (drawRef.current.active && drawRef.current.dragging) drawFns.current.endStroke(); });
        // Backstop: if the drag is released past the map's edge, the map's
        // own mouseup never fires — catch it at the document level instead.
        document.addEventListener('mouseup', () => { if (drawRef.current.active && drawRef.current.dragging) drawFns.current.endStroke(); });
        // Clicking a parcel opens its popup → that parcel becomes the selected
        // one (others fade, its analysis panel opens). While drawing, popups
        // are suppressed entirely so tracing over parcels never interferes.
        map.on('popupopen', (e: any) => {
          if (drawRef.current.active) { map.closePopup(); return; }
          const idx = e.popup?._source?.feature?.properties?.idx;
          if (typeof idx === 'number') selectFns.current.selectParcel(idx);
        });
        // Persist the map view too, so "where I left off" includes zoom/pan.
        map.on('moveend', () => persistState());
        mapRef.current = map; parcelLayerRef.current = pl;
        // Restore a session left off by navigating to Saved/Alerts and back:
        // search inputs, the result set + map layer, any drawn search area,
        // every parcel's analysis setup, active feasibility layers, and view.
        // Done here (post-mount, client-only) rather than during render so the
        // client's first render still matches the server's for hydration.
        try {
          const raw = sessionStorage.getItem(SESSION_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.city) setCity(saved.city);
            if (saved.radius) setRadius(saved.radius);
            if (saved.minAcres != null) setMinAcres(saved.minAcres);
            if (saved.maxAcres != null) setMaxAcres(saved.maxAcres);
            if (saved.parcelNo) setParcelNo(saved.parcelNo);
            if (saved.scopeByParcel) scopeByParcel.current = saved.scopeByParcel;
            if (saved.reportsByParcel) reportsByParcel.current = saved.reportsByParcel;
            if (Array.isArray(saved.results) && saved.results.length) {
              resultsRef.current = saved.results;
              setResults(saved.results);
              for (const p of saved.results) pl.addData({ type: 'Feature', geometry: p.geojson, properties: p });
              setStatusMsg(`Restored ${saved.results.length} parcel(s) from your last search.`);
            }
            if (Array.isArray(saved.searchArea) && saved.searchArea.length >= 3) {
              setSearchArea(saved.searchArea);
              searchAreaLayer.current = L.polygon(saved.searchArea, DRAW_STYLE.search).addTo(map);
            }
            if (Array.isArray(saved.activeLayers)) for (const id of saved.activeLayers) toggleLayer(id);
            if (saved.view) map.setView(saved.view.center, saved.view.zoom);
            if (saved.selIdx != null && resultsRef.current[saved.selIdx]) selectParcel(saved.selIdx);
          }
        } catch {}
        // From here on, persistState() is allowed to write — the reactive
        // effect below fires once more on the next render (state changes
        // above trigger it) and will correctly capture whatever was restored.
        restoredAppliedRef.current = true;
        setReady(true);
      } catch { setStatusMsg('Map failed to load — check your connection.'); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── GIS engine (ported from verified land-finder) ──
  function srcAcre(s:any,a:number){ if(s.acreageUnit==='sqft')return a*43560; if(s.acreageUnit==='sqm')return a/0.00024710538146717; return a; }
  function normAcre(s:any,v:any){ const r=Number(v); if(r==null||isNaN(r))return null; if(s.acreageUnit==='sqft')return r/43560; if(s.acreageUnit==='sqm')return r*0.00024710538146717; return r; }
  function bbox(lon:number,lat:number,mi:number){ const la=mi/69,co=Math.cos(lat*Math.PI/180)||1e-6,lo=mi/(69*co); return {xmin:lon-lo,ymin:lat-la,xmax:lon+lo,ymax:lat+la}; }
  function ringAreaSigned(r:any[]){ const R=6378137; let a=0; for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length]; a+=(x2-x1)*Math.PI/180*(2+Math.sin(y1*Math.PI/180)+Math.sin(y2*Math.PI/180));} return a*R*R/2; }
  // Sum signed ring areas: multi-part parcels add up, holes subtract.
  function polyAcres(rings:any[]){ if(!rings||!rings.length)return null; let a=0; for(const r of rings)a+=ringAreaSigned(r); return Math.abs(a)/4046.8564224; }
  function geomAreaPerAcre(s:any){ return s.geomAreaUnit==='sqm'?4046.8564224:43560; }
  function hav(la1:number,lo1:number,la2:number,lo2:number){ const R=3958.8,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180,a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2; return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
  function centroid(rings:any[]){ const r=rings[0]; let x=0,y=0; for(const[lo,la]of r){x+=lo;y+=la;} return [y/r.length,x/r.length]; }
  // ── drawn-search-area helpers (vertices are [lat, lon]) ──
  function pointInPoly(pt:[number,number],poly:[number,number][]){ const y=pt[0],x=pt[1]; let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const yi=poly[i][0],xi=poly[i][1],yj=poly[j][0],xj=poly[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside; } return inside; }
  function polyBBox(poly:[number,number][]){ return { xmin:Math.min(...poly.map(p=>p[1])), xmax:Math.max(...poly.map(p=>p[1])), ymin:Math.min(...poly.map(p=>p[0])), ymax:Math.max(...poly.map(p=>p[0])) }; }
  function polyCenter(poly:[number,number][]){ let la=0,lo=0; for(const p of poly){la+=p[0];lo+=p[1];} return [la/poly.length,lo/poly.length] as [number,number]; }
  function polyReachMi(poly:[number,number][]){ const c=polyCenter(poly); return Math.max(0.5,...poly.map(p=>hav(c[0],c[1],p[0],p[1]))); }
  async function reverseGeo(lat:number,lon:number){
    try{
      const r=await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      return { lat, lon, state:r.address?.state||null, county:r.address?.county||null, label:r.display_name||'your drawn area' };
    }catch{ return { lat, lon, state:null, county:null, label:'your drawn area' }; }
  }

  // ── candidate scoring: rank parcels by how promising they are to acquire,
  // not by raw size. Owners like counties/churches/utilities are pushed to the
  // bottom; size-fit, compact buildable shape, closeness, motivated-seller
  // signals, road access and res/ag zoning score points. Reasons are shown as
  // chips on each card so the ranking is never a black box. ──
  function perimeterMeters(rings:any[]){ const r=rings?.[0]; if(!r||r.length<3)return null; let m=0; for(let i=0;i<r.length;i++){const[lo1,la1]=r[i],[lo2,la2]=r[(i+1)%r.length]; m+=hav(la1,lo1,la2,lo2)*MILES_TO_M;} return m; }
  function candidateInfo(p:any,ctx:{minA:number,maxA:number|null,mi:number}){
    const owner=String(p.owner||'').toUpperCase();
    if(/(\bCOUNTY\b|CITY OF|TOWN OF|STATE OF|UNITED STATES|\bUSA\b|CHURCH|MINISTR|SCHOOL|BOARD OF|AUTHORITY|COMMISSION|DEPARTMENT|\bDEPT\b|CEMETERY|\bHOA\b|HOMEOWNERS|ASSOCIATION|\bASSN\b|RAILROAD|RAILWAY|DUKE ENERGY|ELECTRIC MEMBERSHIP|\bPOWER CO\b|PIPELINE|CONSERVANCY|LAND TRUST|NATURE|AIRPORT|\bFIRE\b)/.test(owner))
      return { score:-1, why:['public/institutional owner'] };
    if(p.acres==null) return { score:0, why:['acreage unknown'] };
    const why:string[]=[]; let s=0;
    // Size fit: full points inside [min, ideal-high]; oversize tapers off.
    const idealHi=ctx.maxA??Math.max(ctx.minA*5,80);
    if(p.acres<=idealHi){ s+=30; why.push('size fits target'); }
    else { s+=Math.max(4,30-10*Math.log2(p.acres/idealHi)); why.push('larger than target'); }
    // Closer to the search center is better.
    if(p.distance!=null&&ctx.mi>0){ s+=Math.round(16*Math.max(0,1-p.distance/ctx.mi)); if(p.distance<=ctx.mi*0.4)why.push('close in'); }
    // Shape: Polsby-Popper compactness — slivers grade terribly, squares well.
    const per=perimeterMeters(p.geojson?.coordinates);
    if(per&&per>0){ const pp=4*Math.PI*(p.acres*4046.8564)/(per*per);
      if(pp>=0.35){ s+=18; why.push('compact shape'); } else if(pp>=0.18){ s+=9; } else { s-=6; why.push('long/irregular shape'); } }
    // Owner signals.
    if(/(ESTATE|HEIRS|\bADMIN\b|ADMINISTRATOR|EXECUTOR|EXECUTRIX)/.test(owner)){ s+=12; why.push('estate/heirs owner'); }
    else if(owner&&!/(LLC|L L C|\bINC\b|\bCORP\b|PROPERTIES|HOLDINGS|DEVELOPMENT|PARTNERS|CAPITAL|INVESTMENTS|VENTURES|BUILDERS|HOMES\b)/.test(owner)){ s+=8; why.push('individual/family owner'); }
    if(p.address){ s+=6; why.push('has road address'); }
    const z=String(p.zoning||'').toUpperCase();
    if(z&&/^(R\b|R-|R1|R2|R3|R4|RA|RR|RE\b|RES|AG|A-|A1|AR|RU)/.test(z)){ s+=10; why.push(`res/ag zoning`); }
    return { score:s, why };
  }
  function normPlace(v:any){ return String(v||'').toLowerCase().replace(/\b(county|parish|borough|census area|municipality|city and borough)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  function srcForState(st:string){ if(!st)return[]; const n=st.trim().toLowerCase(); return (window.SOURCES||[]).filter((s:any)=>s.state.toLowerCase()===n); }
  function srcMatch(s:any,geo:any){ if(!s||!geo)return false; if(s.coverage==='statewide'||s.coverage==='near-statewide'){return !(s.excludedCounties||[]).map(normPlace).includes(normPlace(geo.county));} const cs=(s.counties||s.countyNames||[]).map(normPlace); if(cs.length)return cs.includes(normPlace(geo.county)); return s.coverage!=='county-only'; }
  function srcForLoc(geo:any){ return srcForState(geo.state).filter((s:any)=>srcMatch(s,geo)); }
  function sourceKey(s:any){ return `${s.serviceUrl.replace(/\/$/,'')}|${s.layerId}`; }
  function srcForAreas(areas:any[]){
    const found = new Map<string,any>();
    for(const area of areas){
      for(const s of srcForLoc(area)) found.set(sourceKey(s),s);
    }
    return Array.from(found.values());
  }

  async function searchAreas(geo:any,mi:number){
    try{
      const res=await fetch('/api/search-areas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:geo.lat,lon:geo.lon,radiusMiles:mi})});
      const data=await res.json();
      if(res.ok&&Array.isArray(data.areas)&&data.areas.length)return data.areas;
    }catch{}
    return geo.state?[{state:geo.state,stateAbbr:null,county:geo.county||null}]:[];
  }
  function fieldValue(a:any,field?:string|null){
    if(!field)return undefined;
    if(Object.prototype.hasOwnProperty.call(a,field))return a[field];
    const actual=Object.keys(a).find(k=>k.toLowerCase()===field.toLowerCase());
    return actual?a[actual]:undefined;
  }

  async function fetchJson(url:string){
    const r = await fetch(url, { headers:{ Accept:'application/json' } });
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
  async function geocode(q:string){
    try{
      const url='https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=1&q='+encodeURIComponent(q);
      const d=await fetchJson(url);
      if(Array.isArray(d)&&d.length){
        const r=d[0];
        return { lat:+r.lat, lon:+r.lon, state:(r.address&&(r.address.state||r.address.territory))||null, county:r.address&&r.address.county||null, label:r.display_name };
      }
    }catch{ /* fall through to the server chain */ }
    // Nominatim misses many rural street addresses — fall back to our server's
    // Census→Nominatim→Photon chain, then reverse-geocode for county/state.
    try{
      const r=await fetchJson('/api/geocode?q='+encodeURIComponent(q));
      if(typeof r?.lat!=='number')return null;
      let state=null, county=null, label=q;
      try{
        const rev=await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${r.lat}&lon=${r.lng}`);
        state=rev.address?.state||null; county=rev.address?.county||null; label=rev.display_name||q;
      }catch{}
      return { lat:r.lat, lon:r.lng, state, county, label };
    }catch{ return null; }
  }
  function buildUrl(s:any,lon:number,lat:number,mi:number,minA:number,maxA:number|null,opt:any={}){
    const base=s.serviceUrl.replace(/\/$/,'')+'/'+s.layerId+'/query',p=new URLSearchParams(),w:string[]=[];
    // Prefer the service-computed geometry area for filtering: attribute acreage
    // fields can mix units per county (NC's gisacres is sq ft in Cabarrus), which
    // both floods the fetch with tiny lots and drops legit parcels. Loose margins
    // here — the client re-filters exactly after unit correction.
    if(s.geomAreaField){ const per=geomAreaPerAcre(s); if(minA>0)w.push(`${s.geomAreaField} >= ${Math.floor(minA*per*0.9)}`); if(maxA!=null)w.push(`${s.geomAreaField} <= ${Math.ceil(maxA*per*1.15)}`); }
    else if(s.acreageField&&!s.acreageIsCalculated){ if(minA>0)w.push(`${s.acreageField} >= ${srcAcre(s,minA)}`); if(maxA!=null)w.push(`${s.acreageField} <= ${srcAcre(s,maxA)}`); }
    p.set('where',w.length?w.join(' AND '):'1=1');
    if(opt.bounds||s.spatialMode==='envelope'){ const b=opt.bounds||bbox(lon,lat,mi); p.set('geometry',`${b.xmin},${b.ymin},${b.xmax},${b.ymax}`); p.set('geometryType','esriGeometryEnvelope'); p.set('inSR','4326'); }
    else { p.set('geometry',`${lon},${lat}`); p.set('geometryType','esriGeometryPoint'); p.set('inSR','4326'); p.set('distance',String(mi*MILES_TO_M)); p.set('units','esriSRUnit_Meter'); }
    p.set('spatialRel','esriSpatialRelIntersects'); p.set('outSR','4326'); p.set('f','json');
    if(opt.countOnly){ p.set('returnCountOnly','true'); p.set('returnGeometry','false'); }
    else { p.set('outFields','*'); p.set('returnGeometry','true'); p.set('resultRecordCount',String(opt.pageSize||s.maxRecordCount||1000)); p.set('resultOffset',String(opt.offset||0)); if(s.idField)p.set('orderByFields',`${s.idField} ASC`); }
    return base+'?'+p.toString();
  }
  function normalize(f:any,s:any,c:any){
    const a=f.attributes||{}, g=f.geometry&&f.geometry.rings?{type:'Polygon',coordinates:f.geometry.rings}:null;
    if(!g)return null;
    let ac=s.acreageField?normAcre(s,fieldValue(a,s.acreageField)):null;
    // The service-computed area field (when configured) beats our spherical
    // approximation of the returned rings — use it as the geometry truth.
    let geometryAcres=polyAcres(g.coordinates);
    if(s.geomAreaField){ const ga=Number(fieldValue(a,s.geomAreaField)); if(Number.isFinite(ga)&&ga>0)geometryAcres=ga/geomAreaPerAcre(s); }
    if(geometryAcres!=null){
      // Public assessor fields occasionally mix acres and square feet in the
      // same column. Trust the boundary when the attribute is wildly different
      // so a 93,866 sq-ft residential lot never appears as 93,866 acres.
      const ratio=ac!=null&&geometryAcres>0?ac/geometryAcres:null;
      if(ac==null||isNaN(ac)||ac===0||(ratio!=null&&(ratio>50||ratio<0.02)))ac=geometryAcres;
    }
    const [clat,clon]=centroid(g.coordinates);
    return { __id:`${sourceKey(s)}|${fieldValue(a,s.idField)??fieldValue(a,'OBJECTID')??Math.random()}`, acres:ac!=null&&!isNaN(ac)?ac:null,
      owner:fieldValue(a,s.ownerField)??null, address:fieldValue(a,s.addressField)??null, parcel:fieldValue(a,s.parcelField)??null,
      zoning:a.ZONING||a.zoning||a.ZONE||a.Zone_Code||null, sourceLabel:s.label||s.state,
      county:(fieldValue(a,s.countyField)??null)||(s.coverage==='county-only'?(s.counties||s.countyNames||[])[0]:null)||c.county||null, state:s.stateAbbr||c.state||null,
      distance:hav(c.lat,c.lon,clat,clon), center:[clat,clon], geojson:g };
  }
  function splitBounds(b:any,n:number){
    const cells:any[]=[];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)cells.push({xmin:b.xmin+(b.xmax-b.xmin)*x/n,xmax:b.xmin+(b.xmax-b.xmin)*(x+1)/n,ymin:b.ymin+(b.ymax-b.ymin)*y/n,ymax:b.ymin+(b.ymax-b.ymin)*(y+1)/n});
    return cells;
  }
  function featureId(f:any,s:any){ const a=f.attributes||{}; return String(fieldValue(a,s.idField)??fieldValue(a,'OBJECTID')??JSON.stringify(f.geometry?.rings?.[0]?.slice(0,2)||[])); }
  // areaBounds: when the user drew a search polygon, query its bounding box
  // (envelope) instead of point+radius; the caller filters to the exact shape.
  async function querySource(s:any,geo:any,mi:number,minA:number,maxA:number|null,areaBounds?:any){
    let total:number|null=null;
    try{ const cr=await fetchJson(buildUrl(s,geo.lon,geo.lat,mi,minA,maxA,{countOnly:true,bounds:areaBounds})); total=typeof cr.count==='number'?cr.count:null; }catch{}
    const ps=Math.min(s.maxRecordCount||1000,1000),unique=new Map<string,any>();
    let truncated=false;

    async function fetchArea(bounds?:any){
      let expected:number|null=null;
      try{ const cr=await fetchJson(buildUrl(s,geo.lon,geo.lat,mi,minA,maxA,{countOnly:true,bounds})); expected=typeof cr.count==='number'?cr.count:null; }catch{}
      let off=0; const pageSignatures=new Set<string>();
      for(let page=0;page<100;page++){
        const d=await fetchJson(buildUrl(s,geo.lon,geo.lat,mi,minA,maxA,{pageSize:ps,offset:off,bounds}));
        if(d.error)throw new Error(d.error.message||'server error');
        const rows=d.features||[];
        if(!rows.length)break;
        const signature=`${featureId(rows[0],s)}|${featureId(rows[rows.length-1],s)}|${rows.length}`;
        if(pageSignatures.has(signature))break;
        pageSignatures.add(signature);
        for(const f of rows){ unique.set(featureId(f,s),f); if(unique.size>=MAX_SOURCE_RESULTS){truncated=true;return;} }
        off+=rows.length;
        if((expected!=null&&off>=expected)||(!d.exceededTransferLimit&&expected==null))break;
      }
    }

    if(total!=null&&total>TILE_THRESHOLD){
      const grid=total>12000?5:total>5000?4:3;
      for(const cell of splitBounds(areaBounds||bbox(geo.lon,geo.lat,mi),grid)){ await fetchArea(cell); if(truncated)break; }
    }else await fetchArea(areaBounds);
    return {features:Array.from(unique.values()),truncated};
  }

  function dedupeParcels(items:any[]){
    const ids=new Set<string>(), parcels=new Set<string>(), shapes=new Set<string>(), out:any[]=[];
    const clean=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
    for(const p of items){
      const id=String(p.__id||'');
      const parcel=p.parcel?`${clean(p.sourceLabel)}|${clean(p.state)}|${clean(p.county)}|${clean(p.parcel)}`:'';
      const shape=p.center?`${clean(p.state)}|${clean(p.county)}|${clean(p.address)}|${Number(p.acres||0).toFixed(3)}|${p.center[0].toFixed(5)}|${p.center[1].toFixed(5)}`:'';
      if((id&&ids.has(id))||(parcel&&parcels.has(parcel))||(shape&&shapes.has(shape)))continue;
      if(id)ids.add(id); if(parcel)parcels.add(parcel); if(shape)shapes.add(shape); out.push(p);
    }
    return out;
  }

  function popupHtml(p:any){
    const skip=`https://www.google.com/search?q=`+encodeURIComponent((p.owner||'')+' '+(p.address||''));
    return `<div style="font-family:monospace;font-size:12px;line-height:1.7;min-width:190px">
      ${p.acres!=null?`<b style="color:#E8B04B">${p.acres.toFixed(2)} acres</b><br>`:''}
      ${p.address?p.address+'<br>':''}${p.owner?'Owner: '+p.owner+'<br>':''}
      ${p.zoning?'Zoning: '+p.zoning+'<br>':''}${p.parcel?'Parcel: '+p.parcel+'<br>':''}
      ${p.distance!=null?p.distance.toFixed(1)+' mi from center<br>':''}
      <small style="color:#6E8A86">${p.sourceLabel}</small><br>
      ${p.owner?`<a href="${skip}" target="_blank">Look up owner →</a><br>`:''}
      ${p.idx!=null?`<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;max-width:230px">
        <button data-save-parcel onclick="window.dispatchEvent(new CustomEvent('parcel-save',{detail:${p.idx}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #E8B04B;background:transparent;color:#E8B04B;cursor:pointer;font-family:inherit;font-size:11.5px">
          ★ Save</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-utility',{detail:${p.idx}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #55E0FF;background:transparent;color:#55E0FF;cursor:pointer;font-family:inherit;font-size:11.5px">
          ⚡ Utilities</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-fullreport',{detail:${p.idx}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #B084FF;background:transparent;color:#B084FF;cursor:pointer;font-family:inherit;font-size:11.5px">
          📋 Zoning · schools · comps</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-similar',{detail:${p.idx}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #9FE870;background:transparent;color:#9FE870;cursor:pointer;font-family:inherit;font-size:11.5px">
          ≈ Similar lots</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-market',{detail:${p.idx}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #FFD166;background:transparent;color:#FFD166;cursor:pointer;font-family:inherit;font-size:11.5px">
          📊 Market stats</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-deal',{detail:${p.idx}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #6EE7B7;background:transparent;color:#6EE7B7;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:600">
          💰 Deal analysis</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-soil',{detail:${p.idx}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #C4A65B;background:transparent;color:#C4A65B;cursor:pointer;font-family:inherit;font-size:11.5px">
          🌱 Soil / septic</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-export',{detail:{idx:${p.idx},fmt:'dxf'}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #9FB4AF;background:transparent;color:#9FB4AF;cursor:pointer;font-family:inherit;font-size:11.5px">
          ⬇ DXF (CAD)</button>
        <button onclick="window.dispatchEvent(new CustomEvent('parcel-export',{detail:{idx:${p.idx},fmt:'shp'}}))"
          style="padding:4px 9px;border-radius:7px;border:1px solid #9FB4AF;background:transparent;color:#9FB4AF;cursor:pointer;font-family:inherit;font-size:11.5px">
          ⬇ Shapefile</button>
      </div>`:''}</div>`;
  }

  async function runSearch(override?: { geo?: any; mi?: number; minA?: number; maxA?: number|null }){
    if(!ready)return;
    const L=window.L, map=mapRef.current, pl=parcelLayerRef.current;
    setBusy(true); setResults([]); pl.clearLayers();
    selectParcel(null);
    if(centerMarker.current){map.removeLayer(centerMarker.current);centerMarker.current=null;}
    if(circle.current){map.removeLayer(circle.current);circle.current=null;}
    try{
      // A drawn search polygon beats city+radius; a street number in the search
      // box means "find THIS parcel": shrink to the geocoded point, no filters.
      const usePoly = !override && !!searchArea;
      const isAddress = !override && !usePoly && /^\s*\d+\s+\S+/.test(city);
      const mi = override?.mi ?? (usePoly ? polyReachMi(searchArea!) : (isAddress ? 0.06 : radius));
      const minA = override?.minA ?? (isAddress ? 0 : (minAcres||0));
      const maxA = override?.maxA !== undefined ? override.maxA : (isAddress ? null : (maxAcres?parseFloat(maxAcres):null));
      setStatusMsg(usePoly ? 'Reading your drawn search area…' : isAddress ? 'Locating that address…' : 'Locating place…');
      let geo = override?.geo;
      if(!geo&&usePoly){ const c=polyCenter(searchArea!); geo=await reverseGeo(c[0],c[1]); }
      if(!geo) geo=await geocode(city);
      if(!geo){ setStatusMsg('Couldn\u2019t find that U.S. place. Try adding a state, e.g. "Shelby, NC".'); setBusy(false); return; }
      if(!usePoly){
        centerMarker.current=L.marker([geo.lat,geo.lon]).addTo(map);
        circle.current=L.circle([geo.lat,geo.lon],{radius:mi*MILES_TO_M,color:'#6FD6E0',weight:1,fillColor:'#6FD6E0',fillOpacity:.05}).addTo(map);
        map.setView([geo.lat,geo.lon],isAddress?15:11);
      } else if(searchAreaLayer.current){ try{ map.fitBounds(searchAreaLayer.current.getBounds(),{padding:[40,40]}); }catch{} }
      const areaBounds = usePoly ? polyBBox(searchArea!) : undefined;
      const areas=await searchAreas(geo,mi);
      const sources=srcForAreas(areas);
      if(!sources.length){ setStatusMsg(`Found ${geo.label.split(',')[0]}, but no free parcel source covers ${geo.county||geo.state||'that area'} yet. NC is statewide; in SC, York & Greenville are wired — Lancaster, Chester & Spartanburg need a source added.`); setBusy(false); return; }
      const uncovered=areas.filter((area:any)=>!srcForLoc(area).length);
      const uncoveredLabel=uncovered.slice(0,4).map((area:any)=>`${area.county} ${area.stateAbbr||''}`.trim()).join(', ');
      setStatusMsg(`Searching ${sources.length} source(s) across ${areas.length||1} count${areas.length===1?'y':'ies'} near ${geo.label.split(',')[0]}…`);
      const all:any[]=[], warn:string[]=[];
      for(const s of sources){
        try{
          const queried=await querySource(s,geo,mi,minA,maxA,areaBounds),feats=queried.features;
          if(queried.truncated)warn.push(`${s.label||s.state}: stopped at ${MAX_SOURCE_RESULTS.toLocaleString()} parcels`);
          // Address mode: a big parcel's centroid can sit far from the pin —
          // the GIS already confirmed the point is inside it, so keep it.
          for(const f of feats){
            const n=normalize(f,s,geo); if(!n)continue;
            if(usePoly){ if(!n.center||!pointInPoly(n.center as [number,number],searchArea!))continue; }
            else if(!isAddress&&n.distance>mi)continue;
            if(n.acres!=null){ if(n.acres<minA)continue; if(maxA!=null&&n.acres>maxA)continue; }
            all.push(n);
          }
        }catch(e:any){ warn.push(`${s.label||s.state}: ${e.message}`); }
      }
      const deduped=dedupeParcels(all);
      // Rank for the sidebar: promising acquisitions first, not biggest first.
      const scoreCtx={ minA, maxA: maxA??null, mi };
      deduped.forEach((p,i)=>{ p.idx=i; p.cand=candidateInfo(p,scoreCtx); });
      resultsRef.current = deduped;
      for(const p of deduped) pl.addData({ type:'Feature', geometry:p.geojson, properties:p });
      setResults(deduped);
      if(deduped.length){ try{ map.fitBounds(L.featureGroup([pl,circle.current,searchAreaLayer.current].filter(Boolean)).getBounds(),{padding:[40,40]}); }catch{}
        setStatusMsg(isAddress
          ? `Found ${deduped.length===1?'the parcel':deduped.length+' parcels'} at that address — click it on the map for details, save, and exports.`
          : `Found ${deduped.length} unique parcel(s) ≥ ${minA} ac ${usePoly?'in your drawn area':`within ${mi} mi`} across ${areas.length||1} count${areas.length===1?'y':'ies'}.${uncovered.length?` No connected parcel source for ${uncoveredLabel}${uncovered.length>4?` and ${uncovered.length-4} more`:''}.`:''}${warn.length?' Some sources had issues.':''}`); }
      else setStatusMsg(isAddress?`Geocoded the address, but no parcel layer covers that exact point. Try the county name instead.`:`No parcels matched. Try a larger radius or lower minimum acreage.`);
    }catch(e:any){ setStatusMsg('Search failed: '+e.message); }
    finally{ setBusy(false); }
  }

  const runSearchRef = useRef<any>(null);
  runSearchRef.current = runSearch;

  // Parcel-number search: uses the place box to pick the county's GIS, then
  // matches the parcel field directly (partial matches allowed).
  async function searchByParcelNo(){
    if(!ready||!parcelNo.trim())return;
    const L=window.L, map=mapRef.current, pl=parcelLayerRef.current;
    setBusy(true); setResults([]); pl.clearLayers();
    try{
      setStatusMsg('Locating the county for that parcel #…');
      const geo=await geocode(city);
      if(!geo){ setStatusMsg('Enter a city or county in the place box first so I know which county GIS to search.'); setBusy(false); return; }
      const sources=srcForLoc(geo).filter((s:any)=>s.parcelField);
      if(!sources.length){ setStatusMsg('No parcel source with parcel numbers covers that area.'); setBusy(false); return; }
      const value=parcelNo.trim().replace(/'/g,"''");
      const all:any[]=[];
      for(const s of sources.slice(0,3)){
        try{
          const base=s.serviceUrl.replace(/\/$/,'')+'/'+s.layerId+'/query';
          const p=new URLSearchParams();
          p.set('where',`UPPER(${s.parcelField}) LIKE UPPER('%${value}%')`);
          p.set('outFields','*'); p.set('returnGeometry','true'); p.set('outSR','4326');
          p.set('resultRecordCount','25'); p.set('f','json');
          const d=await fetchJson(base+'?'+p.toString());
          for(const f of (d.features||[])){ const n=normalize(f,s,geo); if(n) all.push(n); }
        }catch{ /* source down — try the next */ }
      }
      all.forEach((p,i)=>{ p.idx=i; });
      resultsRef.current=all;
      for(const p of all) pl.addData({ type:'Feature', geometry:p.geojson, properties:p });
      setResults(all);
      if(all.length){ try{ map.fitBounds(pl.getBounds(),{padding:[40,40],maxZoom:16}); }catch{}
        setStatusMsg(`Found ${all.length} parcel(s) matching #${parcelNo.trim()}.`); }
      else setStatusMsg(`No parcel matching #${parcelNo.trim()} in ${geo.county||'that county'}. Check the number format on the county GIS site.`);
    }catch(e:any){ setStatusMsg('Parcel # search failed: '+e.message); }
    finally{ setBusy(false); }
  }

  function toggleLayer(id:string){
    const L=window.L, map=mapRef.current; if(!map)return;
    const def:any=LAYERS.find(l=>l.id===id)!;
    if(overlayLayers.current[id]){ map.removeLayer(overlayLayers.current[id]); delete overlayLayers.current[id]; setActiveLayers(a=>a.filter(x=>x!==id)); return; }
    const lyr=buildOverlay(L, map, def);
    lyr.addTo(map); overlayLayers.current[id]=lyr; setActiveLayers(a=>[...a,id]);
  }
  function focusParcel(p:any){
    selectParcel(p.idx);
    if(mapRef.current){ mapRef.current.setView(p.center,14); }
    try{ parcelLayerRef.current?.eachLayer((l:any)=>{ if(l.feature?.properties?.idx===p.idx) l.openPopup(); }); }catch{}
  }

  async function saveParcel(p:any, btn?:HTMLButtonElement){
    if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
    try{
      // The parcel's analysis setup (drawn area + rules) and any reports
      // already pulled ride along, so a save keeps the whole workup.
      const sc = scopeFor(p);
      const hasScope = sc.polygon || sc.newOnly || sc.criteria || sc.radiusMiles !== DEFAULT_SCOPE.radiusMiles;
      const reports = reportsByParcel.current[p.__id] || null;
      const res = await fetch('/api/parcels/save', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          acres: p.acres, address: p.address, owner: p.owner, zoning: p.zoning,
          county: p.county, url: p.url || p.listingUrl,
          lat: p.center?.[0], lon: p.center?.[1],
          title: p.address || (p.acres ? `${p.acres.toFixed(1)} acres` : 'Saved parcel'),
          compScope: hasScope ? sc : undefined,
          reports: reports || undefined,
        }),
      });
      const j = await res.json().catch(()=>({}));
      if(!res.ok || j.error) throw new Error(j.error || `save failed (HTTP ${res.status})`);
      if(btn){ btn.textContent = j.already ? '✓ Already saved' : '✓ Saved'; }
    }catch{ if(btn){ btn.disabled=false; btn.textContent='✗ Save failed — tap to retry'; } }
  }


  return (
    <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', height:'calc(100vh - 53px)' }}>
      {/* sidebar */}
      <aside style={{ background:'var(--ink2)', borderRight:'1px solid var(--line)', overflowY:'auto', padding:'18px 18px 40px' }}>
        {selIdx!=null && results[selIdx] && (
          <div style={{ border:'1px solid var(--amber)', borderRadius:10, padding:'12px 13px', marginBottom:18, background:'rgba(232,176,75,.06)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
              <div className="mono" style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--amber)' }}>Selected parcel</div>
              <button className="btn" style={{ padding:'1px 8px', fontSize:12, flex:'none' }} onClick={()=>selectParcel(null)}>✕</button>
            </div>
            <div className="display" style={{ fontWeight:600, fontSize:13.5, marginTop:6 }}>
              {results[selIdx].acres!=null?results[selIdx].acres.toFixed(1)+' acres':'Acreage n/a'}
            </div>
            <div className="mono" style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
              {results[selIdx].address || (results[selIdx].parcel ? `Parcel ${results[selIdx].parcel}` : '—')}
            </div>
            <div className="mono" style={{ fontSize:10.5, color:'var(--muted)', margin:'8px 0', lineHeight:1.5 }}>
              Analysis area & rules for THIS parcel — used by its 💰 deal analysis, 📊 market stats & 📋 comps. Each parcel remembers its own.
            </div>
            {selScope.polygon ? (
              <div style={{ border:'1px solid #FF7BD5', borderRadius:8, padding:'8px 10px', marginBottom:8, background:'rgba(255,123,213,.05)' }}>
                <div className="mono" style={{ fontSize:11.5, color:'#FF7BD5' }}>Using drawn area ({selScope.polygon.length} corners)</div>
                <button className="btn" style={{ padding:'3px 9px', fontSize:11.5, marginTop:6 }} onClick={clearCompArea}>✕ Clear — back to radius</button>
              </div>
            ) : (
              <div style={{ marginBottom:8 }}>
                <label className="label">Pull data within <b style={{ color:'var(--cyan)' }}>{selScope.radiusMiles} mi</b></label>
                <input type="range" min={0.5} max={15} step={0.5} value={selScope.radiusMiles}
                  onChange={e=>updateSelScope({ radiusMiles:+e.target.value })} style={{ width:'100%', accentColor:'var(--cyan)' }} />
              </div>
            )}
            {drawing && drawTarget==='comp' ? (
              <div style={{ border:'1px dashed #FF7BD5', borderRadius:8, padding:'8px 10px', marginBottom:8 }}>
                <div className="mono" style={{ fontSize:11.5, color:'#FF7BD5', lineHeight:1.5 }}>
                  Click and drag on the map to trace the analysis area — release the mouse to finish. Other parcels won't get in the way.
                </div>
                <div style={{ display:'flex', gap:6, marginTop:7 }}>
                  <button className="btn" style={{ padding:'3px 9px', fontSize:11.5 }} onClick={cancelDraw}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn" style={{ width:'100%', marginBottom:8 }} onClick={()=>startDraw('comp')}>
                ✏️ {selScope.polygon ? 'Redraw the analysis area' : 'Draw the analysis area on the map'}
              </button>
            )}
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:7 }}>
              <input type="checkbox" checked={selScope.newOnly} onChange={e=>updateSelScope({ newOnly:e.target.checked })} style={{ accentColor:'var(--cyan)' }} />
              <span style={{ fontSize:12.5 }}>New-construction comps only</span>
            </label>
            <label className="label">Extra comp criteria (optional)</label>
            <input className="input" value={selScope.criteria} onChange={e=>updateSelScope({ criteria:e.target.value })}
              placeholder="e.g. 3000+ sqft, same school district" />
            <button className="btn" style={{ width:'100%', marginTop:9 }}
              onClick={(e)=>saveParcel(results[selIdx], e.currentTarget)}>
              💾 Save parcel — keeps this area & any pulled reports
            </button>
          </div>
        )}
        <div className="mono" style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--amber)', marginBottom:9 }}>Search area</div>
        <label className="label">City, county, or full address (U.S.)</label>
        <input className="input" style={{ marginBottom:4 }} value={city} onChange={e=>setCity(e.target.value)} placeholder="Gastonia, NC — or 123 Main St, Shelby, NC" />
        <div className="mono" style={{ fontSize:10.5, color:'var(--muted)', marginBottom:10 }}>Type a full street address to jump straight to that exact parcel.</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
          <div><label className="label">Radius (mi)</label><input className="input" type="number" value={radius} onChange={e=>setRadius(+e.target.value)} /></div>
          <div><label className="label">Min acres</label><input className="input" type="number" value={minAcres} onChange={e=>setMinAcres(+e.target.value)} /></div>
        </div>
        <label className="label" style={{ marginTop:10, display:'block' }}>Max acres (optional)</label>
        <input className="input" type="number" value={maxAcres} onChange={e=>setMaxAcres(e.target.value)} placeholder="no max" />
        <button className="btn btn-primary" style={{ width:'100%', marginTop:12 }} onClick={()=>runSearch()} disabled={!ready||busy}>
          {busy ? 'Searching…' : 'Find parcels'}
        </button>
        {searchArea ? (
          <div style={{ border:'1px solid var(--cyan)', borderRadius:8, padding:'9px 11px', marginTop:9, background:'rgba(111,214,224,.05)' }}>
            <div className="mono" style={{ fontSize:11.5, color:'var(--cyan)' }}>Searching inside your drawn area ({searchArea.length} corners) — city & radius ignored</div>
            <button className="btn" style={{ padding:'4px 10px', fontSize:12, marginTop:7 }} onClick={clearSearchArea}>✕ Clear — back to city + radius</button>
          </div>
        ) : drawing && drawTarget==='search' ? (
          <div style={{ border:'1px dashed var(--cyan)', borderRadius:8, padding:'9px 11px', marginTop:9 }}>
            <div className="mono" style={{ fontSize:11.5, color:'var(--cyan)', lineHeight:1.5 }}>
              Click and drag on the map to trace your search area — release the mouse to finish.
            </div>
            <div style={{ display:'flex', gap:6, marginTop:8 }}>
              <button className="btn" style={{ padding:'4px 10px', fontSize:12 }} onClick={cancelDraw}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn" style={{ width:'100%', marginTop:9 }} onClick={()=>startDraw('search')} disabled={!ready||busy}>
            ✏️ Draw a search area on the map instead
          </button>
        )}

        <label className="label" style={{ marginTop:14, display:'block' }}>Or search by parcel #</label>
        <div style={{ display:'flex', gap:6 }}>
          <input className="input" value={parcelNo} onChange={e=>setParcelNo(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') searchByParcelNo(); }} placeholder="e.g. 3579-17-0207" />
          <button className="btn" style={{ flex:'none', padding:'8px 12px' }} onClick={searchByParcelNo} disabled={!ready||busy||!parcelNo.trim()}>Find</button>
        </div>
        <div className="mono" style={{ fontSize:10.5, color:'var(--muted)', marginTop:4 }}>Uses the city/county above to pick the right county records.</div>

        <div className="mono" style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--amber)', margin:'20px 0 9px' }}>Feasibility layers</div>
        {LAYERS.map(l=>{
          const on=activeLayers.includes(l.id);
          return (
            <div key={l.id} onClick={()=>toggleLayer(l.id)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:`1px solid ${on?'var(--cyan)':'var(--line)'}`,
                background:on?'rgba(111,214,224,.06)':'transparent', borderRadius:8, marginBottom:7, cursor:'pointer' }}>
              <span style={{ width:30, height:17, borderRadius:10, background:on?'var(--cyan)':'var(--line2)', position:'relative', flex:'none' }}>
                <span style={{ position:'absolute', top:2, left:on?15:2, width:13, height:13, borderRadius:'50%', background:'var(--ink)', transition:'.15s' }} />
              </span>
              <span style={{ fontSize:13 }}>{l.name}<br/><span className="mono" style={{ fontSize:11, color:'var(--muted)' }}>{l.note}</span></span>
              <span style={{ width:8, height:8, borderRadius:2, background:l.color, marginLeft:'auto' }} />
            </div>
          );
        })}
        <div className="mono" style={{ fontSize:10.5, color:'var(--muted)', lineHeight:1.6, marginTop:6 }}>
          Layers draw from national + county GIS. Where a county doesn\u2019t publish a layer, it simply won\u2019t appear there.
        </div>
      </aside>

      {/* map + results */}
      <div style={{ position:'relative' }}>
        <div ref={mapEl} style={{ position:'absolute', inset:0, background:'#0B1416' }} />
        <div style={{ position:'absolute', bottom:14, left:14, zIndex:900, maxWidth:'55%',
          background:'rgba(15,27,30,.94)', border:'1px solid var(--line2)', borderRadius:9, padding:'10px 14px', fontSize:12.5, backdropFilter:'blur(4px)' }}>
          {statusMsg}
        </div>
        {utilReport && (
          <div style={{ position:'absolute', top:14, left:14, width:410, maxWidth:'48%', maxHeight:'calc(100% - 28px)', overflowY:'auto', zIndex:950,
            background:'var(--ink2)', border:'1px solid var(--cyan)', borderRadius:12, padding:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:8 }}>
              <b style={{ fontSize:13 }}>{utilReport.title}</b>
              <button onClick={()=>setUtilReport(null)} className="btn" style={{ padding:'2px 9px', fontSize:12, flex:'none' }}>✕</button>
            </div>
            {utilReport.loading
              ? <div className="mono" style={{ fontSize:12, color:'var(--cyan)' }}>{utilReport.loadingMsg || 'Working…'}</div>
              : <div className="mono" style={{ fontSize:12, whiteSpace:'pre-wrap', lineHeight:1.65 }}
                  dangerouslySetInnerHTML={{ __html: formatReport(utilReport.text) }} />}
          </div>
        )}
        {results.length>0 && (
          <div style={{ position:'absolute', top:14, right:14, width:330, maxHeight:'calc(100% - 28px)', overflowY:'auto', zIndex:900,
            background:'var(--ink2)', border:'1px solid var(--line)', borderRadius:12, padding:12 }}>
            <div className="mono" style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>
              {results.length} parcels · top {Math.min(20,results.length)} candidates
              <span style={{ display:'block', marginTop:2 }}>ranked by size fit, shape, owner, access & distance — not raw acreage</span>
            </div>
            {[...results].sort((a,b)=>((b.cand?.score??0)-(a.cand?.score??0))||((b.acres||0)-(a.acres||0))).slice(0,20).map(p=>(
              <div key={p.__id} className="card" style={{ padding:'11px 12px', marginBottom:8 }}>
                <div onClick={()=>focusParcel(p)} style={{ cursor:'pointer' }}>
                  <div className="display" style={{ fontWeight:600, fontSize:13.5 }}>{p.acres!=null?p.acres.toFixed(1)+' acres':'Acreage n/a'}</div>
                  {p.cand?.why?.length ? (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:5 }}>
                      {p.cand.why.slice(0,4).map((w:string)=>(
                        <span key={w} className="mono" style={{ fontSize:9.5, padding:'2px 7px', borderRadius:9, border:'1px solid var(--line2)', color:'var(--cyan)' }}>{w}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mono" style={{ fontSize:11.5, color:'var(--muted)', marginTop:4 }}>
                    {p.address || '—'}{p.zoning?` · ${p.zoning}`:''}{p.distance!=null?` · ${p.distance.toFixed(1)} mi`:''}
                  </div>
                  {p.owner && <div className="mono" style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Owner: {p.owner}</div>}
                </div>
                <button className="btn" style={{ padding:'4px 10px', fontSize:12, marginTop:8 }}
                  onClick={(e)=>{ e.stopPropagation(); saveParcel(p, e.currentTarget); }}>
                  ★ Save parcel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
