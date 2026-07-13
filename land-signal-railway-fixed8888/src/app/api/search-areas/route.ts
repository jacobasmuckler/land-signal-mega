export const dynamic = 'force-dynamic';

// Current Census TIGERweb county boundaries. The Parcel Finder uses this to
// discover every county/state touched by a search circle, instead of choosing
// parcel sources from only the center point.
const COUNTY_QUERY = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';

const STATES: Record<string, { name: string; abbr: string }> = {
  '01': { name: 'Alabama', abbr: 'AL' }, '02': { name: 'Alaska', abbr: 'AK' },
  '04': { name: 'Arizona', abbr: 'AZ' }, '05': { name: 'Arkansas', abbr: 'AR' },
  '06': { name: 'California', abbr: 'CA' }, '08': { name: 'Colorado', abbr: 'CO' },
  '09': { name: 'Connecticut', abbr: 'CT' }, '10': { name: 'Delaware', abbr: 'DE' },
  '11': { name: 'District of Columbia', abbr: 'DC' }, '12': { name: 'Florida', abbr: 'FL' },
  '13': { name: 'Georgia', abbr: 'GA' }, '15': { name: 'Hawaii', abbr: 'HI' },
  '16': { name: 'Idaho', abbr: 'ID' }, '17': { name: 'Illinois', abbr: 'IL' },
  '18': { name: 'Indiana', abbr: 'IN' }, '19': { name: 'Iowa', abbr: 'IA' },
  '20': { name: 'Kansas', abbr: 'KS' }, '21': { name: 'Kentucky', abbr: 'KY' },
  '22': { name: 'Louisiana', abbr: 'LA' }, '23': { name: 'Maine', abbr: 'ME' },
  '24': { name: 'Maryland', abbr: 'MD' }, '25': { name: 'Massachusetts', abbr: 'MA' },
  '26': { name: 'Michigan', abbr: 'MI' }, '27': { name: 'Minnesota', abbr: 'MN' },
  '28': { name: 'Mississippi', abbr: 'MS' }, '29': { name: 'Missouri', abbr: 'MO' },
  '30': { name: 'Montana', abbr: 'MT' }, '31': { name: 'Nebraska', abbr: 'NE' },
  '32': { name: 'Nevada', abbr: 'NV' }, '33': { name: 'New Hampshire', abbr: 'NH' },
  '34': { name: 'New Jersey', abbr: 'NJ' }, '35': { name: 'New Mexico', abbr: 'NM' },
  '36': { name: 'New York', abbr: 'NY' }, '37': { name: 'North Carolina', abbr: 'NC' },
  '38': { name: 'North Dakota', abbr: 'ND' }, '39': { name: 'Ohio', abbr: 'OH' },
  '40': { name: 'Oklahoma', abbr: 'OK' }, '41': { name: 'Oregon', abbr: 'OR' },
  '42': { name: 'Pennsylvania', abbr: 'PA' }, '44': { name: 'Rhode Island', abbr: 'RI' },
  '45': { name: 'South Carolina', abbr: 'SC' }, '46': { name: 'South Dakota', abbr: 'SD' },
  '47': { name: 'Tennessee', abbr: 'TN' }, '48': { name: 'Texas', abbr: 'TX' },
  '49': { name: 'Utah', abbr: 'UT' }, '50': { name: 'Vermont', abbr: 'VT' },
  '51': { name: 'Virginia', abbr: 'VA' }, '53': { name: 'Washington', abbr: 'WA' },
  '54': { name: 'West Virginia', abbr: 'WV' }, '55': { name: 'Wisconsin', abbr: 'WI' },
  '56': { name: 'Wyoming', abbr: 'WY' },
};

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const lat = Number(body.lat), lon = Number(body.lon), radiusMiles = Number(body.radiusMiles);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return Response.json({ error: 'lat, lon, and a positive radiusMiles are required' }, { status: 400 });
  }

  const params = new URLSearchParams({
    where: '1=1', geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    distance: String(Math.min(radiusMiles, 500) * 1609.344), units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'BASENAME,NAME,STATE,GEOID',
    returnGeometry: 'false', resultRecordCount: '500', f: 'json',
  });

  try {
    const response = await fetch(`${COUNTY_QUERY}?${params}`, { signal: AbortSignal.timeout(15_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error?.message || `HTTP ${response.status}`);
    const seen = new Set<string>();
    const areas = (data.features || []).flatMap((feature: any) => {
      const a = feature.attributes || {};
      const state = STATES[String(a.STATE).padStart(2, '0')];
      const county = String(a.BASENAME || a.NAME || '').replace(/\s+County$/i, '').trim();
      if (!state || !county) return [];
      const key = `${state.abbr}|${county.toLowerCase()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ state: state.name, stateAbbr: state.abbr, county, geoid: String(a.GEOID || '') }];
    });
    return Response.json({ areas });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'county lookup failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
