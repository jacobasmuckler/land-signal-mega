import { runScan } from '@/lib/scanner';
import { relativeRedirect } from '@/lib/redirect';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Manual backfill: sweep older LandWatch / Land.com email (thread-expanded).
// Runs in the background — holding the request open froze the page and hit
// Railway's proxy timeout ("upstream error").
export async function POST() {
  runScan({
    query: '(from:crexi OR from:landwatch OR from:land.com OR from:support@land.com OR from:landsofamerica OR from:landandfarm OR from:landandfarm.com) -subject:"weekly report" -subject:"daily report" -subject:recap',
    maxResults: 20,
    sendAlerts: false,
    notePrefix: 'Finished small backfill batch',
    expandThreads: true,
  }).catch(async error => {
    const message = error instanceof Error ? error.message : 'Backfill failed';
    await prisma.scanLog.create({
      data: { finishedAt: new Date(), notes: `Backfill failed: ${message}` },
    }).catch(() => {});
  });
  return relativeRedirect('/alerts?scan=started');
}
