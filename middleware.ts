import { runScan } from '../src/lib/scanner';
import { sendWeeklyDigest } from '../src/lib/weeklyDigest';

const MAX_RUNTIME_MS = 4 * 60 * 1000;

const timeout = setTimeout(() => {
  console.error('Scheduled scan stopped before Railway timeout. Use the dashboard backfill button for older emails.');
  process.exit(1);
}, MAX_RUNTIME_MS);

async function main() {
  const result = await runScan({
    maxResults: 25,
    expandThreads: true,
    sendAlerts: false,
    notePrefix: 'Finished scheduled thread scan',
  });
  console.log('Scheduled scan complete:', result);

  // Weekly recap: internally gated to Monday >= 9am ET, once per day, so it is
  // safe to call on every scheduled run — no separate cron service needed.
  try {
    const digest = await sendWeeklyDigest();
    console.log('Weekly digest:', digest);
  } catch (err) {
    console.error('Weekly digest failed (scan still succeeded):', err);
  }
}

main()
  .then(() => { clearTimeout(timeout); process.exit(0); })
  .catch(err => {
    clearTimeout(timeout);
    console.error('Scheduled scan failed:', err);
    process.exit(1);
  });
