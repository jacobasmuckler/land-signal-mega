// Dev utility: run the production parser against a REAL saved .eml alert.
// Usage: npx tsx scripts/test-real-email.ts "C:\path\to\alert.eml"
import { readFileSync } from 'node:fs';
import { parseListingEmailListings } from '../src/lib/parser';

const file = process.argv[2] || 'C:/Users/JacobSmuckler/Downloads/Property Alert - Listings Added_Updated on LandWatch.eml';
const raw = readFileSync(file, 'utf8');

// decode quoted-printable the same way gmail.ts does
function decodeQuotedPrintable(input: string) {
  const src = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(src.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes).toString('utf8');
}

const subjectMatch = raw.match(/^Subject: (.*)$/m);
const fromMatch = raw.match(/^From: (.*)$/m);
const body = decodeQuotedPrintable(raw);

const listings = parseListingEmailListings({
  from: fromMatch?.[1] || 'support@land.com',
  subject: subjectMatch?.[1] || 'Property Alert',
  body,
});

console.log(`\n=== ${listings.length} listings parsed ===\n`);
for (const l of listings) {
  console.log(`- ${l.acreage} ac | ${l.priceText || 'no price'}`);
  console.log(`  address: ${l.address || '!! MISSING'}`);
  console.log(`  county:  ${l.county || '-'}  state: ${l.state || '-'}`);
  console.log(`  url:     ${l.listingUrl || '!! MISSING'}`);
  console.log(`  id:      ${l.sourceListingId || '!! MISSING'}`);
  console.log('');
}
