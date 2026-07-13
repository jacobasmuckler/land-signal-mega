// Signed-cookie sessions. Edge-safe (Web Crypto only) so the middleware can
// verify tokens without a database call. Token: uid.name(b64).expiry.signature
export const SESSION_COOKIE = 'ls_session';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || process.env.TEAM_PASSWORD || 'land-signal-dev-secret';
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

export async function createSessionToken(userId: string, name: string) {
  const expires = Date.now() + THIRTY_DAYS;
  const nameB64 = b64url(new TextEncoder().encode(name));
  const payload = `${userId}.${nameB64}.${expires}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token?: string | null): Promise<{ userId: string; name: string } | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [userId, nameB64, expires, sig] = parts;
  if (Number(expires) < Date.now()) return null;
  if (await hmac(`${userId}.${nameB64}.${expires}`) !== sig) return null;
  try {
    const raw = atob(nameB64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { userId, name: new TextDecoder().decode(bytes) };
  } catch { return null; }
}
