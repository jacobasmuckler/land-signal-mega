import { prisma } from '@/lib/prisma';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

function fail(message: string) {
  return new Response(null, { status: 302, headers: { Location: `/login?error=${encodeURIComponent(message)}` } });
}

// Exchange the Microsoft auth code for an id_token, read name/email from it
// (safe unverified-decode: the token came straight from Microsoft over TLS,
// not from the browser), upsert the user, and set our session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.headers.get('cookie')?.match(/ms_oauth_state=([^;]+)/)?.[1];
  if (!code) return fail(url.searchParams.get('error_description') || 'Microsoft sign-in was cancelled.');
  if (!state || state !== cookieState) return fail('Sign-in session expired — try again.');

  const tenant = process.env.MS_TENANT_ID || 'organizations';
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID || '',
      client_secret: process.env.MS_CLIENT_SECRET || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${url.origin}/api/auth/microsoft/callback`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.id_token) return fail(tokens.error_description?.split(/[\r\n]/)[0] || 'Microsoft token exchange failed.');

  let claims: any = {};
  try {
    const payload = tokens.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch { return fail('Could not read the Microsoft account details.'); }

  const email = String(claims.email || claims.preferred_username || '').toLowerCase();
  const name = String(claims.name || email.split('@')[0] || 'Teammate');
  if (!email.includes('@')) return fail('Microsoft account has no email — contact IT.');

  // Registering the app as multi-tenant ("organizations") means ANY company's
  // Microsoft 365 tenant can attempt sign-in. This allow-list is what actually
  // restricts it to Fitprecast + Northbridge (or whichever tenant IDs are set)
  // — without it, employees of any other company could create an account.
  const allowedTenants = (process.env.ALLOWED_MS_TENANT_IDS || process.env.MS_TENANT_ID || '')
    .split(',').map(t => t.trim()).filter(Boolean);
  if (allowedTenants.length && !allowedTenants.includes(String(claims.tid))) {
    return fail('Your Microsoft account is not from an approved company tenant. Contact Jacob if this is wrong.');
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash: 'sso:microsoft', role: 'member' },
  });

  const token = await createSessionToken(user.id, user.name);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    },
  });
}
