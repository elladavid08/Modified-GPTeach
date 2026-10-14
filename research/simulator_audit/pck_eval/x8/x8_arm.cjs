// Analysis-only preload (node -r) for X8: PCK schema property ORDER. In the UNMODIFIED 1.4.3 server, every PCK call
// (pedagogical_quality schema) is unchanged except, in arm B, the top-level responseSchema.properties are re-ordered
// with skills_assessment first (and an explicit propertyOrdering if PROPERTY_ORDERING=1). Asserted: same properties,
// definitions, required list, prompt, token limit and thinking level. Records the output's top-level key order (key names only).
const fs = require('fs');
const sdk = require('/Users/ella/Projects/RAMBAM-sim/server/node_modules/@google-cloud/vertexai');
const ARM = process.env.ARM;
if (!['A', 'B'].includes(ARM)) throw new Error('ARM must be A or B');
const FIRST = ['skills_assessment'];
const canon = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().reduce((m, k) => ((m[k] = canon(o[k])), m), {}) : Array.isArray(o) ? o.map(canon) : o);
const orig = sdk.GenerativeModel.prototype.generateContent;
sdk.GenerativeModel.prototype.generateContent = async function (request) {
  const gc = request.generationConfig || {};
  const schema = gc.responseSchema || {};
  if (!(schema.properties && schema.properties.pedagogical_quality)) return orig.call(this, request);
  let sent = request;
  if (ARM === 'B') {
    const keys = [...FIRST, ...Object.keys(schema.properties).filter((k) => !FIRST.includes(k))];
    const props = {}; for (const k of keys) props[k] = schema.properties[k];
    const s2 = { ...schema, properties: props, ...(process.env.PROPERTY_ORDERING === '1' ? { propertyOrdering: keys } : {}) };
    sent = { ...request, generationConfig: { ...gc, responseSchema: s2 } };
    const { propertyOrdering, ...rest } = s2;
    if (JSON.stringify(canon(rest)) !== JSON.stringify(canon(schema))) throw new Error('schema changed beyond order');
    if (JSON.stringify(canon({ ...sent, generationConfig: { ...sent.generationConfig, responseSchema: null } })) !== JSON.stringify(canon({ ...request, generationConfig: { ...gc, responseSchema: null } }))) throw new Error('request changed');
  }
  const rec = { arm: ARM, schemaOrder: Object.keys(sent.generationConfig.responseSchema.properties).slice(0, 3) };
  const t0 = Date.now();
  try {
    const result = await orig.call(this, sent);
    const r = result.response; const c = r.candidates && r.candidates[0]; const u = r.usageMetadata || {};
    let keyOrder = null;
    try { keyOrder = Object.keys(JSON.parse(c.content.parts.map((p) => p.text || '').join(''))); } catch { keyOrder = 'unparseable'; }
    Object.assign(rec, { ok: true, ms: Date.now() - t0, finishReason: c && c.finishReason, inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, thoughts: u.thoughtsTokenCount || 0, keyOrder });
    return result;
  } catch (e) { Object.assign(rec, { ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 200) }); throw e; }
  finally { if (process.env.ARM_FILE) fs.appendFileSync(process.env.ARM_FILE, JSON.stringify(rec) + '\n'); }
};
