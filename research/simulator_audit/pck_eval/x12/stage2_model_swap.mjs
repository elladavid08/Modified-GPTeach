// Research only (Stage-2 model bakeoff, 2026-11-03): a server preload that sends ONLY the Stage-2 request to another
// model, so the live A1i student check runs the unmodified server/server.js with a different Stage-2 model.
//   cd server && S2_SWAP_MODEL=gemini-3.8-flash S2_SWAP_THINK=LOW node --import ../research/simulator_audit/pck_eval/x12/stage2_model_swap.mjs server.js
// The Stage-2 request is recognised by the frozen prompt's opening sentence; prompt, schema, maxOutputTokens, timeouts,
// retries, guard and policy stay the production ones. Only the model id and the thinking level change. Without
// S2_SWAP_MODEL nothing is patched.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../server');
const require = createRequire(path.join(SERVER, 'package.json'));
const { GenerativeModel } = require('@google-cloud/vertexai/build/src/models/generative_models.js');

const swapModel = process.env.S2_SWAP_MODEL;
const STAGE2_PREFIX = 'You are the second step of a PCK feedback system';
if (swapModel) {
  const original = GenerativeModel.prototype.generateContent;
  let calls = 0;
  GenerativeModel.prototype.generateContent = function (request) {
    const text = request && request.contents && request.contents[0] && request.contents[0].parts[0].text;
    if (typeof text !== 'string' || !text.startsWith(STAGE2_PREFIX)) return original.call(this, request);
    const alt = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    alt.model = this.model.replace(/[^/]+$/, swapModel);
    for (const k of ['resourcePath', 'publisherModelEndpoint']) if (typeof this[k] === 'string') alt[k] = this[k].replace(/models\/[^/]+$/, `models/${swapModel}`);
    const gc = { ...request.generationConfig };
    if (process.env.S2_SWAP_THINK) gc.thinkingConfig = { ...gc.thinkingConfig, thinkingLevel: process.env.S2_SWAP_THINK };
    if (++calls === 1) console.log(`🔬 Stage-2 swap active: ${alt.resourcePath} thinking ${gc.thinkingConfig && gc.thinkingConfig.thinkingLevel}`);
    return original.call(alt, { ...request, generationConfig: gc });
  };
  console.log(`🔬 Stage-2 model swap preload: ${swapModel} (thinking ${process.env.S2_SWAP_THINK || 'unchanged'})`);
}
