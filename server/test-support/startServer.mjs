// Boots the real server.js (with faked external services, see loader.mjs) on an
// ephemeral port. server.js calls app.listen() at import time and exports nothing,
// so the http.Server instance is captured by wrapping Server.prototype.listen.
import http from 'node:http';

let started = null;

export async function startServer() {
  if (started) return started;

  process.env.PORT = '0';
  process.env.NODE_ENV = 'test';

  // server.js logs very verbosely; keep test output readable unless asked.
  if (!process.env.TEST_VERBOSE) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  let captured;
  const listening = new Promise((resolve) => {
    const originalListen = http.Server.prototype.listen;
    http.Server.prototype.listen = function patchedListen(...args) {
      captured = this;
      http.Server.prototype.listen = originalListen;
      this.once('listening', resolve);
      return originalListen.apply(this, args);
    };
  });

  await import('../server.js');
  await listening;

  const { fakeModel } = await import('./fakes/vertexai.mjs');
  const { port } = captured.address();
  started = {
    baseUrl: `http://127.0.0.1:${port}`,
    fakeModel,
    close: () => new Promise((resolve) => captured.close(resolve)),
  };
  return started;
}

export async function postJson(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

/** Concatenated text of every part of every content item in a generateContent request. */
export function promptText(request) {
  return request.contents
    .flatMap((c) => c.parts)
    .map((p) => p.text || '')
    .join('\n');
}
