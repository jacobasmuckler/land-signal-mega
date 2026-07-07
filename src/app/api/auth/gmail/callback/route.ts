import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { saveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function redirectUri(request: Request) {
  return process.env.GMAIL_REDIRECT_URI?.trim() || `${new URL(request.url).origin}/api/auth/gmail/callback`;
}

function html(title: string, body: string, ok = true) {
  return new NextResponse(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body{margin:0;background:#0B1416;color:#E7EEEC;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}
      .card{max-width:720px;background:#142528;border:1px solid #2C4A4F;border-radius:20px;padding:28px;line-height:1.55}
      h1{margin:0 0 10px;font-size:28px}
      p{color:#9bb0ac}
      a{display:inline-flex;margin-top:12px;background:${ok ? '#6FD6E0' : '#E8765B'};color:#0B1416;text-decoration:none;padding:10px 16px;border-radius:12px;font-weight:700}
      code{background:#0F1B1E;border:1px solid #2C4A4F;padding:2px 6px;border-radius:7px}
    </style>
  </head>
  <body><main class="card"><h1>${title}</h1>${body}<a href="/settings">Back to Settings</a></main></body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: ok ? 200 : 400 });
}

async function getGmailProfile(accessToken: string) {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    return typeof data?.emailAddress === 'string' ? data.emailAddress : '';
  } catch {
    return '';
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expectedState = cookies().get('gmail_oauth_state')?.value;
    if (!code) return html('Gmail reconnect failed', '<p>Google did not return an authorization code.</p>', false);
    if (!state || !expectedState || state !== expectedState) {
      return html('Gmail reconnect failed', '<p>The security state did not match. Please start again from Settings.</p>', false);
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: requiredEnv('GMAIL_CLIENT_ID'),
        client_secret: requiredEnv('GMAIL_CLIENT_SECRET'),
        redirect_uri: redirectUri(request),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      const message = tokenData?.error_description || tokenData?.error || `HTTP ${tokenRes.status}`;
      return html('Gmail reconnect failed', `<p>Google rejected the token request: <code>${message}</code></p>`, false);
    }
    if (!tokenData.refresh_token) {
      return html(
        'Gmail reconnect did not return a refresh token',
        '<p>Google connected the account, but did not return a new refresh token. Go back to Settings and click reconnect again. If it still happens, remove this app from your Google Account permissions and retry.</p>',
        false
      );
    }

    const email = tokenData.access_token ? await getGmailProfile(tokenData.access_token) : '';
    await saveSettings({
      GMAIL_REFRESH_TOKEN: tokenData.refresh_token,
      GMAIL_CONNECTED_EMAIL: email,
      GMAIL_CONNECTED_AT: new Date().toISOString(),
    });

    return html('Gmail connected', `<p>Gmail is connected${email ? ` for <b>${email}</b>` : ''}. The scanner will now use this saved connection instead of the old Railway refresh token.</p>`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return html('Gmail reconnect failed', `<p>${message}</p>`, false);
  }
}
