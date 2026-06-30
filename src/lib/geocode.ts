export type GeocodeResult = { lat: number; lng: number };

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
  const email = process.env.NOMINATIM_EMAIL;
  if (!email) return null;
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
  return await geocodeWithCensus(address) ?? await geocodeWithNominatim(address);
}
