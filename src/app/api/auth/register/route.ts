import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/passwords';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Signup requires the team code (TEAM_INVITE_CODE or TEAM_PASSWORD) so only
// company people can create accounts on the public URL.
export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const inviteCode = String(body.inviteCode || '');

  const expectedCode = process.env.TEAM_INVITE_CODE || process.env.TEAM_PASSWORD;
  if (!expectedCode) return Response.json({ error: 'Server missing TEAM_INVITE_CODE/TEAM_PASSWORD.' }, { status: 503 });
  if (inviteCode !== expectedCode) return Response.json({ error: 'Wrong team code — ask Jacob for it.' }, { status: 403 });
  if (!name || name.length < 2) return Response.json({ error: 'Enter your name.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (password.length < 8) return Response.json({ error: 'Password needs at least 8 characters.' }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return Response.json({ error: 'That email already has an account — log in instead.' }, { status: 409 });

  const count = await prisma.user.count();
  const user = await prisma.user.create({
    data: { name, email, passwordHash: hashPassword(password), role: count === 0 ? 'admin' : 'member' },
  });

  const token = await createSessionToken(user.id, user.name);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    },
  });
}
