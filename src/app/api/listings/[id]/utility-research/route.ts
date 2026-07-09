import { prisma } from '@/lib/prisma';
import { relativeRedirect } from '@/lib/redirect';
import { runUtilityResearch } from '@/lib/utilityResearch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, context: { params: { id: string } }) {
  let redirectTo = '/saved';
  try {
    const form = await request.formData();
    const rt = String(form.get('redirectTo') || '/saved');
    redirectTo = rt.startsWith('/') ? rt : '/saved';
  } catch {
    redirectTo = '/alerts';
  }

  const listing = await prisma.listing.findUnique({ where: { id: context.params.id } });
  if (!listing) return relativeRedirect(redirectTo);

  let report: string;
  try {
    report = await runUtilityResearch(listing);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Utility research failed';
    report = `Utility research failed: ${message}`;
  }

  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const utilityBlock = [
    `\n\n--- Utility Research (${stamp}) ---`,
    report,
  ].join('\n');

  try {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        notes: `${listing.notes || ''}${utilityBlock}`.trim(),
      },
    });
  } catch (error) {
    console.error('Could not save utility research note:', error);
  }

  return relativeRedirect(redirectTo);
}
