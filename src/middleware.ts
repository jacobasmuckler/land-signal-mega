import { NextRequest, NextResponse } from 'next/server';

function unauthorized(message = 'Authentication required') {
  return new NextResponse(message, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Charlotte Land Scanner"' },
  });
}

export function middleware(request: NextRequest) {
  const expectedUser = process.env.TEAM_USERNAME;
  const expectedPassword = process.env.TEAM_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    if (process.env.NODE_ENV === 'development') return NextResponse.next();
    return new NextResponse('TEAM_USERNAME and TEAM_PASSWORD must be configured.', { status: 503 });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Basic ')) return unauthorized();

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return unauthorized();
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (username !== expectedUser || password !== expectedPassword) return unauthorized('Invalid credentials');
    return NextResponse.next();
  } catch {
    return unauthorized('Invalid credentials');
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
