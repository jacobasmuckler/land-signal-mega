import { runOpenAISearch } from '@/lib/openaiRequest';
import { parseCompScope, scopeCenter, describeArea, compScopeLines, type CompScope } from '@/lib/compScope';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Market snapshot for a clicked parcel: census-tract housing stats (hard data)
// plus an optional AI web-search pass for sold $/sqft and typical home size.
// Needs CENSUS_API_KEY (free + instant: api.census.gov/data/key_signup.html).

function acsNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null; // ACS uses big negative sentinels for "no data"
}

async function tractFor(lat: number, lon: number) {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const data = await res.json();
  const t = data?.result?.geographies?.['Census Tracts']?.[0];
  return t ? { state: t.STATE, county: t.COUNTY, tract: t.TRACT, name: t.NAME } : null;
}

async function acsStats(state: string, county: string, tract: string, key: string) {
  const vars = 'NAME,B25077_001E,B19013_001E,B25035_001E,B25003_001E,B25003_002E,B25010_001E';
  const url = `https://api.census.gov/data/2023/acs/acs5?get=${vars}&for=tract:${tract}&in=state:${state}+county:${county}&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'follow' });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  const r = rows?.[1];
  if (!r) return null;
  const total = acsNum(r[4]), owner = acsNum(r[5]);
  return {
    areaName: r[0],
    medianHomeValue: acsNum(r[1]),
    medianHouseholdIncome: acsNum(r[2]),
    medianYearBuilt: acsNum(r[3]),
    ownerOccupiedPct: total && owner ? Math.round((owner / total) * 100) : null,
    avgHouseholdSize: acsNum(r[6]),
  };
}

async function aiMarketLine(address: string | undefined, lat: number, lon: number, scope: CompScope, areaLabel: string | null) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  const where = address || `coordinates ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try {
    return await runOpenAISearch(
      apiKey, model,
      [
        `Using web search, for the residential market around ${where}:`,
        ...compScopeLines(scope, where, areaLabel),
        'Report: the median recent SOLD home price, median sold price per square foot, and typical new-construction home size in sqft — all from inside the comp area above.',
        '5 lines max, each "Label: value (source)". First line restates the comp area/filters used. Only values a source actually shows — write "not found" otherwise.',
      ].join('\n'),
    );
  } catch { return null; }
}

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: 'lat/lon required' }, { status: 400 });
  }

  const censusKey = process.env.CENSUS_API_KEY?.trim();
  // Census stats come from the drawn comp area's center when one exists —
  // "show me the neighborhood next door" means that tract, not the parcel's.
  const scope = parseCompScope(body.compScope);
  const center = scopeCenter(scope, { lat, lon });
  const areaLabel = await describeArea(center.lat, center.lon);
  const [tract, ai] = await Promise.all([
    tractFor(center.lat, center.lon).catch(() => null),
    aiMarketLine(body.address, lat, lon, scope, areaLabel),
  ]);
  const stats = tract && censusKey ? await acsStats(tract.state, tract.county, tract.tract, censusKey).catch(() => null) : null;

  return Response.json({
    tract: tract ? { name: tract.name } : null,
    stats,
    statsUnavailableReason: !censusKey
      ? 'CENSUS_API_KEY not set in Railway — free instant key at api.census.gov/data/key_signup.html'
      : (!tract ? 'census tract lookup failed' : (!stats ? 'no ACS data for this tract' : null)),
    ai,
  });
}
