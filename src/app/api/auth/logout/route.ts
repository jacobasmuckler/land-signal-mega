import { SESSION_COOKIE } from '@/lib/session';
import { relativeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = relativeRedirect('/login');
  res.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
