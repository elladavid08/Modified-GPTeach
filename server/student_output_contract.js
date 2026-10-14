/**
 * Minimal server-side structural check of the student agent's output (since 1.3.6), so that a
 * malformed output can be retried on the server instead of failing late in the browser.
 *
 * It mirrors what the client parser (src/utils/ai.js:convertResponseToMessages) needs in order not
 * to fail: a JSON object with a `responses` array whose entries are objects, with `student` and
 * `message` strings when present. Entries missing `student` / `message` are still skipped by the
 * client as before, and `responses: []` (silence) stays valid. Student behaviour and the prompt are
 * unchanged; no repair is attempted.
 */

export const STUDENT_PARSE_ERROR = 'Failed to parse AI response: invalid student output (not JSON)';
export const STUDENT_INVALID_ERROR = 'Failed to parse AI response: invalid student output';
export const MAX_RAW_OUTPUT_EXCERPT_CHARS = 1000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isOptionalStr = (v) => v === undefined || v === null || typeof v === 'string';

/** @returns {{ok: true, value: object}|{ok: false, kind: 'parse'|'schema', problems: string[]}} */
export function validateStudentOutputText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, kind: 'parse', problems: ['empty output'] };
  }
  let body = text.trim();
  const fenced = body.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenced) {
    body = fenced[1];
  }
  let value;
  try {
    value = JSON.parse(body);
  } catch (error) {
    return { ok: false, kind: 'parse', problems: [error.message] };
  }
  const problems = [];
  if (!isObj(value)) {
    problems.push('output must be a JSON object');
  } else if (!Array.isArray(value.responses)) {
    problems.push('responses must be an array');
  } else {
    value.responses.forEach((r, i) => {
      if (!isObj(r)) {
        problems.push(`responses[${i}] must be an object`);
        return;
      }
      if (!isOptionalStr(r.student)) problems.push(`responses[${i}].student must be a string`);
      if (!isOptionalStr(r.message)) problems.push(`responses[${i}].message must be a string`);
    });
  }
  return problems.length ? { ok: false, kind: 'schema', problems } : { ok: true, value };
}
