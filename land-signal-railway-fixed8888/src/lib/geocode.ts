export type GeocodeResult = { lat: number; lng: number };

function unique(values: string[]) {
  return Array.from(new Set(values.map(v => v.replace(/\s+/g, ' ').trim()).filter(Boolean)));
}

function cityStateFallback(address: string): string | undefined {
  const cleaned = address.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/,\s*([A-Za-z .'-]{2,45}),\s*(NC|SC|VA|GA|TN|North Carolina|South Carolina)(?:\s+\d{5})?\b/i)
    || cleaned.match(/\b([A-Za-z .'-]{2,45}),\s*(NC|SC|VA|GA|TN|North Carolina|South Carolina)(?:\s+\d{5})?\b/i);
  if (!match) return undefined;
  return `${match[1].trim()}, ${match[2].trim()}, USA`;
}

async function geocodeWithCensus(address: string): Promise<GeocodeResult | null> {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  try {
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'CharlotteLandScanner/1.0' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const coordinates = data?.result?.addressMatches?.[0]?.coordinates;
    const lat = Number(coordinates?.y);
    const lng = Number(coordinates?.x);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

// Nominatim's hard usage policy is ONE request per second per IP. During a
// scan we geocode many listings back-to-back, so without this throttle the
// first request succeeds and every following one gets rejected — which is
// exactly the "only the first listing got a location" symptom.
let nominatimNextAllowedAt = 0;
async function nominatimThrottle() {
  const wait = nominatimNextAllowedAt - Date.now();
  nominatimNextAllowedAt = Math.max(Date.now(), nominatimNextAllowedAt) + 1_150;
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
}

async function geocodeWithNominatim(address: string): Promise<GeocodeResult | null> {
  // NOMINATIM_EMAIL is a politeness header, not a requirement — never let a
  // missing env var silently disable geocoding (it drops real listings).
  const email = process.env.NOMINATIM_EMAIL || 'landsignal@fitprecast.com';
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('q', address);
  url.searchParams.set('email', email);

  for (let attempt = 1; attempt <= 2; attempt++) {
    await nominatimThrottle();
    try {
      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': `CharlotteLandScanner/1.0 (${email})` },
        signal: AbortSignal.timeout(6_000),
      });
      if (response.status === 429 || response.status === 403 || response.status >= 500) {
        // rate-limited — back off and try once more
        await new Promise(resolve => setTimeout(resolve, 2_000));
        continue;
      }
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data) || !data[0]) return null;
      const lat = Number(data[0].lat);
      const lng = Number(data[0].lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
      // timeout/network — retry loop handles it
    }
  }
  return null;
}

// Photon (photon.komoot.io) — free OSM-based geocoder, no key needed. Used as
// the last resort when Census and Nominatim both miss. Biased to Charlotte.
async function geocodeWithPhoton(address: string): Promise<GeocodeResult | null> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', address);
  url.searchParams.set('limit', '1');
  url.searchParams.set('lat', '35.2271');
  url.searchParams.set('lon', '-80.8431');

  try {
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'CharlotteLandScanner/1.0' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    if (feature.properties?.countrycode && feature.properties.countrycode !== 'US') return null;
    const [lng, lat] = feature.geometry?.coordinates || [];
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: Number(lat), lng: Number(lng) } : null;
  } catch {
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address || address.length < 5) return null;
  const variants = unique([
    address,
    `${address}, USA`,
    cityStateFallback(address) || '',
  ]);

  // The Census geocoder only matches real street addresses. County- or
  // city-level locations ("Chester County, SC") always miss there, so go
  // straight to Nominatim for those instead of wasting a 10s timeout.
  const hasStreetNumber = /^\s*\d{1,6}\s+\S/.test(address);

  for (const variant of variants) {
    const result = hasStreetNumber
      ? (await geocodeWithCensus(variant) ?? await geocodeWithNominatim(variant))
      : await geocodeWithNominatim(variant);
    if (result) return result;
  }

  // Last resort: Photon on the strongest variants (rural roads often miss in
  // Census/Nominatim but resolve here at city/road level — good enough to map).
  for (const variant of variants) {
    const result = await geocodeWithPhoton(variant);
    if (result) return result;
  }

  return null;
}
