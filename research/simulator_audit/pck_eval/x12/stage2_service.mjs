// X12: local-only research service exposing the frozen Stage-2 call (stage2_call.cjs) for live benches that run under
// the CRA-era Jest, which cannot load the Vertex SDK. POST /stage2 {ctx} -> {status, rows, attempts, ms} (independent, frozen).
// X12b dependent variants (dep_call.cjs): POST /dep_full {ctx, s1}, /fast {ctx, s1}, /fast_indep {ctx}, /text {ctx, rows}.
// X12c streamed single call (stream_call.cjs): POST /stream_start {ctx} answers as soon as the scores are complete
// ({id, scoreRows, tScores} or the finished result when no scores came); POST /stream_result {id} answers when the call ends.
// Listens on 127.0.0.1 only. Usage: node stage2_service.mjs [port, default 3120]
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runStage2 } = require('./stage2_call.cjs');
const DEP = require('./dep_call.cjs');
const { runStream } = require('./stream_call.cjs');
const { runStreamV3 } = require('./stream_v3_call.cjs');
const STREAMS = new Map();
let nextId = 1;
const SIGNAL_MS = 4000;
function streamStart(b) {
  const id = String(nextId++);
  return new Promise((resolveEarly) => {
    const done = runStream(b.ctx, (scoreRows, tScores) => resolveEarly({ id, scoreRows, tScores }));
    STREAMS.set(id, done);
    done.then((out) => { if (!out.scoreRows) { STREAMS.delete(id); resolveEarly({ id: null, ...out }); } });
  });
}
/** The frozen X12 call streamed: answers as soon as the steering signal is determined. */
function streamV3Start(b) {
  const id = String(nextId++);
  return new Promise((resolveEarly) => {
    // signal budget: without a signal after SIGNAL_MS the students start from the Stage-1 steering (signal null)
    const timer = setTimeout(() => resolveEarly({ id, signal: null, signalTimeout: true }), SIGNAL_MS);
    const done = runStreamV3(b.ctx, (signal, tSignal) => { clearTimeout(timer); resolveEarly({ id, signal, tSignal }); });
    done.catch(() => {});
    STREAMS.set(id, done);
    done.then((out) => { if (!out.signal) { clearTimeout(timer); resolveEarly({ id, ...out, signal: null }); } });
  });
}
async function streamResult(b) {
  const p = STREAMS.get(b.id);
  if (!p) return { status: 'unknown_id' };
  const out = await p; STREAMS.delete(b.id);
  return out;
}
const ROUTES = {
  '/stage2': (b) => runStage2(b.ctx || null),
  '/dep_full': (b) => DEP.runFull(b.ctx, b.s1),
  '/fast': (b) => DEP.runScores(b.ctx, b.s1),
  '/fast_indep': (b) => DEP.runScoresIndep(b.ctx),
  '/text': (b) => DEP.runText(b.ctx, b.rows),
  '/stream_start': streamStart,
  '/stream_result': streamResult,
  '/stream_v3_start': streamV3Start,
  '/stream_v3_result': streamResult,
};

const port = Number(process.argv[2] || 3120);
http.createServer((req, res) => {
  if (req.method !== 'POST' || !ROUTES[req.url]) { res.writeHead(404); res.end(); return; }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    try {
      const out = await ROUTES[req.url](JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'service_error', error: String(e.message).slice(0, 160) }));
    }
  });
}).listen(port, '127.0.0.1', () => console.log(`stage2 service on 127.0.0.1:${port}`));
