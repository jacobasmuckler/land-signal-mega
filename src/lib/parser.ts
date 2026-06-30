export type ParsedListing = {
  source: string;
  title: string;
  listingUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  county?: string;
  acreage?: number;
  price?: number;
  priceText?: string;
  brokerName?: string;
  brokerPhone?: string;
  brokerEmail?: string;
  rawSnippet?: string;
  marketStage: 'Listed' | 'Pre-Market';
};

function cleanText(input: string) {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAcreage(text: string): number | undefined {
  const patterns = [
    /(?:lot size|land size|site size|acreage)[:\s]*([0-9,.]+)\s*(?:\+\/-|±)?\s*(?:acres|acre|ac\b)/i,
    /(?:\+\/-|±)?\s*([0-9,.]+)\s*(?:acres|acre|ac\b)/i,
    /([0-9,.]+)\s*-\s*acre/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1].replace(/,/g, ''));
  }
  return undefined;
}

export function parsePrice(text: string): { price?: number; priceText?: string } {
  if (/call for pricing|unpriced|price upon request/i.test(text)) {
    return { priceText: 'Unpriced / Call for pricing' };
  }
  const match = text.match(/\$\s*([0-9,.]+)\s*([kKmM])?/);
  if (!match) return {};
  let price = Number(match[1].replace(/,/g, ''));
  if (match[2]?.toLowerCase() === 'k') price *= 1_000;
  if (match[2]?.toLowerCase() === 'm') price *= 1_000_000;
  return { price, priceText: `$${Math.round(price).toLocaleString()}` };
}

export function parseUrl(text: string): string | undefined {
  const urls = text.match(/https?:\/\/[^\s"'<>]+/gi);
  return urls?.[0]?.replace(/[),.;]+$/, '');
}

export function parseBrokerEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

export function parsePhone(text: string): string | undefined {
  return text.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0];
}

export function guessSource(fromOrSubject: string): string {
  const value = fromOrSubject.toLowerCase();
  if (value.includes('crexi')) return 'Crexi';
  if (value.includes('zillow')) return 'Zillow';
  if (value.includes('redfin')) return 'Redfin';
  if (value.includes('landwatch')) return 'LandWatch';
  if (value.includes('realtor')) return 'Realtor';
  if (value.includes('loopnet')) return 'LoopNet';
  return 'Email Alert';
}

export function guessAddress(text: string): string | undefined {
  const cleaned = cleanText(text);
  const pattern = /(\d{1,6}\s+[A-Za-z0-9 .#'-]{2,70},?\s+[A-Za-z .'-]{2,40},\s*(?:NC|SC|North Carolina|South Carolina)(?:\s+\d{5}(?:-\d{4})?)?)/i;
  return cleaned.match(pattern)?.[1]?.trim();
}

export function detectMarketStage(text: string): 'Listed' | 'Pre-Market' {
  return /\b(?:coming soon|pre[- ]market|off[- ]market|auction|foreclosure|trustee sale|notice of sale|rezoning|assemblage|seeking offers|call for offers|whisper price)\b/i.test(text)
    ? 'Pre-Market'
    : 'Listed';
}

export function parseListingEmail(args: {
  from?: string;
  subject?: string;
  body: string;
  snippet?: string;
}): ParsedListing | null {
  const combined = cleanText(`${args.subject || ''} ${args.snippet || ''} ${args.body || ''}`);
  const acreage = parseAcreage(combined);
  if (!acreage) return null;
  const price = parsePrice(combined);
  const title = (args.subject || combined.slice(0, 80) || 'Untitled Listing').trim();
  return {
    source: guessSource(`${args.from || ''} ${args.subject || ''}`),
    title,
    listingUrl: parseUrl(args.body) || parseUrl(combined),
    address: guessAddress(combined),
    acreage,
    ...price,
    brokerEmail: parseBrokerEmail(combined),
    brokerPhone: parsePhone(combined),
    rawSnippet: combined.slice(0, 500),
    marketStage: detectMarketStage(combined),
  };
}
