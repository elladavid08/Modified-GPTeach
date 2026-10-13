// Analysis-only preload (node -r) for X7: PCK thinking level. In the UNMODIFIED 1.4.3 server, every PCK call
// (pedagogical_quality schema) keeps its request byte-identical except, in arm B, thinkingConfig.thinkingLevel = 'LOW'
// (asserted: prompt, schema, maxOutputTokens and every other field unchanged). Arm A changes nothing.
// Content-free call records (latency, tokens incl. thinking tokens, finish reason) go to ARM_FILE.
const fs = require('fs');
const sdk = require('/Users/ella/Projects/RAMBAM-sim/server/node_modules/@google-cloud/vertexai');
const ARM = process.env.ARM;
if (!['A', 'B', 'Bp'].includes(ARM)) throw new Error('ARM must be A, B or Bp');
// Bp (diagnostic): LOW thinking AND maxOutputTokens raised to MAX_OUT (default 8192), because LOW thinking tokens
// count against the unchanged 2000-token limit and truncate the JSON in arm B.
const MAX_OUT = Number(process.env.MAX_OUT || 8192);
const orig = sdk.GenerativeModel.prototype.generateContent;
sdk.GenerativeModel.prototype.generateContent = async function (request) {
  const gc = request.generationConfig || {};
  const schema = gc.responseSchema || {};
  if (!(schema.properties && schema.properties.pedagogical_quality)) return orig.call(this, request);
  if (!gc.thinkingConfig || gc.thinkingConfig.thinkingLevel !== 'MINIMAL') throw new Error('expected MINIMAL thinking in 1.4.3');
  const sent = ARM === 'A' ? request : { ...request, generationConfig: { ...gc, thinkingConfig: { ...gc.thinkingConfig, thinkingLevel: 'LOW' }, ...(ARM === 'Bp' ? { maxOutputTokens: MAX_OUT } : {}) } };
  const strip = (r) => JSON.stringify({ ...r, generationConfig: { ...r.generationConfig, thinkingConfig: null, maxOutputTokens: null } });
  if (ARM === 'B' && sent.generationConfig.maxOutputTokens !== gc.maxOutputTokens) throw new Error('B must keep the token limit');
  if (strip(sent) !== strip(request)) throw new Error('request changed beyond thinkingLevel');
  const rec = { arm: ARM, thinkingLevel: sent.generationConfig.thinkingConfig.thinkingLevel, maxOutputTokens: sent.generationConfig.maxOutputTokens };
  const t0 = Date.now();
  try {
    const result = await orig.call(this, sent);
    const r = result.response; const c = r.candidates && r.candidates[0]; const u = r.usageMetadata || {};
    Object.assign(rec, { ok: true, ms: Date.now() - t0, finishReason: c && c.finishReason, inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, thoughts: u.thoughtsTokenCount || 0, total: u.totalTokenCount });
    return result;
  } catch (e) { Object.assign(rec, { ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 200) }); throw e; }
  finally { if (process.env.ARM_FILE) fs.appendFileSync(process.env.ARM_FILE, JSON.stringify(rec) + '\n'); }
};
