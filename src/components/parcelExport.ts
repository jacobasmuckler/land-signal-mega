// Parcel boundary exports: DXF for AutoCAD (in UTM meters so distances are
// real) and zipped Shapefile for GIS. All client-side — no server round trip.

// ── WGS84 → UTM (standard Transverse Mercator series, ~cm accuracy) ─────────
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);

export function utmZone(lon: number) {
  return Math.floor((lon + 180) / 6) + 1;
}

export function toUTM(lon: number, lat: number, zone: number) {
  const rad = Math.PI / 180;
  const phi = lat * rad, lam = lon * rad;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * rad;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan, C = EP2 * cos * cos;
  const Aa = (lam - lam0) * cos;
  const M = A * (
    (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 * E2 * E2 / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * E2 * E2 * E2 / 1024) * Math.sin(4 * phi)
    - (35 * E2 * E2 * E2 / 3072) * Math.sin(6 * phi)
  );
  const x = K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120) + 500000;
  let y = K0 * (M + N * tan * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720));
  if (lat < 0) y += 10000000;
  return { x, y };
}

// ── minimal DXF (R12 POLYLINE — opens in every AutoCAD) ─────────────────────
export function ringsToDXF(rings: number[][][]): { dxf: string; zone: number } {
  const zone = utmZone(rings[0][0][0]);
  const lines: string[] = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const ring of rings) {
    lines.push('0', 'POLYLINE', '8', 'PARCEL', '66', '1', '70', '1');
    for (const [lon, lat] of ring) {
      const { x, y } = toUTM(lon, lat, zone);
      lines.push('0', 'VERTEX', '8', 'PARCEL', '10', x.toFixed(3), '20', y.toFixed(3), '30', '0');
    }
    lines.push('0', 'SEQEND', '8', 'PARCEL');
  }
  lines.push('0', 'ENDSEC', '0', 'EOF', '');
  return { dxf: lines.join('\r\n'), zone };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeName(name: string) {
  return (name || 'parcel').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'parcel';
}

export function downloadDXF(rings: number[][][], name: string) {
  const { dxf, zone } = ringsToDXF(rings);
  triggerDownload(new Blob([dxf], { type: 'application/dxf' }), `${safeName(name)}_UTM${zone}N.dxf`);
  return zone;
}

export async function downloadSHP(rings: number[][][], name: string, properties: Record<string, any> = {}) {
  const shpwrite: any = await import('@mapbox/shp-write');
  const geojson = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: rings } }],
  };
  const blob: Blob = await shpwrite.zip(geojson, { outputType: 'blob', compression: 'DEFLATE', types: { polygon: safeName(name) } });
  triggerDownload(blob, `${safeName(name)}_shapefile.zip`);
}
