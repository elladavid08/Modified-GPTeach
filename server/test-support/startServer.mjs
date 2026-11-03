// Boots the real server.js (with faked external services, see loader.mjs) on an
// ephemeral port. server.js calls app.listen() at import time and exports nothing,
// so the http.Server instance is captured by wrapping Server.prototype.listen.
import http from 'node:http';

let started = null;

export async function startServer() {
  if (started) return started;

  process.env.PORT = '0';
  process.env.NODE_ENV = 'test';
  // 1.6.0: two-stage PCK (PCK_STAGE2) is ON by default. The 1.5.1 endpoint suites assert the single-call 1.5.1
  // response, which is now the explicit-off path, so it is pinned here unless a test sets it. The Stage-2 suites
  // (api_pck_stage2, pck_stage2_flag) clear or set it per test to exercise the real default and every value.
  if (process.env.PCK_STAGE2 === undefined) process.env.PCK_STAGE2 = 'off';

  // server.js logs very verbosely; keep test output readable unless asked.
  // Lines logged until the server is listening (configuration, startup banner) are kept in `startupLog`.
  const startupLog = [];
  const quiet = !process.env.TEST_VERBOSE;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const capture = (original) => (...args) => {
    startupLog.push(args.map(String).join(' '));
    if (!quiet) original(...args);
  };
  console.log = capture(originalLog);
  console.warn = capture(originalWarn);
  if (quiet) console.error = () => {};

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
  console.log = quiet ? () => {} : originalLog;
  console.warn = quiet ? () => {} : originalWarn;

  const { fakeModel } = await import('./fakes/vertexai.mjs');
  const { port } = captured.address();
  started = {
    baseUrl: `http://127.0.0.1:${port}`,
    fakeModel,
    startupLog,
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
