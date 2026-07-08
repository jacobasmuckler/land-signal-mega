// Dev utility: geocode real parsed addresses back-to-back, exactly like a scan
// does, to prove the throttle + fallback chain works under burst conditions.
import { geocodeAddress } from '../src/lib/geocode';

const ADDRESSES = [
  '2715 Moose Lodge Street, Valdese, NC',
  'Lot#WP001, Tabor City, NC',
  '214 Ballard Creek Road, Fairview, NC',
  '223 Church Street Extension, Reidsville, NC',
  '1050 Mcqueen Road, Patrick, SC',
  'Farmhouse Lane, Hartsville, SC',
  'Timmonsville Hwy, Florence, SC',
  'Columbus County, NC',
];

(async () => {
  let ok = 0;
  const t0 = Date.now();
  for (const address of ADDRESSES) {
    const result = await geocodeAddress(address);
    console.log(result ? `OK   ${address}  ->  ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}` : `FAIL ${address}`);
    if (result) ok++;
  }
  console.log(`\n${ok}/${ADDRESSES.length} geocoded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
