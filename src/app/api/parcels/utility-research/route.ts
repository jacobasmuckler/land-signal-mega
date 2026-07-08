import { runUtilityResearch } from '@/lib/utilityResearch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// On-demand utility research for a parcel clicked in the Parcel Finder.
// Takes the parcel's fields as JSON and returns the report as JSON — nothing
// is stored, it is a live lookup for whatever plot the user clicked.
export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch { /* empty body handled below */ }

  const info = {
    title: body.title,
    address: body.address,
    county: body.county,
    state: body.state,
    acreage: typeof body.acres === 'number' ? body.acres : body.acreage,
    latitude: body.lat ?? body.latitude,
    longitude: body.lon ?? body.longitude,
    owner: body.owner,
    parcelId: body.parcel ?? body.parcelId,
    zoning: body.zoning,
  };

  if (!info.address && info.latitude == null) {
    return Response.json({ error: 'Need at least an address or coordinates for the parcel.' }, { status: 400 });
  }

  try {
    const report = await runUtilityResearch(info);
    return Response.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Utility research failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
