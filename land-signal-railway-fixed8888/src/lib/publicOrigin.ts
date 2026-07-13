// Behind Railway's reverse proxy, the raw request the Node process sees can
// report an internal host (e.g. localhost:8080) instead of the public domain.
// Microsoft OAuth requires the redirect_uri we SEND to exactly match the one
// registered in Azure, so a wrong guess here breaks sign-in with AADSTS50011.
// Priority: explicit APP_URL env var > standard proxy forwarding headers >
// raw request URL (fine for local `next dev`).
export function publicOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
