export type SupportedSource = 'LandWatch' | 'Crexi' | 'Zillow' | 'Redfin' | 'Realtor' | 'LoopNet' | 'Email Alert';

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
  sourceListingId?: string;
  marketStage: 'Listed' | 'Pre-Market';
};

function cleanText(input: string) {
  const attrs = Array.from(
    input.matchAll(/\s(?:alt|title|aria-label)\s*=\s*["']([^"']+)["']/gi),
    match => match[1]
  ).join(' ');
  return input
    .replace(/^/, `${attrs} `)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&bull;|&#8226;/gi, '\u2022')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
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
  // Land.com Network powers LandWatch / Lands of America — treat all as LandWatch
  if (value.includes('landwatch') || value.includes('land.com') || value.includes('landsofamerica') || value.includes('landandfarm')) return 'LandWatch';
  if (value.includes('realtor')) return 'Realtor';
  if (value.includes('loopnet')) return 'LoopNet';
  return 'Email Alert';
}

// Addresses often lack a leading street number (e.g. "Sumter Hwy., Kingstree, SC")
// and are followed by a county ("..., NC, Polk County"). Capture to the state, drop trailing county.
export function guessAddress(text: string): string | undefined {
  // Drop a leading "$price • N acres " prefix and the "N Property/Properties" count
  // that LandWatch subject lines carry, so neither bleeds into the address.
  const cleaned = cleanText(text)
    .replace(/\b\d+\s+propert(?:y|ies)\b/gi, ' ')
    .replace(/\$[\d,.]+\s*[kKmM]?\s*[\u2022•\-–]?\s*/g, ' ')
    .replace(/[0-9,.]+\s*(?:\+\/-|±)?\s*(?:acres|acre|ac)\b[\s\u2022•\-–]*/gi, ' ')
    .replace(/[.]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const withNumber = /(\d{1,6}\s+[A-Za-z0-9 .#'-]{2,70},?\s+[A-Za-z .'-]{2,40},\s*(?:NC|SC|North Carolina|South Carolina)(?:\s+\d{5}(?:-\d{4})?)?)/i;
  const withoutNumber = /\b([A-Za-z][A-Za-z0-9 .#'-]{2,70},\s+[A-Za-z .'-]{2,40},\s*(?:NC|SC|North Carolina|South Carolina)(?:\s+\d{5}(?:-\d{4})?)?)/i;
  const m = cleaned.match(withNumber) || cleaned.match(withoutNumber);
  if (!m) return undefined;
  // Trim any leading non-address filler up to the first street number or capitalized road word.
  let addr = m[1].replace(/,\s*[A-Za-z .'-]+\s+County\b.*$/i, '').trim();
  return addr;
}


export function guessCounty(text: string): string | undefined {
  const m = text.match(/,\s*([A-Za-z][A-Za-z .'-]{2,30}?)\s+County\b/i);
  return m ? m[1].trim() : undefined;
}

export function detectPrimaryState(text: string): string | undefined {
  const m = text.match(/,\s*(NC|SC|VA|GA|TN|North Carolina|South Carolina)\b/i);
  if (!m) return undefined;
  const v = m[1].toUpperCase();
  if (v.startsWith('NORTH')) return 'NC';
  if (v.startsWith('SOUTH')) return 'SC';
  return v;
}

export function isTargetState(state?: string): boolean {
  return state === 'NC' || state === 'SC';
}

export function detectMarketStage(text: string): 'Listed' | 'Pre-Market' {
  return /\b(?:coming soon|pre[- ]market|off[- ]market|auction|foreclosure|trustee sale|notice of sale|rezoning|assemblage|seeking offers|call for offers|whisper price)\b/i.test(text)
    ? 'Pre-Market'
    : 'Listed';
}

// ── multi-listing digest parsing (LandWatch/Land.com "Saved Searches", Crexi) ──
function extractBlocks(body: string): { url?: string; text: string }[] {
  const blocks: { url?: string; text: string }[] = [];
  const links: string[] = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(body))) {
    const href = m[1];
    if (!/land\.com|landwatch|landsofamerica|crexi\.com\/properties/i.test(href)) continue;
    links.push(href.replace(/[?#].*$/, ''));
    const inner = m[2];
    const alt = inner.match(/alt=["']([^"']+)["']/i)?.[1] || '';
    const text = cleanText(inner + ' ' + alt);
    if (parseAcreage(text)) blocks.push({ url: href.replace(/[?#].*$/, ''), text });
  }

  const fullText = cleanText(body)
    .replace(/\bView Details\b/gi, ' View Details ')
    .replace(/\bUpdate your saved searches\b[\s\S]*$/i, ' ');
  const starts = Array.from(fullText.matchAll(/(?:\b\d+\s+propert(?:y|ies)\s+)?\$[\d,.]+(?:\s*[kKmM])?\s*(?:[\u2022â€¢·\-–]\s*)?[0-9,.]+\s*(?:acres?|acre|ac\b)/gi));
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index ?? 0;
    const end = starts[i + 1]?.index ?? Math.min(fullText.length, start + 700);
    const segment = fullText.slice(start, end).trim();
    if (parseAcreage(segment)) {
      blocks.push({ url: links[i], text: segment });
    }
  }

  const seen = new Set<string>();
  return blocks.filter(block => {
    const key = `${block.url || ''}|${block.text.slice(0, 140)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function crexiId(url?: string): string | undefined {
  const m = url?.match(/crexi\.com\/properties\/(\d+)/i);
  return m ? `Crexi:${m[1]}` : undefined;
}

export function parseListingEmailListings(args: { from?: string; subject?: string; body: string; snippet?: string }): ParsedListing[] {
  const source = guessSource(`${args.from || ''} ${args.subject || ''}`);
  if (!['LandWatch', 'Crexi'].includes(source)) return [];
  const out: ParsedListing[] = [];
  for (const block of extractBlocks(args.body)) {
    const acreage = parseAcreage(block.text);
    if (!acreage) continue;
    const price = parsePrice(block.text);
    const address = guessAddress(block.text);
    out.push({
      source,
      title: address || block.text.slice(0, 80) || `${source} land alert`,
      listingUrl: block.url,
      address,
      state: address ? detectPrimaryState(address) : undefined,
      county: guessCounty(block.text),
      acreage,
      ...price,
      sourceListingId: crexiId(block.url),
      rawSnippet: block.text.slice(0, 500),
      marketStage: detectMarketStage(block.text),
    });
  }
  const seen = new Set<string>();
  return out.filter(l => {
    const k = `${l.listingUrl || ''}|${l.acreage}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
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
    county: guessCounty(combined),
    acreage,
    ...price,
    brokerEmail: parseBrokerEmail(combined),
    brokerPhone: parsePhone(combined),
    rawSnippet: combined.slice(0, 500),
    marketStage: detectMarketStage(combined),
  };
}
