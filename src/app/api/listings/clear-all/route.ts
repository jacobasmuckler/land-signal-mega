import { prisma } from '@/lib/prisma';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export async function POST() {
  await prisma.listing.deleteMany();
  return relativeRedirect('/alerts');
}
