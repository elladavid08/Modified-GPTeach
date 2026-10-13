// Research-only preload for a LOCAL server: run the student agent on the pre-1.4.0 model, to compare
// misconception behaviour with 1.4.4's gemini-3.5-flash-lite. Production code is not changed.
//   cd server && PORT=3102 node --import ../research/simulator_audit/replay_harness/scripts/student_model_override.mjs server.js
// Only models created as gemini-3.5-flash-lite (the student agent, server/model_config.js) are swapped to
// STUDENT_MODEL_OVERRIDE (default gemini-2.5-flash-lite). For that model each request gets the pre-1.4.0
// student settings (temperature 0.7, topP 1, no thinking config: 2.5 Flash-Lite does not take
// thinkingLevel). PCK, summary and every other endpoint stay on 1.4.4's models. Note: /api/health still
// reports the configured ids; the server log line below records the override.
import { createRequire } from 'module';

const require = createRequire(new URL('../../../../server/package.json', import.meta.url));
const sdk = require('@google-cloud/vertexai');
const FROM = 'gemini-3.5-flash-lite';
const TO = process.env.STUDENT_MODEL_OVERRIDE || 'gemini-2.5-flash-lite';

const getModel = sdk.VertexAI.prototype.getGenerativeModel;
sdk.VertexAI.prototype.getGenerativeModel = function (params, requestOptions) {
  const swapped = params && params.model === FROM ? { ...params, model: TO } : params;
  return getModel.call(this, swapped, requestOptions);
};

const generate = sdk.GenerativeModel.prototype.generateContent;
let logged = false;
sdk.GenerativeModel.prototype.generateContent = function (request) {
  if (String(this.model).endsWith(TO) && request && request.generationConfig) {
    const { thinkingConfig, ...rest } = request.generationConfig;
    request = { ...request, generationConfig: { ...rest, temperature: 0.7, topP: 1 } };
    return generate.call(this, request).then((result) => {
      if (!logged) {
        logged = true;
        console.log(`[research override] first student response served by modelVersion=${result && result.response && result.response.modelVersion}`);
      }
      return result;
    });
  }
  return generate.call(this, request);
};

console.log(`[research override] student model ${FROM} -> ${TO} (temperature 0.7, topP 1, no thinking config)`);
