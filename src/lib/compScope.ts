// Comp scope: the user-chosen area + filters that comps/market data must come
// from. Set in the Parcel Finder sidebar (radius slider, drawn map polygon,
// new-builds-only, free-text criteria) and passed to deal-analysis, market
// stats, and the full due-diligence report so the AI searches the right
// neighborhood instead of "somewhere in the metro".

export type CompScope = {
  radiusMiles: number | null;
  polygon: [number, number][] | null; // [lat, lon] vertices
  newOnly: boolean;
  criteria: string;
};

export function parseCompScope(raw: any): CompScope {
  const s = raw || {};
  const r = Number(s.radiusMiles);
  let polygon: [number, number][] | null = null;
  if (Array.isArray(s.polygon) && s.polygon.length >= 3) {
    const pts = s.polygon.slice(0, 100)
      .map((p: any) => [Number(p?.[0]), Number(p?.[1])] as [number, number])
      .filter((p: [number, number]) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length >= 3) polygon = pts;
  }
  return {
    radiusMiles: Number.isFinite(r) && r > 0 ? Math.min(r, 50) : null,
    polygon,
    newOnly: !!s.newOnly,
    criteria: String(s.criteria || '').replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

export function polygonCenter(polygon: [number, number][]) {
  let lat = 0, lon = 0;
  for (const p of polygon) { lat += p[0]; lon += p[1]; }
  return { lat: lat / polygon.length, lon: lon / polygon.length };
}

// Where the "area stats" (census tract etc.) should be sampled: the drawn
// area's center if one exists, else the parcel itself.
export function scopeCenter(scope: CompScope, parcel: { lat: number; lon: number }) {
  return scope.polygon ? polygonCenter(scope.polygon) : parcel;
}

function milesBetween(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3958.8, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Best-effort neighborhood/city/ZIP label so the AI's web searches can use
// real place names instead of bare coordinates. Never throws.
export async function describeArea(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`,
      { headers: { 'User-Agent': 'land-signal/1.0 (comp-scope)' }, signal: AbortSignal.timeout(6_000) },
    );
    const a = (await res.json())?.address;
    if (!a) return null;
    const parts = [a.suburb || a.neighbourhood || a.hamlet, a.town || a.city || a.village, a.county, a.postcode ? `ZIP ${a.postcode}` : null]
      .filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  } catch { return null; }
}

// Prompt lines that make the scope a HARD constraint. parcelLabel is the
// address/coords string the route already built; areaLabel comes from
// describeArea (may be null).
export function compScopeLines(scope: CompScope, parcelLabel: string, areaLabel: string | null): string[] {
  const lines: string[] = [];
  if (scope.polygon) {
    const c = polygonCenter(scope.polygon);
    const reachMi = Math.max(...scope.polygon.map(p => milesBetween(c.lat, c.lon, p[0], p[1])));
    lines.push(
      `COMP AREA — the user drew a specific boundary on the map; treat it as a HARD limit. Only use sold comps and market data from INSIDE this polygon (corners as lat, lon): ${scope.polygon.map(p => `(${p[0].toFixed(4)}, ${p[1].toFixed(4)})`).join(' ')}. ` +
      `That is roughly the area within ${Math.max(0.3, reachMi).toFixed(1)} mi of ${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}${areaLabel ? ` — approximately the ${areaLabel} area` : ''}. ` +
      'If you cannot tell whether a sale is inside the boundary, EXCLUDE it and say the comp pool was thin — never widen the area silently.',
    );
  } else {
    lines.push(
      `COMP RADIUS — HARD limit: only use sold comps and market data within ${scope.radiusMiles ?? 3} miles of ${parcelLabel}${areaLabel ? ` (${areaLabel})` : ''}. ` +
      'If you cannot tell a sale\'s distance, exclude it and say the comp pool was thin — never widen the radius silently.',
    );
  }
  if (scope.newOnly) {
    lines.push(
      'NEW CONSTRUCTION ONLY: use only sales of newly built homes (built in the last ~3 years or sold new by a builder). ' +
      'If too few new-build sales exist inside the area, say exactly that; you may list older resales separately, clearly labeled "outside criteria — context only". Never quietly blend them in.',
    );
  }
  if (scope.criteria) {
    lines.push(`ADDITIONAL COMP REQUIREMENTS from the user (must follow, same exclude-when-unsure rule): ${scope.criteria}`);
  }
  return lines;
}
