// AI-powered utility due-diligence for a single parcel or listing. Pulling
// utility GIS for every parcel in the country is not feasible — so this runs
// on demand, per parcel, when someone clicks "Research utilities".
import { runOpenAISearch } from './openaiRequest';

export type ParcelInfo = {
  title?: string | null;
  address?: string | null;
  county?: string | null;
  state?: string | null;
  acreage?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  listingUrl?: string | null;
  owner?: string | null;
  parcelId?: string | null;
  zoning?: string | null;
};

function compact(value?: string | number | null) {
  return String(value ?? '').replace(/\s+/g, ' ').trim() || 'Unknown';
}

// Nominatim returns "Gaston County" while listing rows store just "Gaston" —
// normalize so we never produce "Gaston County County".
function countyName(value?: string | null) {
  const c = compact(value);
  return c === 'Unknown' ? c : c.replace(/\s+county$/i, '') + ' County';
}

export async function runUtilityResearch(info: ParcelInfo, mode: 'utilities' | 'full' = 'utilities'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return [
      'Research requested, but OPENAI_API_KEY is not configured in Railway yet.',
      '',
      'Next step: add OPENAI_API_KEY in Railway Variables, redeploy, then click the button again.',
      `Parcel searched: ${compact(info.address || info.title)}, ${countyName(info.county)}`,
    ].join('\n');
  }

  const model = process.env.OPENAI_UTILITY_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  const focus = mode === 'full'
    ? [
      'You are a commercial land due-diligence assistant.',
      'Research this parcel using web search and produce a due-diligence brief covering:',
      '1. Zoning: current zoning designation, what it likely permits (residential density, commercial, agricultural), and the county/city planning department to confirm with.',
      '2. Schools: the assigned public school district plus nearby elementary/middle/high schools.',
      '3. Comps: recent (last ~3 years) comparable LAND sales nearby — similar acreage vacant/rural land, with price and $/acre where a public source shows it. If none found, say so plainly.',
      '4. Utilities: one short paragraph on public water/sewer likelihood and the electric provider.',
      'Never invent sale prices or zoning codes — only report what a source shows, with confidence levels and source links.',
    ]
    : [
      'You are a commercial land due-diligence assistant.',
      'Research public utility availability for this parcel using web search.',
      'Focus on public sewer, public water, water/sewer service area, electric provider, gas provider, hydrants, nearby utility GIS, and county/city utility departments.',
      'Do not invent exact pipe distances unless a public GIS source clearly shows it.',
      'Return a practical report for a land acquisitions team with confidence levels and source links.',
    ];
  const prompt = [
    ...focus,
    '',
    'Parcel:',
    `Title: ${compact(info.title)}`,
    `Address: ${compact(info.address)}`,
    `County: ${countyName(info.county)}`,
    `State: ${compact(info.state)}`,
    `Acres: ${info.acreage ?? 'Unknown'}`,
    `Latitude: ${info.latitude ?? 'Unknown'}`,
    `Longitude: ${info.longitude ?? 'Unknown'}`,
    `Parcel ID: ${compact(info.parcelId)}`,
    `Zoning: ${compact(info.zoning)}`,
    `Owner: ${compact(info.owner)}`,
    `Listing URL: ${compact(info.listingUrl)}`,
    '',
    'Format:',
    ...(mode === 'full'
      ? ['1. Zoning', '2. Schools', '3. Comparable land sales', '4. Utilities snapshot', '5. What to verify by phone', '6. Source links']
      : ['1. Utility summary', '2. Public water evidence', '3. Public sewer evidence', '4. Electric / gas notes', '5. What to verify by phone', '6. Source links']),
    'Keep it concise but useful.',
  ].join('\n');

  return runOpenAISearch(apiKey, model, prompt);
}
