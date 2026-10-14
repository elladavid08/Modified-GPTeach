# Student-prompt examples: content-neutral replacement (A/B experiment)

Status: **implemented in 1.3.12** (2026-10-12; see §9). The experiment itself ran against `SYSTEM_VERSION 1.3.11` (committed tree `c3a59c2`), on a local unmodified `server/server.js` with real Gemini, using synthetic replay contexts only. Production code, `SYSTEM_VERSION` and Firestore were not touched, and no participant data was used.

## Summary

- **Verbatim copying:** the 1.3.11 whole-turn copy at 6a T6 **did not reproduce** under the current examples (0 of 15 trials). It is rare.
- **Example-anchored echoes:** under the current examples, 2 replies echoed EXAMPLE 1, both by the student in cast position 1, with EXAMPLE 1's square/rectangle content. Under the neutral examples there were **0** such echoes.
- **No downside observed for the neutral set:**
  - schema validity: 100% in both conditions;
  - no placeholder or bracket leakage; no invalid names;
  - the same participation by cast position and persona baseline;
  - the same confusion expression under confused PCK;
  - a similar premature-correctness count at T2 (3 vs 3–4);
  - the same length;
  - latency equal or lower.
- **Recommendation:** replace the three examples with the neutral set as a small, separately versioned change (**1.3.12**) **before** the Mode B baseline, so the baseline runs on the prompt that will be studied. The exact diff is in §8.

## 1. The current examples (`src/utils/ai.js` `makeProsePrompt`)

```
EXAMPLE 1 - Student understood the explanation:
{ "responses": [{"student": "${students[0].name}", "message": "אה עכשיו הבנתי! אז כל ריבוע הוא גם מלבן כי יש לו 4 זוויות ישרות?"}] }

EXAMPLE 2 - Student still confused after explanation:
{ "responses": [{"student": "${students[1].name}", "message": "רגע, אני עדיין לא מבין למה דווקא במעויין האלכסונים מאונכים. מה המיוחד במעויין?"}] }

EXAMPLE 3 - Student THINKS understood but has misconception:
{ "responses": [{"student": "${students[2].name}", "message": "אוקיי, אז אם אני רואה מרובע שהאלכסונים שלו מאונכים, אני יודע שזה מעויין, נכון?"}] }
```

### 1.1 What each example teaches

| aspect | EX1 | EX2 | EX3 | useful? |
|---|---|---|---|---|
| Output JSON structure (`responses: [{student, message}]`) | ✓ | ✓ | ✓ | **yes, keep** |
| How many students respond | one | one | one | **yes:** one reply is a valid turn (not all three) |
| Student names | `students[0]` | `students[1]` | `students[2]` | **no:** binds a reaction type to a cast position; 6a T6 copied by position |
| Relation to the teacher's message | reacts to an explanation | reacts to an explanation, names the specific unclear part | applies the explanation wrongly | **yes, keep** the three reaction types |
| Reaction / state behaviour | understanding + a follow-up inference | honest confusion + a specific "why / what is special" question | confident over-generalisation ("…, נכון?") | **yes, keep** (mirrors PCK `improved` / `confused` / `misconception_reinforced`) |
| Participation / turn-taking | single student per example, different students across examples | | | partly; "different students" is the anchoring problem |
| Geometry / lesson content | **scenario 1 target** (square ⊂ rectangle) | **scenario 2 / 6 topic** (rhombus diagonals) | **scenario 2 misconception** (perpendicular ⇒ rhombus) | **no:** lesson-content leakage |
| Gendered Hebrew | neutral ("הבנתי") | **masculine** "אני … מבין" | **masculine** "אני יודע" | **no:** leaked into a female persona at 6a T6 |
| Sentence shapes | "אה עכשיו הבנתי! אז … כי …?" | "רגע, … למה דווקא …? מה המיוחד ב…?" | "אוקיי, אז אם …, … נכון?" | **yes, keep:** natural, age-appropriate shapes |

## 2. The candidate content-neutral set (B)

```
EXAMPLE 1 - Student understood the explanation:
{ "responses": [{"student": "<שם של אחד מהתלמידים ברשימה>", "message": "אה, עכשיו הבנתי! אז [המסקנה מההסבר] כי [הסיבה שהמורה נתן/ה]?"}] }

EXAMPLE 2 - Student still confused after explanation:
{ "responses": [{"student": "<שם של אחד מהתלמידים ברשימה>", "message": "רגע, עדיין לא ברור לי למה דווקא [החלק המסוים שלא הובן]. מה מיוחד ב[מה שהמורה הזכיר]?"}] }

EXAMPLE 3 - Student THINKS understood but has misconception:
{ "responses": [{"student": "<שם של אחד מהתלמידים ברשימה>", "message": "אוקיי, אז בכל פעם ש[תכונה אחת מתקיימת], זה בטוח [מסקנה רחבה מדי], נכון?"}] }
```

| decision | reason |
|---|---|
| Same three labels, same order, same JSON lines | Schema and reaction-type teaching preserved; nothing else in the prompt changes |
| One student per example | Preserves "one reply is a valid turn" |
| Name → one generic placeholder for all three | Removes the `students[0..2]` ↔ example binding |
| Geometry → bracketed slots describing the function ("[המסקנה מההסבר]", "[מסקנה רחבה מדי]") | No lesson content can leak, and a bracketed slot cannot be copied verbatim naturally. Each slot says what belongs there. |
| Kept sentence shapes ("אה, עכשיו הבנתי! אז … כי …?", "רגע … למה דווקא …? מה מיוחד ב…?", "אוקיי, אז בכל פעם ש… זה בטוח …, נכון?") | They carry the reaction-type behaviour and sound like Israeli 7th–9th graders |
| "אני עדיין לא מבין" → "עדיין לא ברור לי"; "אני יודע" → "זה בטוח"; "נתן/ה" | Gender-neutral first person; the one teacher reference is slash-gendered |
| EX3 keeps a generic over-generalisation ("in every case where one property holds, it is surely …") | Teaches the misconception *pattern* without encoding any of the six scenario misconceptions |
| Same length class (about 60–85 characters) | Avoids nudging reply length |

**Not changed:** the "❌ WRONG – repeating question" example (`students[0]`, "אבל ריבוע זה מלבן?") and the illustrative phrases in the CRITICAL CONVERSATION RULES, for example "אה, אז כל מרובע עם אלכסונים מאונכים זה מעויין!". These are outside the three examples, so the instructions kept them unchanged. They still carry geometry content and masculine forms; see §7.

## 3. Experiment design

- **Path:** the real `getPCKFeedback` → `callAI` → `/api/generate`, on the committed 1.3.11 tree with production settings (temperature 0.7, 512 tokens, schema, C8 history, C9 silent checklist, 1.3.10 rule, 1.3.11 duplicate guard).
- **The only difference between conditions:** the three example lines. They were rewritten benchmark-side in the outgoing request. A diff of the captured system prompts showed exactly 3 changed lines, and the rewrite asserted exactly one match per line on every call.
- **Paired design:** each context gets one frozen real PCK analysis, reused for both conditions; 25 of 31 matched the historical level. The condition order alternates per repetition.
- **Contexts** (rebuilt from the imported historical replays, `replay_harness/results/historical-1.3.*`; synthetic only):
  - **6a T6, exactly the 1.3.11 copy context:** cast [תמר, יונתן, עדי], teacher "נכון", PCK `problematic / more_confused`. **15 trials per condition.**
  - **Broad: 30 contexts,** 6 scenarios × 5 turn types:
    - T2 direct question;
    - T5 explanation;
    - T6 short validating ack;
    - T10 content question to student C;
    - T12 closing.

    Rotated over the 1.3.9 / 1.3.10 / 1.3.11 runs and both historical casts, giving a mix of PCK levels (same, confused, more_confused, misconception_reinforced, improved), one- and multi-student turns, and short vs long teacher messages. **2 trials per condition.**
- **Total:** 150 student calls (75 per condition), plus 31 PCK calls.
- **Example-copy detector** (analysis only; not in production). Each reply is compared with all six example messages (A and B) using:
  - normalized equality;
  - edit similarity;
  - token Jaccard;
  - shared 6-word sequences.

  A reply is flagged if edit ≥ 0.6, Jaccard ≥ 0.5 or a shared 6-gram; edit ≥ 0.9 counts as verbatim. Every flag was reviewed manually.
- **Other measures:**
  - cast-position-specific copy (the flagged example is the one bound to that student's position);
  - gender-form leakage (female persona with masculine first-person forms, or the reverse; forms spelled the same in both genders excluded);
  - placeholder or bracket leakage;
  - names;
  - responders;
  - addressed-student reply;
  - confusion / understanding markers by PCK level;
  - length;
  - latency;
  - attempts and duplicate-guard outcomes.

## 4. A/B results

| measure | A (current) | B (neutral) |
|---|---|---|
| calls / errors / invalid JSON | 75 / 0 / 0 | 75 / 0 / 0 |
| replies (per call) | 151 (2.01) | 147 (1.96) |
| calls with no reply | 1 | 1 |
| invalid / out-of-cast student names | 0 | 0 |
| placeholder or bracket leakage | n/a | **0** |
| **verbatim example copies (edit ≥ 0.9)** | **0** | **0** |
| example-like replies (flag), all | 2 | 0 vs A examples; 0 vs B examples |
| **cast-position-specific example echoes** | **2** (both EX1 by `students[0]`) | **0** |
| gender-form leakage | 0 | 0 |
| openers copied from the examples ("אה עכשיו הבנתי…", "רגע, אני עדיין לא מבין למה דווקא", "אוקיי, אז אם אני רואה" / B equivalents) | 0 | 0 |
| addressed student replied | 23/24 | 24/24 |
| replies by cast position (broad contexts) | 41 / 34 / 42 | 40 / 36 / 44 |
| replies by persona baseline high / medium / low (broad) | 26 / 56 / 35 | 24 / 60 / 36 |
| responders per call 0 / 1 / 2 / 3 (broad) | 1 / 15 / 30 / 14 | 1 / 14 / 29 / 16 |
| confusion markers in `confused` / `more_confused` contexts, broad | 8/28 | 10/32 |
| understanding markers in `improved` contexts, broad | 15/54 | 11/52 |
| premature correctness at T2 (slot A confidently correct before T5; 12 trials each) | 3 (s1 ×1, s6 ×2) | 3–4 (s1 ×2, s4 ×1, s5 ×1 borderline "…, נכון?") |
| teacher-attribution regex hits ("אמרת / המורה …") | 9 | 10 |
| mean reply length (characters) / replies under 30 characters | 75 / 21 | 75 / 18 |
| student latency p50 / p90 / max (ms) | 1,242 / 1,937 / 3,106 | 1,223 / 1,687 / 2,663 |
| calls with 2 attempts (duplicate re-ask) / guard outcomes | 5 / resolved 5 | 4 / resolved 4 |

**Per turn type (broad):** lengths, responders and markers are similar for T2, T5, T6, T10 and T12 in both conditions. For example, T12 closings average 26 vs 33 characters, with 20 vs 18 short replies.

## 5. Prompt-example similarity findings

- **The two flagged echoes under A:**
  - **6a T6, trial 10, תמר (position 1 = EXAMPLE 1's slot):** "כן! הבנתי! אז כל ריבוע הוא גם מלבן וגם מעוין, כי הוא מקיים את כל ההגדרות!" Shared 6-gram with EX1, edit 0.53. EX1's sentence frame and square/rectangle content, in the kite/rhombus lesson.
  - **s3 T5, trial 0, יונתן (position 1):** "אה, אז זה אומר שכל ריבוע הוא באמת מלבן, כי יש לו ארבע זוויות ישרות. הבנתי!" Edit 0.57, Jaccard 0.55. In scenario 3 this content is on-topic, but the phrasing follows EX1.
- **Under B,** no reply was similar to any A or B example. One A-condition reply shares a 6-gram with B's EX2 frame ("עדיין לא ברור לי למה דווקא"): that is ordinary Hebrew, not a copy.
- **Square/rectangle analogies in scenario 6** appear in **both** conditions (4 replies each at 6a). Square ⊂ rectangle is the natural analogy for an inclusion relation, so it is not, by itself, evidence of example leakage. The *frame-plus-content echo by the slot-bound student* happened only under A.
- **The 1.3.11 whole-turn copy did not reproduce** under A in 15 trials. It stays a rare event (once in about 2,100 earlier turns, never in 3,163 pilot replies), so this experiment cannot show a reduction in that event's frequency. It shows that its two ingredients — cast-position-bound examples and lesson-content sentences — are absent in B and leave no detectable trace.

## 6. Qualitative review

All 30 outputs at 6a T6 and the paired rep-0 outputs of all 30 broad contexts were read (one reviewer).

- **Not generic:** B replies are as specific to the lesson and the teacher's move as A replies. Examples:
  - s4 T10 B: "כי במעוין כל הצלעות שוות, אז המשולשים שנוצרים מהאלכסון הם שווי שוקיים…";
  - s5 T6 B: "אז למה קודם אמרת שזה מספיק? אני ממש מבולבלת עכשיו."
- **Not shorter:** the same mean length; closings are not truncated.
- **Not more agreeable:**
  - misconceptions persist under B where PCK says so (s6 T2 יונתן: "אני לא חושב שמעוין הוא דלתון"; s4 T6 דנה: "אם האלכסון מחלק את הזווית של ה-90 מעלות לשתיים, זה אמור להיות 45");
  - a similar premature-correctness count. The instances fall in different contexts: B's s4 T2 מעיין answered correctly at once, where A was uncertain in both trials, while A's s6 T2 תמר was decisive in both trials and B's hedged.
- **Teacher attributions:** at 6a under B, one reply misparaphrases the teacher (יונתן, trial 12: "זה כמו שהמורה אמרה, שהגדרה של דלתון היא תנאי מספיק כדי להיות מעוין… לא, רגע"). The student corrects themselves within the same reply. This is consistent with the `more_confused` PCK state, not an invented teacher statement in the C9 sense, but it is noted. Another hit ("כמו שאמרתי") is a self-reference.
- **Responsiveness:** addressed students answer (24/24), and answers react to the current move.
- **Persona and PCK fidelity:** comparable. One local difference:
  - **What happened:** at 6a T6, B produced more single-student turns (7/15 vs 1/15), mostly יונתן alone, and the low-participation persona עדי spoke less (7/15 vs 13/15). Confusion markers there were 7/27 vs 15/34.
  - **Why it is not a regression:** B's single replies still express the confused state in 9 of the 15 trials ("זה מבלבל", "אני עדיין לא מבין"), and עדי's lower participation fits her `low` baseline. Under A, עדי is literally the named student of EXAMPLE 3, which plausibly pulls her in.
  - **Broader evidence:** across the 30 broad contexts, participation by position and baseline is the same in A and B.
- **No meta leakage:** no placeholders, brackets or "example" language appeared in any output.

## 7. Limitations

- **Small, single-sample comparison.** 75 calls per condition, with 2 trials per broad context. The rare event cannot be shown to be reduced statistically.
- **PCK frozen per context.** It was regenerated, so 6 of 31 levels differ from the historical run.
- **Manual review by one reviewer;** the marker counts are heuristic.
- **Out of scope here:** the "WRONG" example and the illustrative rule phrases still contain geometry content (scenario 1 and scenario 2 wording) and masculine forms ("אני עדיין לא מבין", "אני לא בטוח שהבנתי"). They are not position-bound in the same way (the WRONG example is bound to `students[0]`). They should be reviewed in a follow-up with the same method.

## 8. Recommendation

**Replace the three examples before the Mode B baseline,** as a separately versioned change (1.3.12):
- it removes cast-position anchoring, lesson-content leakage and gendered forms by construction;
- no behavioural, schema or latency regression was observed;
- doing it first means the baseline measures the prompt that explicit-state work will start from.

**Exact proposed production diff** (`src/utils/ai.js`; not applied):

```diff
 	retStr += `\nEXAMPLE 1 - Student understood the explanation:`;
 	retStr += `\n{`;
-	retStr += `\n  "responses": [{"student": "${students[0].name}", "message": "אה עכשיו הבנתי! אז כל ריבוע הוא גם מלבן כי יש לו 4 זוויות ישרות?"}]`;
+	retStr += `\n  "responses": [{"student": "<שם של אחד מהתלמידים ברשימה>", "message": "אה, עכשיו הבנתי! אז [המסקנה מההסבר] כי [הסיבה שהמורה נתן/ה]?"}]`;
 	retStr += `\n}`;
 	retStr += `\n`;
 	retStr += `\nEXAMPLE 2 - Student still confused after explanation:`;
 	retStr += `\n{`;
-	retStr += `\n  "responses": [{"student": "${students[1].name}", "message": "רגע, אני עדיין לא מבין למה דווקא במעויין האלכסונים מאונכים. מה המיוחד במעויין?"}]`;
+	retStr += `\n  "responses": [{"student": "<שם של אחד מהתלמידים ברשימה>", "message": "רגע, עדיין לא ברור לי למה דווקא [החלק המסוים שלא הובן]. מה מיוחד ב[מה שהמורה הזכיר]?"}]`;
 	retStr += `\n}`;
 	retStr += `\n`;
 	retStr += `\nEXAMPLE 3 - Student THINKS understood but has misconception:`;
 	retStr += `\n{`;
-	retStr += `\n  "responses": [{"student": "${students[2].name}", "message": "אוקיי, אז אם אני רואה מרובע שהאלכסונים שלו מאונכים, אני יודע שזה מעויין, נכון?"}]`;
+	retStr += `\n  "responses": [{"student": "<שם של אחד מהתלמידים ברשימה>", "message": "אוקיי, אז בכל פעם ש[תכונה אחת מתקיימת], זה בטוח [מסקנה רחבה מדי], נכון?"}]`;
 	retStr += `\n}`;
```

**What implementing it also requires:**
- **Version:** a `SYSTEM_VERSION` bump to 1.3.12, with a changelog entry.
- **Tests that pin the old text:**
  - `studentAgent.test.js` asserts the old EX1 line (`"message": "אה עכשיו הבנתי!` with `students[0].name`). Update it to pin the new lines, and add a test that no example line contains a cast name.
  - The 1.3.10 PCK-block fingerprint test is unaffected, since the examples sit outside the PCK block.
- **Harness:**
  - `PROMPT_EXAMPLES` in `replay_harness/lib/labels.js` and its drift test must list the new examples. Keep the old ones too, so historical runs can still be measured.
  - Bump `HARNESS_VERSION`.
- **Afterwards:** run Mode A once as the regression check, then the Mode B baseline on 1.3.12.

Experiment files (scratchpad, not in the repo): `c18/examples.bench.js`, `c18/analyze.py`, `c18/ab_results.json`, `c18/ab_labeled.json`, `c18/frozen_pck.json`, `c18/prompt_samples.json`.

## 9. Implementation (1.3.12, 2026-10-12)

The candidate set B was added **verbatim** to `src/utils/ai.js` (`makeProsePrompt`), exactly as in §8, in version **1.3.12** (`src/config/version.js` changelog). Nothing else in the student prompt changed: the WRONG example, the rule phrases, PCK steering, C8 / C9, the 1.3.10 rule, the duplicate guard, model and config, and personas are all untouched.

**Tests** (`src/__tests__/studentAgent.test.js`; written first, 4 failing before the change):
- the three neutral examples appear verbatim, once each, under their unchanged labels;
- no example names a cast member, and none contains the old messages, geometry words or masculine forms; the WRONG example is still present and bound to `students[0]`;
- **the rest of the prompt is byte-identical to 1.3.11:** restoring the three old lines gives the pinned SHA-256 of the 1.3.11 prompt, with and without PCK guidance;
- the C9 example assertion was updated to the new EXAMPLE 1; the 1.3.10 PCK-block and persona fingerprints still pass.

**Harness** (HARNESS_VERSION 1.0.0 → 1.1.0):
- `lib/labels.js` keeps both sets: `PROMPT_EXAMPLES_1_3_11` (slot-bound) and `PROMPT_EXAMPLES` (neutral, `slot: null`);
- `promptExamplesFor(systemVersion)` picks the set of the run's version, or both sets if the version is unknown, and `analyze.js` passes the manifest's `systemVersion`;
- new automatic labels: `placeholder_leak` and `invalid_student`;
- the isolation test checks that the neutral set is in production, the old EX1–EX3 are not, and the mapping matches `SYSTEM_VERSION`;
- the historical runs re-labelled unchanged (1.3.11: 7 example copies, 2 verbatim at 6a T6).

**Results:** harness unit tests 55/55. `npm run test:all` was run twice and passed both times (193 frontend, 192 backend).

**Live Mode A smoke run** (`results/smoke-A-1.3.12`, git-ignored; HARNESS_VERSION 1.1.0). Scenarios 2 and 6, historical cast 0, so conversation 6a is included. That is 2 conversations, 24 turns and 43 replies:
- 0 student or PCK failures; at most 1 attempt (student and PCK);
- 0 invalid names, 0 placeholder or bracket leaks;
- 0 prompt-example copies (old or new set), 0 exact self-duplicates, 0 guard matches;
- `duplicateOutcome` was reported on all 24 student calls (`none` ×24); no re-ask was triggered. The re-ask path itself is covered by the server tests.
- Student latency p50 / p90: 1,336 / 1,699 ms.
- **PCK and confusion:** PCK levels were same 5, confused 3, improved 8, misconception_reinforced 3, more_confused 5. Confused turns show confusion (s2 T2–T4; s6 T5–T6, including the 6a T6 "נכון" turn, with no copying), and improved turns show understanding.
- **Known pre-existing pattern:** at s6 T7, תמר says "הבנתי" under `misconception_reinforced`. The same pattern occurs at s6 T7 in all three historical runs (1.3.9–1.3.11), so it is not caused by the new examples.
