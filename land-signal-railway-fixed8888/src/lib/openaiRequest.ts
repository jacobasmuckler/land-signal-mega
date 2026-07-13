// Shared caller for OpenAI's Responses API (web_search-enabled reports).
// OpenAI occasionally returns a transient 5xx / generic "error occurred
// processing your request" — retrying once or twice clears it almost every
// time, so a real research feature shouldn't die on a one-off server hiccup.

function extractText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const pieces: string[] = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') pieces.push(part.text);
    }
  }
  return pieces.join('\n').trim();
}

function isRetryable(status: number, message: string) {
  if (status === 429 || status >= 500) return true;
  return /error occurred|try again|temporarily|timeout/i.test(message);
}

export async function runOpenAISearch(apiKey: string, model: string, prompt: string, attempts = 3): Promise<string> {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, tools: [{ type: 'web_search' }], input: prompt }),
        signal: AbortSignal.timeout(55_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = data?.error?.message || `HTTP ${res.status}`;
        if (attempt < attempts && isRetryable(res.status, lastError)) {
          await new Promise(r => setTimeout(r, 1200 * attempt));
          continue;
        }
        throw new Error(lastError);
      }
      const text = extractText(data);
      if (text) return text;
      lastError = 'no text in response';
      if (attempt < attempts) { await new Promise(r => setTimeout(r, 800)); continue; }
    } catch (err: any) {
      lastError = err?.message || String(err);
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      if (attempt < attempts && (timedOut || isRetryable(0, lastError))) {
        await new Promise(r => setTimeout(r, 1200 * attempt));
        continue;
      }
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}
