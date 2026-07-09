import { strict as assert } from 'node:assert';
import { detectMarketStage, guessAddress, landwatchId, locationFromUrl, parseAcreage, parseListingEmailListings, parsePrice, unwrapUrl } from '../src/lib/parser';
import { haversineMiles } from '../src/lib/distance';

assert.equal(parseAcreage('Lot size: 24.75 acres'), 24.75);
assert.equal(parseAcreage('± 125 AC'), 125);
assert.equal(parsePrice('Offered at $2.5M').price, 2_500_000);
assert.equal(detectMarketStage('Broker teaser: coming soon'), 'Pre-Market');
assert.equal(detectMarketStage('New listing now available'), 'Listed');
assert.equal(guessAddress('Land at 123 Main Street, Rock Hill, SC 29730'), '123 Main Street, Rock Hill, SC 29730');
const landwatchDigest = parseListingEmailListings({
  from: 'The Land.com Network <support@land.com>',
  subject: 'Property Alert - Listings Added/Updated on LandWatch',
  body: `
    $209,000 • 21.5 acres 1960 Rich Mountain Road, Morganton, NC, Burke County View Details
    $495,000 • 108 acres TBD Dallas Rd, Lumberton, NC, Robeson County View Details
    $439,900 • 51.5 acres Tract 5 Dover Church Road, Seagrove, NC, Moore County View Details
  `,
});
assert.equal(landwatchDigest.length, 3);
assert.equal(landwatchDigest[0].acreage, 21.5);
assert.equal(landwatchDigest[1].address, 'TBD Dallas Rd, Lumberton, NC');
assert.ok(haversineMiles(35.2271, -80.8431, 35.2271, -80.8431) < 0.001);

// ── tracking-link unwrapping (LandWatch emails wrap every link in Mandrill) ──
const realUrl = 'https://www.landwatch.com/columbus-county-north-carolina-land-for-sale/pid/419115000';
const mandrillPayload = Buffer.from(JSON.stringify({ xt: 'x', p: JSON.stringify({ url: realUrl, id: '1' }) }), 'utf8')
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mandrillUrl = `https://mandrillapp.com/track/click/31059310/www.landwatch.com?p=${mandrillPayload}`;
assert.equal(unwrapUrl(mandrillUrl), realUrl);
assert.equal(unwrapUrl('https://example.com/redirect?url=https%3A%2F%2Fwww.landwatch.com%2Fpid%2F123'), 'https://www.landwatch.com/pid/123');
assert.equal(unwrapUrl(realUrl), realUrl); // plain URLs pass through untouched

// ── location + id from the listing URL ──
assert.deepEqual(locationFromUrl(realUrl), { address: 'Columbus County, NC', county: 'Columbus', state: 'NC' });
assert.deepEqual(locationFromUrl('https://www.landwatch.com/pageland-south-carolina-farms-and-ranches-for-sale/pid/5'), { address: 'Pageland, SC', state: 'SC' });
assert.equal(landwatchId(realUrl), 'LandWatch:419115000');

// ── digest with Mandrill-wrapped anchors still yields listings with real URLs ──
const wrapped = parseListingEmailListings({
  from: 'LandWatch <support@land.com>',
  subject: 'Property Alert - Listings Added/Updated on LandWatch',
  body: `<a href="${mandrillUrl}"><img alt="$350,000 • 45 acres Old Mill Rd, Whiteville, NC, Columbus County" src="x.jpg"></a>`,
});
assert.equal(wrapped.length, 1);
assert.equal(wrapped[0].listingUrl, realUrl);
assert.equal(wrapped[0].acreage, 45);
assert.equal(wrapped[0].sourceListingId, 'LandWatch:419115000');
assert.ok(wrapped[0].address?.includes('Whiteville'));

// ── URL-slug fallback fills the address when the email text has none ──
const noAddress = parseListingEmailListings({
  from: 'LandWatch <support@land.com>',
  subject: 'Property Alert',
  body: `<a href="${mandrillUrl}"><img alt="$99,000 • 30 acres of beautiful timberland" src="x.jpg"></a>`,
});
assert.equal(noAddress.length, 1);
assert.equal(noAddress[0].address, 'Columbus County, NC');
assert.equal(noAddress[0].county, 'Columbus');

console.log('Self-test passed.');
