import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/passwords';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return Response.json({ error: 'Wrong email or password.' }, { status: 401 });
  }

  const token = await createSessionToken(user.id, user.name);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    },
  });
}
