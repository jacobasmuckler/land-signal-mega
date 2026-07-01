import { runScan } from '@/lib/scanner';
import { relativeRedirect } from '@/lib/redirect';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Manual backfill: sweep ALL past LandWatch / Land.com / Lands of America email
// (no date limit — grabs the entire history from those senders, up to the 500 cap).
export async function POST() {
  try {
    await runScan({
      query: '(from:crexi OR from:landwatch OR from:land.com OR from:support@land.com OR from:landsofamerica OR from:landandfarm OR from:landandfarm.com) -subject:"weekly report" -subject:"daily report" -subject:recap',
      maxResults: 200,
      sendAlerts: false,
      notePrefix: 'Finished backfill',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backfill failed';
    await prisma.scanLog.create({
      data: {
        finishedAt: new Date(),
        notes: `Backfill failed: ${message}`,
      },
    });
  }
  return relativeRedirect('/alerts');
}
