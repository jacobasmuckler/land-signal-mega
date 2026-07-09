// Dev utility: verify the UTM projection + DXF writer used for CAD exports.
import { strict as assert } from 'node:assert';
import { toUTM, utmZone, ringsToDXF } from '../src/components/parcelExport';

// Longitude -81 is the exact central meridian of UTM zone 17 → easting must be
// exactly 500,000 m, and northing ≈ meridian arc * k0 (≈ 3,873,200 m at 35°N).
assert.equal(utmZone(-81), 17);
const p = toUTM(-81, 35, 17);
assert.ok(Math.abs(p.x - 500000) < 0.01, `easting ${p.x} should be 500000`);
assert.ok(p.y > 3870000 && p.y < 3880000, `northing ${p.y} out of range`);

// A 1-mile east-west step at 35°N should measure ~1609 m in UTM.
const east = toUTM(-80.98237, 35, 17); // ~1 mile east of -81 at 35N
const dx = east.x - p.x;
assert.ok(Math.abs(dx - 1602) < 15, `1-mile step measured ${dx.toFixed(1)} m`);

// DXF structure: polyline per ring, vertices, EOF.
const rings = [[[-81, 35], [-81, 35.001], [-80.999, 35.001], [-81, 35]]];
const { dxf, zone } = ringsToDXF(rings);
assert.equal(zone, 17);
assert.ok(dxf.includes('POLYLINE') && dxf.includes('VERTEX') && dxf.trim().endsWith('EOF'));
assert.equal((dxf.match(/VERTEX/g) || []).length, 4);
assert.ok(dxf.includes('500000.000'), 'central-meridian vertex should be at easting 500000');

console.log('Export self-test passed. Sample northing:', p.y.toFixed(1));
