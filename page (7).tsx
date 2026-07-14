// Verifies the REAL runOpenAISearch (src/lib/openaiRequest.ts) retries
// transient OpenAI errors and gives up cleanly on permanent ones.
// Spins up a local fake server and points global fetch at it via a proxy trick:
// since the function hardcodes the OpenAI URL, we intercept via global fetch override.
import { strict as assert } from 'node:assert';
import http from 'node:http';
import { runOpenAISearch } from '../src/lib/openaiRequest';

let callCount = 0;
let mode: 'flaky-then-ok' | 'always-fail' | 'success-first-try' = 'flaky-then-ok';

const server = http.createServer((req, res) => {
  callCount++;
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'success-first-try') {
      res.writeHead(200);
      res.end(JSON.stringify({ output_text: 'clean success' }));
    } else if (mode === 'flaky-then-ok') {
      if (callCount < 3) {
        res.writeHead(200); // OpenAI sometimes returns this error IN a 200 body
        res.end(JSON.stringify({ error: { message: 'An error occurred while processing your request. req_test123' } }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ output_text: 'SUCCESS after retries' }));
      }
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ error: { message: 'invalid_request: bad zoning param' } }));
    }
  });
});

(async () => {
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;

  const realFetch = global.fetch;
  // @ts-ignore - redirect the hardcoded OpenAI URL to our local fake server
  global.fetch = ((url: any, opts: any) => realFetch(`http://localhost:${port}/`, opts)) as any;

  callCount = 0; mode = 'success-first-try';
  const r0 = await runOpenAISearch('fake-key', 'gpt-4.1-mini', 'test prompt');
  assert.equal(r0, 'clean success');
  assert.equal(callCount, 1, 'should not retry on first-try success');

  callCount = 0; mode = 'flaky-then-ok';
  const r1 = await runOpenAISearch('fake-key', 'gpt-4.1-mini', 'test prompt');
  assert.equal(r1, 'SUCCESS after retries');
  assert.equal(callCount, 3, 'should have retried exactly twice before succeeding');

  callCount = 0; mode = 'always-fail';
  await assert.rejects(
    () => runOpenAISearch('fake-key', 'gpt-4.1-mini', 'test prompt'),
    (err: any) => err.message.includes('bad zoning param'),
  );

  global.fetch = realFetch;
  console.log('OpenAI retry self-test passed:', { flakyThenOkCalls: 3 });
  server.close();
  process.exit(0); // fetch's keep-alive sockets would otherwise hold the process open
})();
