// Jest setup for the live replay runner: real HTTP to a LOCAL server.js (never a deployed backend),
// a minimal fetch (what src/services/genai.js uses: ok, status, json()), and quiet client logs.
const http = require('http');
const { URL } = require('url');

const api = process.env.HARNESS_API_URL || 'http://127.0.0.1:3101';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(api)) {
  throw new Error(`HARNESS_API_URL must point to a local server, got ${api}`);
}
process.env.REACT_APP_API_URL = api;

global.fetch = (url, opts = {}) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: opts.method || 'GET', headers: opts.headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => JSON.parse(data) }));
    });
    req.on('error', (e) => reject(new TypeError('fetch failed: ' + e.message)));
    if (opts.body) req.write(opts.body);
    req.end();
  });

// The client logs full prompts and outputs; keep the run output readable (errors still print).
for (const m of ['log', 'info', 'debug', 'warn']) console[m] = () => {};
