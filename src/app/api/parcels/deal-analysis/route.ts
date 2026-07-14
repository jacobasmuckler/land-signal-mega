import { runOpenAISearch } from '@/lib/openaiRequest';
import { parseCompScope, scopeCenter, describeArea, compScopeLines } from '@/lib/compScope';
import { compDataLines } from '@/lib/statsSources';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 💰 Deal analysis: residual land valuation for the buy-raw-land → flip-to-
// builder play. Gathers census-tract housing data, then has the AI (with web
// search) walk the residual math: lot yield → finished home value → finished
// lot value (20-25% rule) → dev costs → raw land value → max offer range.
// A SCREENING tool — assumptions are labeled, not an appraisal.

function acsNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function censusStats(lat: number, lon: number) {
  try {
    const geoRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const t = (await geoRes.json())?.result?.geographies?.['Census Tracts']?.[0];
    const key = process.env.CENSUS_API_KEY?.trim();
    if (!t || !key) return null;
    const vars = 'NAME,B25077_001E,B19013_001E,B25035_001E';
    const acsRes = await fetch(
      `https://api.census.gov/data/2023/acs/acs5?get=${vars}&for=tract:${t.TRACT}&in=state:${t.STATE}+county:${t.COUNTY}&key=${key}`,
      { signal: AbortSignal.timeout(10_000), redirect: 'follow' },
    );
    if (!acsRes.ok) return null;
    const r = (await acsRes.json().catch(() => null))?.[1];
    if (!r) return null;
    return { area: r[0], medianHomeValue: acsNum(r[1]), medianIncome: acsNum(r[2]), medianYearBuilt: acsNum(r[3]) };
  } catch { return null; }
}

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const lat = Number(body.lat), lon = Number(body.lon);
  const acres = Number(body.acres);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(acres) || acres <= 0) {
    return Response.json({ error: 'lat/lon/acres required' }, { status: 400 });
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ report: 'Deal analysis needs OPENAI_API_KEY in Railway (same key the utility research uses).' });
  }

  // Comp scope: user-drawn area / radius / filters. Census stats are sampled
  // at the drawn area's center when one exists — "compare to the neighborhood
  // next door" means THAT neighborhood's tract, not the parcel's.
  const scope = parseCompScope(body.compScope);
  const center = scopeCenter(scope, { lat, lon });
  const [stats, areaLabel] = await Promise.all([censusStats(center.lat, center.lon), describeArea(center.lat, center.lon)]);
  const model = process.env.OPENAI_UTILITY_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  const where = body.address ? `${body.address}, ${body.county || ''} ${body.state || 'NC'}` : `coordinates ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  const prompt = [
    'You are a land-acquisition analyst for a company that buys raw land and resells it to homebuilders/developers in the Charlotte NC region.',
    'Produce a DEAL SCREEN with a maximum-offer estimate using residual land valuation. Use web search for sold comps and local development costs.',
    '',
    `Parcel: ${where} — ${acres} acres.${body.zoning ? ` Zoning code on record: ${body.zoning}.` : ' Zoning unknown — research or assume typical for the area and SAY SO.'}${body.owner ? ` Owner of record: ${body.owner}.` : ''}`,
    stats ? `Census tract data for the comp area (authoritative — use these): median home value $${stats.medianHomeValue?.toLocaleString() ?? 'n/a'}, median household income $${stats.medianIncome?.toLocaleString() ?? 'n/a'}, median year built ${stats.medianYearBuilt ?? 'n/a'} (${stats.area}).` : 'No census data available — rely on web search.',
    '',
    ...compDataLines(body.compData),
    '',
    ...compScopeLines(scope, where, areaLabel),
    '',
    'Method — show the numbers at every step and label every assumption as an assumption:',
    '1. LOT YIELD: density from zoning (or stated assumption, typically 2-4 lots/acre suburban single-family) × acres, minus 20-25% for roads/stormwater. Note floodplain/terrain risk if likely.',
    '2. FINISHED HOME VALUE: if VERIFIED COUNTY RECORDS are provided above, use their median new-construction sold price and $/sqft directly — that IS the comp data from inside the user\'s area. Otherwise web-search sold comps (else adjust the census median home value upward for new construction and say so).',
    '3. FINISHED LOT VALUE: 20-25% of finished home price.',
    '4. DEVELOPMENT COST per lot: research or assume (typical $40k-70k/lot with public sewer; if sewer is unlikely, switch to septic math — fewer, larger lots — and say so).',
    '5. RAW LAND VALUE to a developer: (finished lot value − dev cost) × lots × ~50-60% discount for time/risk/profit.',
    '6. MAX OFFER for a land flipper: buy at 60-75% of the developer raw-land value.',
    '',
    'Output format (under 400 words):',
    '**Comp area used**: one line restating the boundary/radius and any comp filters you were given above, so the reader knows the scope.',
    '**Verdict**: PURSUE / MAYBE / PASS — one sentence why.',
    '**Max offer range**: $low - $high total (and per acre).',
    '**The math**: steps 1-6 compactly, one line each, with the numbers used.',
    '**Key swing factors**: sewer, floodplain, zoning risk — the things that move the number most.',
    '**Verify before bidding**: 3-4 specific phone calls.',
    '**Confidence**: high/medium/low and why.',
    '',
    'HARD CONSISTENCY RULES — violating any of these makes the report worthless:',
    '- The **Max offer range** header MUST be derived from your own step-6 number (a tight band around it, e.g. ±20%). Never state a headline range that contradicts your math.',
    '- Re-check every multiplication before writing it. Do not round $827k to $1M — write the real number.',
    '- Per-acre figure must equal total ÷ acres.',
    '- If the step-5 margin (finished lot value minus dev cost) is under ~$15k/lot, the deal is razor-thin: verdict must be PASS or MAYBE with that risk stated first, never a confident number.',
    '- If steps conflict or data is missing, say so and lower confidence — never paper over it.',
  ].join('\n');

  try {
    const report = await runOpenAISearch(apiKey, model, prompt);
    return Response.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'analysis failed';
    return Response.json({ error: `${message} — this was likely a one-off OpenAI hiccup (we already retried automatically); try the button again.` }, { status: 502 });
  }
}
