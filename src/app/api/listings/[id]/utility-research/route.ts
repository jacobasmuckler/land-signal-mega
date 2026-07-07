import { prisma } from '@/lib/prisma';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

function compact(value?: string | null) {
  return value?.replace(/\s+/g, ' ').trim() || 'Unknown';
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

async function runOpenAIUtilityResearch(listing: any) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return [
      'Utility research requested, but OPENAI_API_KEY is not configured in Railway yet.',
      '',
      'Next step: add OPENAI_API_KEY in Railway Variables, redeploy, then click Research utilities again.',
      `Parcel searched: ${compact(listing.address || listing.title)} ${compact(listing.county)} County`,
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
    `Title: ${compact(listing.title)}`,
    `Address: ${compact(listing.address)}`,
    `County: ${compact(listing.county)}`,
    `State: ${compact(listing.state)}`,
    `Acres: ${listing.acreage ?? 'Unknown'}`,
    `Latitude: ${listing.latitude ?? 'Unknown'}`,
    `Longitude: ${listing.longitude ?? 'Unknown'}`,
    `Listing URL: ${compact(listing.listingUrl)}`,
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
    signal: AbortSignal.timeout(35_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return extractText(data) || 'Utility research completed, but no text report was returned.';
}

export async function POST(request: Request, context: { params: { id: string } }) {
  let redirectTo = '/saved';
  try {
    const form = await request.formData();
    const rt = String(form.get('redirectTo') || '/saved');
    redirectTo = rt.startsWith('/') ? rt : '/saved';
  } catch {
    redirectTo = '/alerts';
  }

  const listing = await prisma.listing.findUnique({ where: { id: context.params.id } });
  if (!listing) return relativeRedirect(redirectTo);

  let report: string;
  try {
    report = await runOpenAIUtilityResearch(listing);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Utility research failed';
    report = `Utility research failed: ${message}`;
  }

  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const utilityBlock = [
    `\n\n--- Utility Research (${stamp}) ---`,
    report,
  ].join('\n');

  try {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        notes: `${listing.notes || ''}${utilityBlock}`.trim(),
      },
    });
  } catch (error) {
    console.error('Could not save utility research note:', error);
  }

  return relativeRedirect(redirectTo);
}
