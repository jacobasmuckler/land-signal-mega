import { strict as assert } from 'node:assert';
import { detectMarketStage, guessAddress, parseAcreage, parsePrice } from '../src/lib/parser';
import { haversineMiles } from '../src/lib/distance';

assert.equal(parseAcreage('Lot size: 24.75 acres'), 24.75);
assert.equal(parseAcreage('± 125 AC'), 125);
assert.equal(parsePrice('Offered at $2.5M').price, 2_500_000);
assert.equal(detectMarketStage('Broker teaser: coming soon'), 'Pre-Market');
assert.equal(detectMarketStage('New listing now available'), 'Listed');
assert.equal(guessAddress('Land at 123 Main Street, Rock Hill, SC 29730'), '123 Main Street, Rock Hill, SC 29730');
assert.ok(haversineMiles(35.2271, -80.8431, 35.2271, -80.8431) < 0.001);

console.log('Self-test passed.');
