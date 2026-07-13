import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Session-cookie auth: everyone gets their own account (Microsoft SSO or
// email+password). Unauthenticated visitors are sent to the login page.
// Note: /api/auth/gmail/* is intentionally NOT public — connecting the inbox
// requires being signed in. Only the login/SSO endpoints are open.
const PUBLIC_PREFIXES = ['/login', '/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/microsoft', '/_next', '/favicon', '/sources.js'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  // Legacy fallback: the old shared TEAM_USERNAME/TEAM_PASSWORD basic auth
  // still works so existing bookmarks and tools don't break.
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Basic ') && process.env.TEAM_USERNAME && process.env.TEAM_PASSWORD) {
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(':');
      if (decoded.slice(0, sep) === process.env.TEAM_USERNAME && decoded.slice(sep + 1) === process.env.TEAM_PASSWORD) {
        return NextResponse.next();
      }
    } catch { /* fall through to login redirect */ }
  }

  if (pathname.startsWith('/api/')) return new NextResponse('Sign in required', { status: 401 });
  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
