// Analysis-only preload (node -r) for X11, the post-1.5.0 model bakeoff. It runs the UNMODIFIED 1.5.0 server and
// changes only the MODEL of one agent (PCK and/or student), plus, where a model requires it, the thinking level and
// output-token budget. Every other request field (prompt, history, schema, other generation settings) is asserted
// unchanged. Content-free call records (agent, model, latency, tokens incl. thinking, finish reason) go to ARM_FILE.
//
//   PCK_MODEL / STUDENT_MODEL      model id replacing gemini-3.1-flash-lite (PCK) / gemini-3.5-flash-lite (student)
//   PCK_THINK / STUDENT_THINK      thinking level to send instead of production MINIMAL (only if the model needs it)
//   PCK_MAX_OUT / STUDENT_MAX_OUT  maxOutputTokens instead of production 2000 / 512 (only if thinking needs room)
//   ARM_FILE                       call-record file (JSONL); ARM  free-text arm label
const fs = require('fs');
const path = require('path');
const sdk = require(path.resolve(__dirname, '../../../../server/node_modules/@google-cloud/vertexai'));

const PROD = { pck: 'gemini-3.1-flash-lite', student: 'gemini-3.5-flash-lite' };
const want = { pck: process.env.PCK_MODEL || PROD.pck, student: process.env.STUDENT_MODEL || PROD.student };
const think = { pck: process.env.PCK_THINK || null, student: process.env.STUDENT_THINK || null };
const maxOut = { pck: Number(process.env.PCK_MAX_OUT) || null, student: Number(process.env.STUDENT_MAX_OUT) || null };

// Production creates one general model instance (PCK/summary/completion/test share it) and one student instance.
const origGet = sdk.VertexAI.prototype.getGenerativeModel;
sdk.VertexAI.prototype.getGenerativeModel = function (params, ...rest) {
  let model = params.model;
  if (model === PROD.pck) model = want.pck;
  else if (model === PROD.student) model = want.student;
  else throw new Error(`x11: unexpected production model ${params.model}`);
  return origGet.call(this, { ...params, model }, ...rest);
};

const agentOf = (request) => {
  const props = ((request.generationConfig || {}).responseSchema || {}).properties || {};
  if (props.pedagogical_quality) return 'pck';
  if (props.responses) return 'student';
  return null;
};

const origGen = sdk.GenerativeModel.prototype.generateContent;
sdk.GenerativeModel.prototype.generateContent = async function (request) {
  const agent = agentOf(request);
  if (!agent) return origGen.call(this, request);
  const gc = request.generationConfig || {};
  if (!gc.thinkingConfig || gc.thinkingConfig.thinkingLevel !== 'MINIMAL') throw new Error('x11: expected production MINIMAL thinking');
  const sent = {
    ...request,
    generationConfig: {
      ...gc,
      ...(think[agent] ? { thinkingConfig: { ...gc.thinkingConfig, thinkingLevel: think[agent] } } : {}),
      ...(maxOut[agent] ? { maxOutputTokens: maxOut[agent] } : {}),
    },
  };
  const strip = (r) => JSON.stringify({ ...r, generationConfig: { ...r.generationConfig, thinkingConfig: null, maxOutputTokens: null } });
  if (strip(sent) !== strip(request)) throw new Error('x11: request changed beyond thinking level / token budget');
  const rec = { arm: process.env.ARM || null, agent, model: this.model, thinkingLevel: sent.generationConfig.thinkingConfig.thinkingLevel, maxOutputTokens: sent.generationConfig.maxOutputTokens };
  const t0 = Date.now();
  try {
    const result = await origGen.call(this, sent);
    const r = result.response; const c = r.candidates && r.candidates[0]; const u = r.usageMetadata || {};
    Object.assign(rec, { ok: true, ms: Date.now() - t0, finishReason: c && c.finishReason, inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount, thoughts: u.thoughtsTokenCount || 0 });
    return result;
  } catch (e) {
    Object.assign(rec, { ok: false, ms: Date.now() - t0, error: String(e.message).slice(0, 200) });
    throw e;
  } finally {
    if (process.env.ARM_FILE) fs.appendFileSync(process.env.ARM_FILE, JSON.stringify(rec) + '\n');
  }
};
