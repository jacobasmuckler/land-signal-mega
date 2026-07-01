import { strict as assert } from 'node:assert';
import { detectMarketStage, guessAddress, parseAcreage, parseListingEmailListings, parsePrice } from '../src/lib/parser';
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

console.log('Self-test passed.');
