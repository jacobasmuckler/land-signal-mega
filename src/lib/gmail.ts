export type GmailMessage = {
  id: string;
  from?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  body: string;
};

import { getSetting } from './settings';

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getRefreshToken() {
  const saved = await getSetting('GMAIL_REFRESH_TOKEN');
  const value = saved || process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!value) throw new Error('GMAIL_REFRESH_TOKEN is not configured. Reconnect Gmail in Settings.');
  return value;
}

function decodeBase64(data?: string) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Gmail's API hands back the raw MIME part body — if the sender used
// Content-Transfer-Encoding: quoted-printable (LandWatch does), the HTML is full
// of =3D / =20 escapes and soft line breaks that break every parser regex.
function decodeQuotedPrintable(input: string) {
  const src = input.replace(/=\r?\n/g, ''); // remove soft line breaks
  const bytes: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(src.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function extractBody(payload: any): string {
  if (!payload) return '';
  const bodies: string[] = [];
  if (payload.body?.data) {
    let text = decodeBase64(payload.body.data);
    const cte = (payload.headers || []).find((h: any) => h.name?.toLowerCase() === 'content-transfer-encoding')?.value || '';
    // Header says QP, or the body carries unmistakable QP artifacts.
    if (/quoted-printable/i.test(cte) || /=3D|=\r?\n/.test(text)) text = decodeQuotedPrintable(text);
    bodies.push(text);
  }
  const parts = payload.parts || [];
  for (const part of parts) {
    const nested = extractBody(part);
    if (nested) bodies.push(nested);
  }
  return bodies.join('\n\n');
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok || response.status < 500 || attempt === attempts) return response;
      lastError = new Error(`Request failed with HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 750));
  }
  throw lastError instanceof Error ? lastError : new Error('Google request failed');
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const body = new URLSearchParams({
    client_id: requiredEnv('GMAIL_CLIENT_ID'),
    client_secret: requiredEnv('GMAIL_CLIENT_SECRET'),
    refresh_token: await getRefreshToken(),
    grant_type: 'refresh_token',
  });

  const response = await fetchWithRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Encoding': 'identity',
    },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${response.status}`;
    throw new Error(`Gmail authorization failed: ${detail}`);
  }

  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return cachedAccessToken.value;
}

async function gmailGet(path: string) {
  const accessToken = await getAccessToken();
  const response = await fetchWithRetry(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Accept-Encoding': 'identity',
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Gmail API request failed: ${message}`);
  }
  return data;
}

// Send mail through the Gmail API over HTTPS. Railway blocks outbound SMTP
// (ports 465/587 both time out), so nodemailer can never work there — this can.
// Requires the OAuth token to include the gmail.send scope (Reconnect Gmail in Settings).
export async function sendGmail(message: { to: string; subject: string; html: string; text: string }) {
  const accessToken = await getAccessToken();
  const boundary = 'landsignal_' + Math.random().toString(36).slice(2);
  const encodePart = (value: string) => Buffer.from(value, 'utf8').toString('base64');
  const mime = [
    `To: ${message.to}`,
    `Subject: =?UTF-8?B?${encodePart(message.subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodePart(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodePart(message.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const raw = Buffer.from(mime, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const response = await fetchWithRetry('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity',
    },
    body: JSON.stringify({ raw }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Gmail send failed: ${detail}${/insufficient|scope/i.test(detail) ? ' — reconnect Gmail in Settings to grant send permission.' : ''}`);
  }
  return true;
}

export async function searchGmailMessages(
  query: string,
  maxResults = 20,
  options: { expandThreads?: boolean } = {}
): Promise<GmailMessage[]> {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    console.warn('Gmail environment variables are missing. Returning an empty scan result.');
    return [];
  }

  const search = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  const list = await gmailGet(`messages?${search.toString()}`);
  const messages: GmailMessage[] = [];
  const seenMsgIds = new Set<string>();
  const seenThreadIds = new Set<string>();
  const expandThreads = options.expandThreads === true;

  for (const item of list.messages || []) {
    if (!item.id) continue;
    const full = await gmailGet(`messages/${encodeURIComponent(item.id)}?format=full`);
    let threadMsgs: any[] = [full];

    if (expandThreads) {
      // LandWatch/Land.com often keep many alerts on the SAME thread, so backfill needs
      // to expand each hit into every message in its thread. Normal scans should not do
      // this because it burns Gmail API quota very quickly.
      const threadId = full.threadId || item.id;
      if (seenThreadIds.has(threadId)) continue;
      seenThreadIds.add(threadId);
      try {
        const thread = await gmailGet(`threads/${encodeURIComponent(threadId)}?format=full`);
        if (Array.isArray(thread.messages) && thread.messages.length) threadMsgs = thread.messages;
      } catch { /* fall back to the single message */ }
    }

    for (const msg of threadMsgs) {
      const mid = msg.id || item.id;
      if (seenMsgIds.has(mid)) continue;
      seenMsgIds.add(mid);
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string): string | undefined =>
        headers.find((header: any) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
      messages.push({
        id: mid,
        from: getHeader('From'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: msg.snippet ?? '',
        body: extractBody(msg.payload),
      });
    }
  }
  return messages;
}
