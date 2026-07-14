import { prisma } from '@/lib/prisma';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export async function POST() {
  await prisma.listing.deleteMany({ where: { source: 'Zillow' } });
  return relativeRedirect('/alerts');
}
