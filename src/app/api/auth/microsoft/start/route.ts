export const dynamic = 'force-dynamic';

// Kick off Microsoft Entra ID (Azure AD) sign-in. Needs MS_CLIENT_ID,
// MS_CLIENT_SECRET, MS_TENANT_ID in Railway (from the Azure app registration).
export async function GET(request: Request) {
  const clientId = process.env.MS_CLIENT_ID;
  const tenant = process.env.MS_TENANT_ID || 'common';
  if (!clientId) return new Response('Microsoft sign-in not configured (MS_CLIENT_ID missing).', { status: 503 });

  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: `${origin}/api/auth/microsoft/callback`,
    response_mode: 'query',
    scope: 'openid profile email',
    state,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`,
      'Set-Cookie': `ms_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}
