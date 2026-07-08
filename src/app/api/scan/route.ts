import { runScan } from '@/lib/scanner';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

// Kick the scan off in the background and send the browser straight back to
// the dashboard. Holding the request open for a multi-minute scan is what
// caused Railway's proxy to time out with "upstream error".
export async function POST() {
  runScan().catch(error => console.error('Manual scan failed:', error));
  return relativeRedirect('/alerts?scan=started');
}
