import { runScan } from './src/lib/scanner';

const MAX_RUNTIME_MS = 4 * 60 * 1000;

const timeout = setTimeout(() => {
  console.error('Scheduled scan stopped before Railway timeout. Use the dashboard backfill button for older emails.');
  process.exit(1);
}, MAX_RUNTIME_MS);

runScan({
  maxResults: 15,
  expandThreads: false,
  sendAlerts: false,
  notePrefix: 'Finished scheduled scan',
})
  .then(result => {
    clearTimeout(timeout);
    console.log('Scheduled scan complete:', result);
    process.exit(0);
  })
  .catch(err => {
    clearTimeout(timeout);
    console.error('Scheduled scan failed:', err);
    process.exit(1);
  });
