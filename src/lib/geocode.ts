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
      signal: AbortSignal.timeout(10_000),
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

  try {
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': `CharlotteLandScanner/1.0 (${email})` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || !data[0]) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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

  return null;
}
