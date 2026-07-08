// AI-powered utility due-diligence for a single parcel or listing. Pulling
// utility GIS for every parcel in the country is not feasible — so this runs
// on demand, per parcel, when someone clicks "Research utilities".

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

function extractText(data: any): string | undefined {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const pieces: string[] = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') pieces.push(part.text);
    }
  }
  return pieces.join('\n').trim() || undefined;
}

export async function runUtilityResearch(info: ParcelInfo): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return [
      'Utility research requested, but OPENAI_API_KEY is not configured in Railway yet.',
      '',
      'Next step: add OPENAI_API_KEY in Railway Variables, redeploy, then click Research utilities again.',
      `Parcel searched: ${compact(info.address || info.title)}, ${countyName(info.county)}`,
    ].join('\n');
  }

  const model = process.env.OPENAI_UTILITY_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  const prompt = [
    'You are a commercial land due-diligence assistant.',
    'Research public utility availability for this parcel using web search.',
    'Focus on public sewer, public water, water/sewer service area, electric provider, gas provider, hydrants, nearby utility GIS, and county/city utility departments.',
    'Do not invent exact pipe distances unless a public GIS source clearly shows it.',
    'Return a practical report for a land acquisitions team with confidence levels and source links.',
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
    '1. Utility summary',
    '2. Public water evidence',
    '3. Public sewer evidence',
    '4. Electric / gas notes',
    '5. What to verify by phone',
    '6. Source links',
    'Keep it concise but useful.',
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search' }],
      input: prompt,
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return extractText(data) || 'Utility research completed, but no text report was returned.';
}
