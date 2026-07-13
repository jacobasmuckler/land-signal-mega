export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// USDA Soil Data Access lookup for a clicked parcel: soil map unit name plus
// the NRCS "Septic Tank Absorption Fields" suitability rating per component.
// Free federal service, no key. Ratings: Not limited / Somewhat limited /
// Very limited — "Very limited" usually means engineered septic or public
// sewer required, which changes lot yield and development cost materially.
export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: 'lat/lon required' }, { status: 400 });
  }

  // lat/lon are validated numbers, so interpolation into SQL here is safe.
  const query = [
    'SELECT TOP 8 mu.muname, c.compname, c.comppct_r, ci.interphrc',
    'FROM mapunit mu',
    'JOIN component c ON c.mukey = mu.mukey',
    "LEFT JOIN cointerp ci ON ci.cokey = c.cokey AND ci.mrulename = 'ENG - Septic Tank Absorption Fields' AND ci.ruledepth = 0",
    `WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon} ${lat})'))`,
    'ORDER BY c.comppct_r DESC',
  ].join(' ');

  try {
    const res = await fetch('https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, format: 'JSON' }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    const rows: string[][] = data?.Table || [];
    if (!rows.length) return Response.json({ soilName: null, components: [], note: 'No USDA soil survey data at this point.' });

    const components = rows
      .filter(r => r[1])
      .map(r => ({ name: r[1], pct: Number(r[2]) || 0, septicRating: r[3] || 'Not rated' }));
    return Response.json({ soilName: rows[0][0], components });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'lookup failed';
    return Response.json({ error: `USDA soil lookup failed: ${message}` }, { status: 502 });
  }
}
