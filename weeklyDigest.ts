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

  const stats = await censusStats(lat, lon);
  const model = process.env.OPENAI_UTILITY_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  const where = body.address ? `${body.address}, ${body.county || ''} ${body.state || 'NC'}` : `coordinates ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  const prompt = [
    'You are a land-acquisition analyst for a company that buys raw land and resells it to homebuilders/developers in the Charlotte NC region.',
    'Produce a DEAL SCREEN with a maximum-offer estimate using residual land valuation. Use web search for sold comps and local development costs.',
    '',
    `Parcel: ${where} — ${acres} acres.${body.zoning ? ` Zoning code on record: ${body.zoning}.` : ' Zoning unknown — research or assume typical for the area and SAY SO.'}${body.owner ? ` Owner of record: ${body.owner}.` : ''}`,
    stats ? `Census tract data (authoritative — use these): median home value $${stats.medianHomeValue?.toLocaleString() ?? 'n/a'}, median household income $${stats.medianIncome?.toLocaleString() ?? 'n/a'}, median year built ${stats.medianYearBuilt ?? 'n/a'} (${stats.area}).` : 'No census data available — rely on web search.',
    '',
    'Method — show the numbers at every step and label every assumption as an assumption:',
    '1. LOT YIELD: density from zoning (or stated assumption, typically 2-4 lots/acre suburban single-family) × acres, minus 20-25% for roads/stormwater. Note floodplain/terrain risk if likely.',
    '2. FINISHED HOME VALUE: median NEW-construction sold price and $/sqft within ~3 miles (web search; else adjust the census median home value upward for new construction).',
    '3. FINISHED LOT VALUE: 20-25% of finished home price.',
    '4. DEVELOPMENT COST per lot: research or assume (typical $40k-70k/lot with public sewer; if sewer is unlikely, switch to septic math — fewer, larger lots — and say so).',
    '5. RAW LAND VALUE to a developer: (finished lot value − dev cost) × lots × ~50-60% discount for time/risk/profit.',
    '6. MAX OFFER for a land flipper: buy at 60-75% of the developer raw-land value.',
    '',
    'Output format (under 400 words):',
    '**Verdict**: PURSUE / MAYBE / PASS — one sentence why.',
    '**Max offer range**: $low - $high total (and per acre).',
    '**The math**: steps 1-6 compactly, one line each, with the numbers used.',
    '**Key swing factors**: sewer, floodplain, zoning risk — the things that move the number most.',
    '**Verify before bidding**: 3-4 specific phone calls.',
    '**Confidence**: high/medium/low and why.',
  ].join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, tools: [{ type: 'web_search' }], input: prompt }),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    let report = '';
    if (typeof data?.output_text === 'string') report = data.output_text.trim();
    if (!report) {
      const pieces: string[] = [];
      for (const item of data?.output || []) for (const part of item?.content || []) if (typeof part?.text === 'string') pieces.push(part.text);
      report = pieces.join('\n').trim();
    }
    return Response.json({ report: report || 'Analysis ran but returned no text — try again.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'analysis failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
