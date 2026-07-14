// Quick check of comp-scope parsing + the prompt lines the AI receives.
// Run: npx tsx scripts/test-comp-scope.ts
import { parseCompScope, compScopeLines, scopeCenter } from '../src/lib/compScope';

// Drawn polygon (a neighborhood NE of the parcel) + new-builds + criteria
const drawn = parseCompScope({
  radiusMiles: 3,
  polygon: [[35.42, -80.83], [35.44, -80.83], [35.44, -80.80], [35.42, -80.80]],
  newOnly: true,
  criteria: '3000+ sqft, same school district',
});
console.log('--- drawn area scope ---');
console.log('center:', scopeCenter(drawn, { lat: 0, lon: 0 }));
console.log(compScopeLines(drawn, '123 Main St, Mecklenburg County NC', 'Davidson, Mecklenburg County, ZIP 28036').join('\n'));

const radius = parseCompScope({ radiusMiles: 1.5, polygon: null, newOnly: false, criteria: '' });
console.log('\n--- radius scope ---');
console.log(compScopeLines(radius, '123 Main St, Mecklenburg County NC', null).join('\n'));

// Garbage in → safe defaults
const junk = parseCompScope({ radiusMiles: 'x', polygon: [[1]], criteria: 42 });
console.log('\n--- junk input ---');
console.log(JSON.stringify(junk));
