// Shared map overlay engine — used by the Parcel Finder AND the For-Sale
// Alerts map so both offer the same feasibility layers (topo, water, flood,
// hydrants, water/sewer mains).

export const MAP_LAYERS = [
  { id:'roads', name:'Public roads', note:'OpenStreetMap', color:'#9FB4AF', type:'tile',
    url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opacity:.55 },
  { id:'water', name:'Water & hydrology', note:'USGS NHD', color:'#4FA8C5', type:'esri',
    url:'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/export' },
  { id:'flood', name:'FEMA floodplains', note:'FEMA NFHL', color:'#7B6FD6', type:'esri',
    url:'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export' },
  { id:'topo', name:'Topography / contours', note:'USGS 3DEP', color:'#C7A867', type:'tile',
    url:'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', opacity:.7 },
  // Zoning was tried as a map overlay but the source layer draws boundary
  // outlines only (no category fill) — at any normal zoom, thousands of them
  // merge into a solid-looking blob instead of a useful legend. Zoning is
  // answered per-parcel instead via the "Zoning · schools · comps" button.
  { id:'schools', name:'Schools (public K-12)', note:'NCES EDGE — hover a dot for the name', color:'#FF9DE2', type:'featureGroup',
    sources:[
      { url:'https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2324/MapServer/0/query', kind:'point', color:'#FF9DE2' },
    ] },
  // Hydrant / water-main / sewer-main layers were removed: they only covered
  // 2-3 counties and looked broken everywhere else. Per-parcel utility answers
  // come from the ⚡ Research utilities button instead.
];

function esriOverlay(L: any, map: any, exportUrl: string, layers?: string) {
  const group = L.layerGroup(); let img: any = null;
  function refresh() {
    const b = map.getBounds(), size = map.getSize();
    const params: any = { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(','), bboxSR: '4326', imageSR: '3857', size: `${size.x},${size.y}`, format: 'png32', transparent: 'true', f: 'image' };
    if (layers) params.layers = layers;
    const u = exportUrl + '?' + new URLSearchParams(params);
    if (img) group.removeLayer(img);
    img = L.imageOverlay(u, b, { opacity: .6 });
    group.addLayer(img);
  }
  group.on('add', () => { refresh(); map.on('moveend', refresh); });
  group.on('remove', () => map.off('moveend', refresh));
  return group;
}

function esriOverlayGroup(L: any, map: any, sources: any[]) {
  const group = L.layerGroup(); const children: any[] = [];
  group.on('add', () => {
    for (const src of sources) { const child = esriOverlay(L, map, src.url, src.layers); children.push(child); child.addTo(group); }
  });
  group.on('remove', () => { for (const child of children) group.removeLayer(child); children.length = 0; });
  return group;
}

function arcgisFeatureOverlay(L: any, map: any, sources: any[]) {
  const group = L.layerGroup(); let alive = true, timer: any = null;
  function esriToGeoJSON(feature: any) {
    const g = feature.geometry;
    if (!g) return null;
    if (typeof g.x === 'number' && typeof g.y === 'number') return { type: 'Point', coordinates: [g.x, g.y] };
    if (Array.isArray(g.paths)) return { type: 'MultiLineString', coordinates: g.paths };
    if (Array.isArray(g.rings)) return { type: 'Polygon', coordinates: g.rings };
    return null;
  }
  async function refresh() {
    if (!alive) return;
    group.clearLayers();
    const b = map.getBounds();
    for (const src of sources) {
      try {
        const params = new URLSearchParams({
          f: 'json', where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326',
          geometry: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(','),
          geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
          resultRecordCount: '1000',
        });
        const res = await fetch(src.url + '?' + params.toString());
        const data = await res.json();
        const features = (data.features || []).map((f: any) => ({ type: 'Feature', geometry: esriToGeoJSON(f), properties: f.attributes || {} })).filter((f: any) => f.geometry);
        const layer = L.geoJSON({ type: 'FeatureCollection', features }, {
          pointToLayer: (_f: any, latlng: any) => L.circleMarker(latlng, { radius: 4, color: src.color || '#55E0FF', fillColor: src.color || '#55E0FF', fillOpacity: .9, weight: 1 }),
          style: () => ({ color: src.color || '#55E0FF', weight: 2.5, opacity: .85, fillOpacity: .12 }),
          onEachFeature: (f: any, lyr: any) => {
            const label = f.properties?.NAME || f.properties?.name || f.properties?.Name;
            if (label) lyr.bindTooltip(String(label));
          },
        });
        layer.addTo(group);
      } catch { /* county doesn't publish this layer here */ }
    }
  }
  function delayed() { clearTimeout(timer); timer = setTimeout(refresh, 250); }
  group.on('add', () => { alive = true; refresh(); map.on('moveend', delayed); });
  group.on('remove', () => { alive = false; clearTimeout(timer); map.off('moveend', delayed); group.clearLayers(); });
  return group;
}

export function buildOverlay(L: any, map: any, def: any) {
  if (def.type === 'tile') return L.tileLayer(def.url, { opacity: def.opacity || .6, subdomains: 'abc', maxZoom: 19, attribution: def.note });
  if (def.type === 'esriGroup') return esriOverlayGroup(L, map, def.sources || []);
  if (def.type === 'featureGroup') return arcgisFeatureOverlay(L, map, def.sources || []);
  return esriOverlay(L, map, def.url, def.layers);
}
