// Student garbled-text detection (1.4.2, detection only; student_garbled_text_investigation.md).
// Five content-free, high-confidence categories counted per reply in the returned student output, plus the
// number of affected replies. Detection never retries, rewrites, drops or reorders anything.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectGarble, countGarbledReplies, GARBLE_TELEMETRY_KEYS, FUNCTION_WORDS } from '../student_garble.js';
import { startServer, postJson } from '../test-support/startServer.mjs';
import { textResult } from '../test-support/fakes/vertexai.mjs';

// ─── Unit: positives seen in the investigation (verbatim fragments) ──────────

const POSITIVES = [
  ['foreignScript', 'כן, זה בעצם די הגיוני כשיורדים לדรายละเอียด של ההגדרה.'], // Thai
  ['foreignScript', 'איזה יظה, אז סוף סוף הבנתי את ההבדל בין תנאי הכרחי לתנאי מספיק!'], // Arabic
  ['foreignScript', 'אמм... אם כל הצלעות שוות, זה לא ריבוע?'], // Cyrillic
  ['foreignScript', 'מגניב, ע체יו זה ברור.'], // Hangul
  ['foreignScript', 'כדי לראות אם כל ארבע הזواיות של הצורה הכחולה הן ישרות'],
  ['foreignScript', 'אולי האלכסון לא באמת חاضה את הזווית לשני חצאים שווים.'],
  ['foreignScript', 'אז צריך לבדוק כל צורה לגופها ולא להסיק שזה אותו דבר.'],
  ['foreignScript', 'וזה מה שמוכיח את ההכла.'],
  ['foreignScript', 'איזה י킴, הבנתי!'],
  ['mixedScriptToken', 'כן! עכשיו ברור לי לגmרי. לפי ההגדרה שהסברת, כל ריבוע הוא מלבן.'],
  ['mixedScriptToken', 'אה, אני יודעת! אמרת לנו ששdo האלכסונים במעוין תמיד מאונכים זה לזה, נכון?'],
  ['cantillation', 'אה, נכון! אמרת ל֤ני לפגע שבמלבן האלכסונים לא חוצים את הזוויות'],
  ['cantillation', 'אמרת לנו שזה לא מספיק לבד, כ֕מו שראינו בדלתון'],
  ['repeatedFunctionWord', 'אבל רואים שהם לא חוצים זה את את האמצע כי נקודת החיתוך לא באמצע שלהם.'],
  ['repeatedFunctionWord', 'צריך ששניהם גם יחצו זה את את זה באמצע, נכון?'],
  ['repeatedFunctionWord', 'הם רק חוצים זה את את השני ולא את הזווית עצמה.'],
  ['markup', 'יש לו אלכסונים מאונכים וכתוב גם ש-$AC = BD$, אבל הם לא חוצים זה את זה באמצע'],
  ['markup', 'הזווית שווה ל-$90$ מעלות'],
  ['markup', 'זה **ממש** חשוב'],
  ['markup', 'הנה <b>הגדרה</b>'],
  ['markup', 'התנאי הוא \\frac{1}{2} מהזווית'],
];

for (const [category, text] of POSITIVES) {
  test(`positive (${category}): ${text.slice(0, 40)}`, () => {
    const hits = detectGarble(text);
    assert.equal(hits[category], true, JSON.stringify(hits));
  });
}

// ─── Unit: legitimate text that must never be flagged ────────────────────────

const LEGIT = [
  'רגע, אני לא מבין. אז ריבוע הוא גם מלבן?',
  'אה, עכשיו הבנתי לגמרי! מה שקובע זה ההגדרה ולא המראה.',
  // numbers and units
  'הזווית היא 45 מעלות, אז האלכסון חוצה אותה ל-45 ו-45.',
  'זווית של 90°', 'ה-90 מעלות שבפינה', 'צלע של 3 ס״מ וצלע של 5 ס״מ', 'שטח של 12 מ״ר', 'מהירות של 60 קמ״ש', 'שאלה 2', 'מלבן 6x3',
  // English mathematical terms and labels
  'האלכסונים AC ו-BD שווים', 'ה-AC שלנו ארוך יותר', 'ABCD הוא מלבן', 'אפשר לבדוק את זה ב-GeoGebra', 'זה בערך 3 cm',
  // gershayim / geresh
  'אמרנו בכיתה ז׳ ש״מלבן״ זה מרובע עם ארבע זוויות ישרות',
  // Greek letters
  'הזווית α שווה לזווית β',
  // niqqud
  'הם נחתכים בדיוק בְּזָווית של תשעים מעלות.',
  // normal repetition and legitimate adjacent words
  'סוף סוף הבנתי!', 'חצי חצי', 'במלבן הצלעות שוות זוגות זוגות', 'בדיוק, בדיוק כמו במלבן', 'לאט לאט זה מתבהר',
  'האלכסונים חוצים זה את זה זה לא מספיק', 'אז בגלל זה זה לא ריבוע.', 'לא, לא כל מלבן הוא ריבוע.', 'נכון, נכון?', 'את, את מסכימה?',
  // digits glued to Hebrew: the low-confidence rule is deliberately NOT implemented
  'צריך לוודא שש3 התנאים מתקיימים', 'בתרגיל 3א',
  // punctuation, emoji, dollars without a closing pair, comparisons
  'רגע... אה! (זה הגיוני) — נכון?', 'מגניב 😊', 'זה עולה 5$', 'אם x < 5 אז',
  // English only (not predominantly Hebrew) is not "foreign script"
  'OK, thanks!',
];

for (const text of LEGIT) {
  test(`legitimate, not flagged: ${text}`, () => {
    assert.deepEqual(detectGarble(text), {});
  });
}

test('a foreign letter only counts inside predominantly Hebrew text', () => {
  assert.equal(detectGarble('مرحبا بكم').foreignScript, undefined, 'non-Hebrew text is out of scope');
  assert.equal(detectGarble('שלום לכולם ظ').foreignScript, true);
});

test('function-word list is closed and excludes the legitimate זה / לא repetitions', () => {
  assert.ok(FUNCTION_WORDS.has('את'));
  assert.equal(FUNCTION_WORDS.has('זה'), false);
  assert.equal(FUNCTION_WORDS.has('לא'), false);
});

// ─── Unit: counting replies in one student output ───────────────────────────

test('countGarbledReplies counts affected replies per category and in total (a reply counts once per category)', () => {
  const responses = [
    { student: 'נועה', message: 'הבנתי לגmרי, ולגmרי שוב' }, // mixed ×2 in one reply → 1
    { student: 'תמר', message: 'איזה יظה, זה את את זה' }, // foreign + repeated → 1 reply
    { student: 'יובל', message: 'סוף סוף הבנתי לגמרי' }, // clean
  ];
  assert.deepEqual(countGarbledReplies(responses), {
    garbleForeignScript: 1, garbleMixedScriptToken: 1, garbleCantillation: 0, garbleRepeatedFunctionWord: 1, garbleMarkup: 0, garbleReplies: 2,
  });
  assert.deepEqual(GARBLE_TELEMETRY_KEYS, ['garbleForeignScript', 'garbleMixedScriptToken', 'garbleCantillation', 'garbleRepeatedFunctionWord', 'garbleMarkup', 'garbleReplies']);
  assert.deepEqual(countGarbledReplies([]), Object.fromEntries(GARBLE_TELEMETRY_KEYS.map((k) => [k, 0])));
  assert.deepEqual(countGarbledReplies(null), Object.fromEntries(GARBLE_TELEMETRY_KEYS.map((k) => [k, 0])));
  assert.deepEqual(countGarbledReplies([{ student: 'נועה' }, { message: 42 }]), Object.fromEntries(GARBLE_TELEMETRY_KEYS.map((k) => [k, 0])));
});

// ─── Endpoint: telemetry fields, no behaviour change ─────────────────────────

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const messages = [
  { role: 'system', content: 'S' },
  { role: 'user', content: 'יובל, תן או תני דוגמה למלבן שאינו ריבוע.', name: 'Teacher' },
];

test('/api/generate: garbled replies are counted in content-free telemetry and returned verbatim after one attempt', async () => {
  const output = JSON.stringify({ responses: [
    { student: 'יובל', message: 'הבנתי לגmרי! למשל מלבן של 3 ס״מ על 5 ס״מ.' },
    { student: 'תמר', message: 'איזה יظה, הם לא חוצים זה את את האמצע' },
    { student: 'נועה', message: 'סוף סוף הבנתי.' },
  ] });
  srv.fakeModel.respond = () => textResult(output);
  const res = await postJson(srv.baseUrl, '/api/generate', { messages });
  assert.equal(res.status, 200);
  assert.equal(res.body.text, output, 'returned verbatim: nothing rewritten, dropped or reordered');
  assert.equal(srv.fakeModel.calls.length, 1, 'no retry');
  const m = res.body.meta;
  assert.equal(m.attempts, 1);
  assert.deepEqual(GARBLE_TELEMETRY_KEYS.map((k) => m[k]), [1, 1, 0, 1, 0, 2]);
  // existing duplicate-guard and quote-cut telemetry unchanged
  assert.equal(m.duplicateOutcome, 'none');
  assert.equal(m.duplicateRetries, 0);
  assert.equal(m.quoteCutSuspected, 0);
  assert.equal(m.quoteCutPaddedAttempts, 0);
});

test('/api/generate: clean output reports all garble counters as 0', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify({ responses: [{ student: 'יובל', message: 'האלכסונים AC ו-BD שווים, 90° בכל פינה, בְּזָווית ישרה.' }] }));
  const res = await postJson(srv.baseUrl, '/api/generate', { messages });
  for (const k of GARBLE_TELEMETRY_KEYS) assert.equal(res.body.meta[k], 0, k);
});

test('/api/generate: telemetry carries no text, token or raw output (integers only)', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify({ responses: [{ student: 'נועה', message: 'ע체יו לגmרי ל֤ני $x$ את את' }] }));
  const res = await postJson(srv.baseUrl, '/api/generate', { messages });
  for (const k of GARBLE_TELEMETRY_KEYS) assert.ok(Number.isInteger(res.body.meta[k]) && res.body.meta[k] >= 0, k);
  const metaText = JSON.stringify(res.body.meta);
  for (const fragment of ['체', 'לגmרי', 'ל֤ני', '$x$', 'את את']) assert.ok(!metaText.includes(fragment), fragment);
});

test('/api/generate: a garbled reply does not trigger a duplicate re-ask or any other attempt', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify({ responses: [{ student: 'נועה', message: 'אמм... אז ריבוע הוא גם מלבן?' }] }));
  const res = await postJson(srv.baseUrl, '/api/generate', { messages });
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.meta.garbleForeignScript, 1);
  assert.equal(res.body.meta.duplicateRetries, 0);
});

test('/api/generate: when the duplicate guard drops a reply, garble counters describe the returned output', async () => {
  const earlier = 'אני חושבת שריבוע הוא לא מלבן כי הוא נראה אחרת לגמרי';
  const dupMessages = [
    { role: 'system', content: 'S' },
    { role: 'user', content: 'האם ריבוע הוא מלבן?', name: 'Teacher' },
    { role: 'assistant', content: earlier, name: 'נועה' },
    { role: 'user', content: 'אוקיי', name: 'Teacher' },
  ];
  const out = JSON.stringify({ responses: [{ student: 'נועה', message: earlier }, { student: 'תמר', message: 'הבנתי לגmרי' }] });
  srv.fakeModel.respond = () => textResult(out);
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: dupMessages });
  assert.equal(res.body.meta.duplicateOutcome, 'dropped');
  assert.deepEqual(JSON.parse(res.body.text).responses.map((r) => r.student), ['תמר']);
  assert.equal(res.body.meta.garbleMixedScriptToken, 1);
  assert.equal(res.body.meta.garbleReplies, 1);
});

test('/api/generate: failure responses keep their existing telemetry shape (no garble fields)', async () => {
  srv.fakeModel.respond = () => textResult('not json');
  const res = await postJson(srv.baseUrl, '/api/generate', { messages });
  assert.equal(res.status, 500);
  for (const k of GARBLE_TELEMETRY_KEYS) assert.equal(k in res.body.meta, false, k);
});
