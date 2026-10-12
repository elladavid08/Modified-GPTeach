/**
 * Gemini model configuration (1.3.0-gemini3 on main): split models, as validated on the
 * post-pilot branch (research/simulator_audit/student_model_bakeoff.md §9 there).
 *
 * - The student agent (/api/generate) runs on gemini-3.5-flash-lite.
 * - PCK feedback (/api/pck-feedback), the summary (/api/pck-summary) and the completion / test
 *   endpoints run on gemini-3.1-flash-lite.
 *
 * The 3.x models are served only from the multi-region endpoints, so the Vertex client always uses
 * the `global` location and its API host; GOOGLE_CLOUD_LOCATION does not apply to these models.
 * Every call sets thinking explicitly to MINIMAL (thinking tokens count against maxOutputTokens)
 * and sends no temperature / topP (the model defaults are used). Schemas and token limits are set
 * per endpoint in server.js and are unchanged.
 */

export const STUDENT_MODEL_ID = 'gemini-3.5-flash-lite';
export const GENERAL_MODEL_ID = 'gemini-3.1-flash-lite';

/** Model per agent / endpoint, as reported by /api/health. */
export const MODEL_IDS = Object.freeze({
  student: STUDENT_MODEL_ID,
  pck: GENERAL_MODEL_ID,
  summary: GENERAL_MODEL_ID,
  completion: GENERAL_MODEL_ID,
  test: GENERAL_MODEL_ID,
});

export const VERTEX_LOCATION = 'global';
export const VERTEX_API_ENDPOINT = 'aiplatform.googleapis.com';

/** Generation settings shared by every call: explicit MINIMAL thinking, no sampling parameters. */
export function baseGenerationConfig() {
  return { thinkingConfig: { thinkingLevel: 'MINIMAL' } };
}
