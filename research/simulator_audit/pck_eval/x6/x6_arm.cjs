// Analysis-only preload (node -r) for X6-APR. In the UNMODIFIED 1.4.3 server, every PCK call (pedagogical_quality schema)
// gets arm B's three APR score descriptions swapped in (each original must occur exactly once). Schema / config untouched
// (asserted). Arm A changes nothing. Content-free call records go to ARM_FILE.
const fs = require('fs');
const path = require('path');
const sdk = require('/Users/ella/Projects/RAMBAM-sim/server/node_modules/@google-cloud/vertexai');
const ARM = process.env.ARM;
if (!['A', 'B', 'Bp'].includes(ARM)) throw new Error('ARM must be A, B or Bp');
const SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, ARM === 'Bp' ? 'apr_bands_Bp.json' : 'apr_bands_B.json'), 'utf8'));
const REPL = SPEC.replacements;
const INSERTS = SPEC.inserts || [];
const orig = sdk.GenerativeModel.prototype.generateContent;
sdk.GenerativeModel.prototype.generateContent = async function (request) {
  const gc = request.generationConfig || {};
  const schema = gc.responseSchema || {};
  if (!(schema.properties && schema.properties.pedagogical_quality)) return orig.call(this, request);
  const part = request.contents[0].parts[0];
  let text = part.text;
  for (const [from, to] of REPL) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`APR description found ${n} times`);
    if (ARM !== 'A') text = text.replace(from, to);
  }
  for (const [anchor, add] of ARM === 'Bp' ? INSERTS : []) {
    const n = text.split(anchor).length - 1;
    if (n !== 1) throw new Error(`anchor found ${n} times`);
    text = text.replace(anchor, `${anchor}\n${add}`);
  }
  const before = JSON.stringify(gc);
  const sent = ARM !== 'A' ? { ...request, contents: [{ ...request.contents[0], parts: [{ ...part, text }, ...request.contents[0].parts.slice(1)] }, ...request.contents.slice(1)] } : request;
  if (JSON.stringify(sent.generationConfig || {}) !== before) throw new Error('generation config changed');
  const rec = { arm: ARM, promptChars: sent.contents[0].parts[0].text.length };
  const t0 = Date.now();
  try {
    const result = await orig.call(this, sent);
    const r = result.response; const c = r.candidates && r.candidates[0]; const u = r.usageMetadata || {};
    Object.assign(rec, { ok: true, ms: Date.now() - t0, finishReason: c && c.finishReason, inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount });
    return result;
  } catch (e) { Object.assign(rec, { ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 200) }); throw e; }
  finally { if (process.env.ARM_FILE) fs.appendFileSync(process.env.ARM_FILE, JSON.stringify(rec) + '\n'); }
};
