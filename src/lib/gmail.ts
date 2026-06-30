export type GmailMessage = {
  id: string;
  from?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  body: string;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function decodeBase64(data?: string) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64(payload.body.data);
  const parts = payload.parts || [];
  const plain = parts.find((part: any) => part.mimeType === 'text/plain');
  if (plain?.body?.data) return decodeBase64(plain.body.data);
  const html = parts.find((part: any) => part.mimeType === 'text/html');
  if (html?.body?.data) return decodeBase64(html.body.data);
  for (const part of parts) {
    const nested = extractBody(part);
    if (nested) return nested;
  }
  return '';
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
    refresh_token: requiredEnv('GMAIL_REFRESH_TOKEN'),
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

export async function searchGmailMessages(query: string, maxResults = 20): Promise<GmailMessage[]> {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
    console.warn('Gmail environment variables are missing. Returning an empty scan result.');
    return [];
  }

  const search = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  const list = await gmailGet(`messages?${search.toString()}`);
  const messages: GmailMessage[] = [];

  for (const item of list.messages || []) {
    if (!item.id) continue;
    const full = await gmailGet(`messages/${encodeURIComponent(item.id)}?format=full`);
    const headers = full.payload?.headers || [];
    const getHeader = (name: string): string | undefined =>
      headers.find((header: any) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
    messages.push({
      id: item.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: full.snippet ?? '',
      body: extractBody(full.payload),
    });
  }
  return messages;
}
