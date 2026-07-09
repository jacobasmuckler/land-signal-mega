import { geocodeAddress } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

// Browser-side geocoding fallback for the Parcel Finder. Nominatim (the only
// geocoder a browser can call directly) misses many rural street addresses;
// this proxies to the server-side chain (Census → Nominatim → Photon).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return Response.json({ error: 'missing q' }, { status: 400 });
  const result = await geocodeAddress(q);
  return Response.json(result || {});
}
