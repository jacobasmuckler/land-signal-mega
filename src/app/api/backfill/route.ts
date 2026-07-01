import { runScan } from '@/lib/scanner';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

// Manual backfill: sweep ALL past LandWatch / Land.com / Lands of America emails.
// Wide date range, only those senders, up to the 500-email cap.
export async function POST() {
  await runScan({
    query: 'newer_than:2y (from:landwatch OR from:land.com OR from:landsofamerica OR from:landandfarm)',
    maxResults: 500,
  });
  return relativeRedirect('/alerts');
}
