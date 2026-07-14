import { prisma } from '@/lib/prisma';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { id: string } }) {
  const form = await request.formData();
  const action = String(form.get('action') || 'review');
  const rt = String(form.get('redirectTo') || '/alerts');
  const redirectTo = rt.startsWith('/') ? rt : '/alerts';

  if (action === 'delete') {
    await prisma.listing.delete({ where: { id: context.params.id } });
    return relativeRedirect(redirectTo);
  }

  // review: flag good + save note
  const isGood = form.get('isGood') === 'on';
  const notes = String(form.get('notes') || '').trim();
  await prisma.listing.update({
    where: { id: context.params.id },
    data: { status: isGood ? 'Good' : 'New', notes: notes || null },
  });
  return relativeRedirect(redirectTo);
}
