import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function redirectUri(request: Request) {
  return process.env.GMAIL_REDIRECT_URI?.trim() || `${new URL(request.url).origin}/api/auth/gmail/callback`;
}

export async function GET(request: Request) {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: requiredEnv('GMAIL_CLIENT_ID'),
    redirect_uri: redirectUri(request),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' '),
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set('gmail_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60,
    path: '/',
  });
  return response;
}
