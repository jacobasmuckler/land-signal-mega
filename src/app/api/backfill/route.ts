import { runScan } from '@/lib/scanner';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

// Manual backfill: sweep ALL past LandWatch / Land.com / Lands of America email
// (no date limit — grabs the entire history from those senders, up to the 500 cap).
export async function POST() {
  await runScan({
    query: '(from:crexi OR from:landwatch OR from:land.com OR from:landsofamerica OR from:landandfarm OR from:support@land.com) -subject:"weekly report" -subject:"daily report" -subject:recap',
    maxResults: 500,
  });
  return relativeRedirect('/alerts');
}
