import { runScan } from '../src/lib/scanner';

runScan()
  .then(result => { console.log('Scan complete:', result); process.exit(0); })
  .catch(err => { console.error('Scan failed:', err); process.exit(1); });
