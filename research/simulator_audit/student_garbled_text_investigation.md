# Garbled student text with `gemini-3.5-flash-lite`: investigation

Status: investigation only, 2026-10-12, on committed **1.4.1** (`28a9a68`).
- No production change, no `SYSTEM_VERSION` bump.
- Synthetic data only (replay-harness outputs and live calls on synthetic contexts); no participant data; nothing written to Firestore.

## Summary

- **What:** about **2% of 3.5 Flash-Lite student replies** contain visible corruption (34 of 1,608 replies in 75 synthetic conversations; 28 of 75 conversations have at least one):
  - a letter from another script inside a Hebrew word ("איזה יظה", "אמм", "ע체יו", "הזواיות", "לדรายละเอียด");
  - a Latin letter inside a Hebrew word ("לגmרי");
  - a doubled function word ("חוצים זה את את זה");
  - Hebrew cantillation marks ("ל֤ני");
  - one LaTeX string;
  - one speaker name corrupted ("מעוין" for מעיין).
- **Origin:** the corruption is **already in the raw Vertex response**. Our server and client never transform student text (§2.3). In the live reproduction, the raw outputs and the replies the client produced contain exactly the same corrupt replies (49 = 49; 50 = 50).
- **Model-specific:** **0** such cases in 1,191 replies from 2.5 Flash-Lite, in 324 replies from 3.1 Flash-Lite as the student (with the same MINIMAL thinking and no temperature / topP), and in 555,000 characters of 3.1 PCK Hebrew output.
- **Root cause, best evidence:** a token-level decoding defect of 3.5 Flash-Lite in Hebrew.
  - In particular contexts the model gives high probability (up to about 50%) to a *phonetically equivalent token from another script* for a specific Hebrew word: מ → Latin *m* / Cyrillic *м*, "יופי" → Arabic *ف* / *ظ*.
  - It also sometimes repeats "את" in "זה את זה".
  - It is reproducible per context: the same word is corrupted again and again (§4).
  - It does not correlate with output length, token limit, retries, the duplicate guard, PCK state or finish reason.
  - It is **not reduced by temperature 0.7** (49 of 1,089 vs 50 of 1,101 replies).
- **A conservative detector is feasible:**
  - **Precision:** six content-free rules flag all 34 saved cases, plus 99 of 99 in the reproduction, with **0 false positives** on 1,515 replies from other models, 7,454 PCK Hebrew strings, and 24 hand-written legitimate edge cases.
  - **Recall:** it misses word-level substitutions written in Hebrew letters ("הצצלעות", "שעות שונה", "ישנות").
- **Recommended next step:** a detection-only, content-free garble counter in student telemetry (like the 1.3.13 quote-cut counters). After that, decide with data whether a high-confidence garble should use the existing second attempt.

## 1. Characterisation of the saved outputs

**Corpus:** every replay-harness run except `historical-*` and the superseded and duplicate 1.3.12 runs. Student model by run:

| student model | runs | conversations | replies | flagged |
|---|---|---:|---:|---:|
| `gemini-2.5-flash-lite` | 1.3.12 final baseline, bakeoff A, 1.3.11 smoke runs | 52 | 1,191 | **0** |
| `gemini-3.1-flash-lite` | bakeoff B (+ smoke) | 13 | 324 | **0** |
| `gemini-3.5-flash-lite` | 1.4.0 and 1.4.1 baselines, bakeoff C and D (+ smokes) | 75 | 1,608 | **34 (2.1%)** |

**The 34 flagged 3.5 replies, by category** (one reply can be in more than one; all 34 checked by hand, all genuine corruption):

| category | replies | examples |
|---|---:|---|
| foreign script inside a Hebrew word | 11 | Arabic: "הזواיות", "זواות", "בזوויות", "חاضה", "לגופها", "מקايים", "יظה"; Cyrillic: "אמм", "הכла"; Thai: "לדรายละเอียด" (the Thai word for "details", in "לרדת לפרטים"); Korean: "ע체יו" |
| Latin letter inside a Hebrew word | 11 | "לגmרי" ×10, "ששdo" |
| doubled function word | 7 | "חוצים זה את את (זה / האמצע / השני)" ×6, "לחצות זה את את באמצע" |
| cantillation mark | 2 | "אמרת ל֤ני לפגע", "כ֕מו" |
| LaTeX / markup | 1 | "וכתוב גם ש-$AC = BD$" |
| digit inside a Hebrew word | 1 | "שש3 התנאים" |
| student-name corruption | 1 | speaker "מעוין" instead of the cast member מעיין (1.4.0 run 2, s6 cast 0 T12) |

**Not detectable by script rules:** reading the 1.4.0 and 1.4.1 transcripts in full (§12–§13 of `student_stability_replay.md`) also found word-level substitutions written in Hebrew letters, about 7 seen:
- "הצצלעות";
- "נראה שעות שונה";
- "שווות";
- "הזוויות הן ישנות" (for ישרות);
- "מ מקיימים";
- a word cut to "בש,".

**Spread:**
- 34 affected turns of 900; 28 of 75 conversations.
- Never more than one corrupted reply per turn.
- 0 such cases in PCK output (3.1; 1,584 analyses).

**Hot words:**

| | correct | corrupted | rate |
|---|---:|---:|---:|
| "לגמרי" | 132 | 10 ("לגmרי") | 7% |
| "זה את זה" | 204 | 9 ("את את") | 4% |
| "זווית" / "זוויות" | 482 | 3 (Arabic letters) | under 1% |
| "עכשיו" | 245 | 1 | under 1% |

## 2. Possible causes

### 2.1 Call and context features (3.5, 1,608 replies)

| feature | garbled replies | clean replies |
|---|---|---|
| finish reason | 34 of 34 `STOP` | — |
| attempts | 34 of 34 on 1 attempt (0 of 5 two-attempt calls) | — |
| duplicate guard | 34 of 34 `none` | — |
| reply length mean / median | 92 / 82 characters | 84 / 80 |
| call output tokens (1.4.x) median / max | 121 / 414 (limit 512) | 123 |
| prompt tokens (1.4.x) mean | 7,348 | 7,070 |
| latency mean | 1.39 s | 1.33 s |
| thinking tokens | 0 | 0 |
| PCK level at that turn | improved 22, same 12 (2.1% / 2.4%) | — |
| PCK feedback shown | 1.9% | 2.4% |
| turn | T1–T5 1.1–1.8%; **T6–T8 3.6–4.2%**; T9–T12 1.4–2.3% | — |
| scenario | s1 1.2%, s2 1.1%, s3 2.8%, s4 2.1%, **s5 4.9%**, s6 1.2% | — |
| run | 0.8–4.3% (bakeoff D highest) | — |

- **No association** with length, token limit, retries, the duplicate guard, PCK state, finish reason or latency.
- **The turn and scenario pattern follows the vocabulary:**
  - **s5:** "חוצים זה את זה", where "את את" occurs, is a key phrase there.
  - **T6–T8:** "הבנתי לגמרי", "איזה יופי", "סוף סוף הבנתי" follow the explanation.

### 2.2 Configuration

- **MINIMAL thinking and sampling defaults:** 3.1 Flash-Lite as the student ran with the same MINIMAL thinking and the same omitted temperature / topP (bakeoff B), and produced 0 cases in 324 replies. At 3.5's rate about 7 would be expected (Poisson p ≈ 0.001).
- **Temperature:** temperature 0.7 was tested directly (§4) and made no difference.

So the defect is in the 3.5 model, not in the shared configuration.

### 2.3 Our code never transforms student text

- **Server** (`/api/generate`):
  - `interpretCandidate` takes `candidates[0].content.parts[0].text`, which is the whole text: every observed 3.x response has exactly one part (`text` + `thoughtSignature`), 1,281 of 1,281 calls.
  - `validateStudentOutputText` only parses and validates.
  - The response text is returned verbatim. When the duplicate guard drops a reply it is re-serialised with `JSON.stringify`, which preserves every character.
- **No text processing:** there is no Unicode normalisation, transliteration or re-encoding anywhere in the path.
- **Client** (`src/utils/ai.js` `convertResponseToMessages`): `JSON.parse`, `toTitleCase(name)` (a no-op on Hebrew) and `message.trim()`. `ChatMessage` removes `\n` from student text. The harness stores `ChatMessage.text` as it is.
- **The substituted characters are distinct code points** (Arabic, Cyrillic, Hangul, Thai, Latin). No normalisation form (NFC / NFD) produces them from Hebrew.
- **Live proof (§4):** the corrupted words are present in the captured raw Vertex text before any parsing, and the client-parsed replies contain the same corrupt replies (A 49 = 49; T 50 = 50).

## 3. Reproduction method

- **Contexts:** the 16 corrupted student turns from the 1.4.0 and 1.4.1 baselines, plus 16 randomly chosen clean turns from the same runs (seed 7).
- **Rebuilt exactly** as the replay harness built them:
  - history with drawings;
  - the cast personas;
  - scenario and first-turn addendum;
  - **the PCK analysis the students received at that turn** (display-normalised as the server returned it).
- **Path:** sent through the real client `callAI` to a local, **unmodified** 1.4.1 server.
- **Capture:** an analysis-only preload captured each raw student Vertex response before parsing: full text, number and kind of parts, finish reason, tokens, model version, latency.
- **Repeats:** 20 calls per context per arm.
- **Arms:**
  - **A:** current production (no temperature / topP, MINIMAL thinking);
  - **T:** identical plus `temperature: 0.7` on student calls only (the pre-migration value; no prompt change).
- **Volume:** 1,281 student calls; all `STOP`, valid JSON, one part, 0 thinking tokens, model `gemini-3.5-flash-lite`; median 107 output tokens (max 409); median 1.45 s.

## 4. Reproduction results

| | A (current) | T (temperature 0.7) |
|---|---:|---:|
| calls / replies | 640 / 1,089 | 641 / 1,101 |
| garbled replies (raw) | **49 (4.5%)** | **50 (4.5%)** (z = −0.05, p = 0.96) |
| garbled replies after client parsing | 49 | 50 |
| previously garbled contexts (16) | 47 / 609 (7.7%) | 50 / 611 (8.2%) |
| random clean contexts (16) | 2 / 480 (0.4%) | 0 / 490 |
| invalid JSON / non-STOP / multi-part | 0 / 0 / 0 | 0 / 0 / 0 |
| duplicate re-asks | 0 | 1 |
| mean reply length | 87.9 | 88.0 |

**Corruption depends on the context and the word.** The same word is corrupted again and again within a context (both arms pooled):

| context | corrupted form (count of replies) | rate |
|---|---|---:|
| 1.4.1 r2 s3 cast 0 T7 | "אמм…" (17) | 17 / 74 |
| 1.4.1 r2 s2 cast 0 T6 | "איזה יופי" → "יظה", "יظ", "יف", "יزه", "יمنה", "י킴" (28) | 28 / 99 |
| 1.4.1 r2 s2 cast 1 T8 | "זה את את זה" (17), "הצلاֹת" (1) | 18 / 97 |
| 1.4.0 r2 s6 cast 0 T12 | speaker "מעוין" for מעיין (11; once "איפה מעוין? אני מעיין!") | 11 / 118 |
| 1.4.0 / 1.4.1 s5 contexts | "זה את את (האמצע / השני / זה)" (10), "שوهים", "שנكון", "ל-$90$" | — |
| "הבנתי לגמרי" contexts | "לגmרי" (8, including 2 in a "clean" context) | — |
| 1.4.0 r1 s1 cast 0 T7 (Thai) and r1 s1 cast 1 T6 (Thai) | not reproduced (0 / 40, 0 / 110) | — |

**Interpretation:**
- **Phonetic substitutions:** they are phonetically equivalent tokens from other scripts (*m* / *м* for מ; *ف* for the f sound of פ in "יופי"; *ظ*, *ز*, *킴*). This is a decoding error inside the model's multilingual token space.
- **Not tail sampling:** in a hot context the wrong token has high probability (up to about 50% for "אמм"), which is why lowering the temperature to 0.7 changes nothing.
- **Elsewhere the rate is low:** about 0.2–0.4% of replies in random contexts. The 2% in the Mode B baselines comes from how often replies use the hot words ("לגמרי", "יופי", "אממ", "זה את זה", "זוויות") and from rarer one-off glitches.

## 5. Candidate detector (content-free; not implemented in production)

Counts per student reply, no text stored (scratchpad `c37/detector.mjs`):

| rule | flags | does not flag |
|---|---|---|
| `foreignScript` | any letter whose script is not Hebrew, Latin or Greek (Arabic, Cyrillic, Thai, Hangul, CJK, …) | Greek angle names (α, β), digits, punctuation, ״ ׳ |
| `mixedToken` | a token with Hebrew and Latin letters and no separator ("לגmרי") | "AC ו-BD", "ה-AC", "GeoGebra", "cm" |
| `cantillation` | U+0591–U+05AF | niqqud ("בְּזָווית") |
| `doubledFunctionWord` | the same function word twice with only a space ("את את"; list: את, של, על, עם, אם, כי, גם, אז, הוא, היא, הם, הן, זו, אל, או, אבל, כמו, יש, אין) | reduplication ("סוף סוף", "חצי חצי", "זוגות זוגות"), "בגלל זה זה", "לא, לא" |
| `markup` | `$…$`, `\cmd{`, `**…**`, HTML-like tags, code fences | — |
| `invalidSpeaker` | the reply's student name is not in the cast (needs the cast, so client-side) | — |
| (`digitInWord`, low confidence) | a Hebrew letter directly followed by a digit ("שש3") | "ב-3", "3 ס״מ", "ה-90", "3א" |

**Precision:**
- **0 false positives** on 1,191 2.5 replies, 324 3.1 replies, 7,454 PCK Hebrew strings (555,000 characters) and 24 hand-written legitimate cases (numbers, units, gershayim, labels such as AC / BD, English terms, niqqud, Greek, reduplication, "זה את זה זה").
- All 34 saved 3.5 flags and all 99 reproduction flags are genuine corruption.
- The first draft flagged legitimate reduplication; it was narrowed to function words before these counts.

**Recall:** all script-level corruption is caught. Word-level substitutions written in Hebrew letters (about 7 seen by hand) cannot be caught without a lexicon or model.

**Precise forms:**
- **Server-side (content-free counters):** `garbleForeignScript`, `garbleMixedToken`, `garbleCantillation`, `garbleDoubledWord`, `garbleMarkup` per student call. These are integers, like `quoteCutSuspected`.
- **Client-side:** `invalidSpeaker`. The server does not know the cast. The browser could also *drop* a reply under an unknown name rather than show a non-existent student, but that is a behaviour change.

## 6. Answers

1. **Root cause:** a token-level decoding defect in `gemini-3.5-flash-lite` for certain Hebrew words.
   - The model substitutes phonetically equivalent tokens from other scripts (*m* / *м* for מ, Arabic *ف* / *ظ* in "יופי", Thai or Korean pieces) and occasionally doubles "את" in "זה את זה".
   - It is context-dependent and reproducible (up to about 50% in a hot context).
   - It is absent in 2.5 and in 3.1 under the same configuration.
   - It is independent of output length, token limit, retries, the duplicate guard, PCK state and temperature (0.7 vs default).
   - The exact internal cause (tokenizer or decoding in the model) is not observable from outside.
2. **Observed frequency:**
   - **In the Mode B baselines:** 2.1% of 3.5 replies (34 of 1,608); 3.8% of turns; 28 of 75 conversations with at least one; about 0.45 corrupted replies per 12-turn conversation.
   - **In reproduction:** 0.2–0.4% in random contexts, 7.7% in previously affected contexts, up to 28–49% for specific context and word pairs.
   - **Not counted:** about 7 more Hebrew-letter word substitutions in the 1.4.x transcripts that no script rule can catch.
3. **Origin:** Gemini. The corruption is present in the raw Vertex text, and our code does not alter student text.
4. **Is a detector feasible?** Yes, with high precision: 0 false positives on about 9,000 clean strings. Script-level corruption is fully caught; Hebrew-letter typos are not.
5. **Does a config change reduce it?** Temperature 0.7: **no** (4.5% vs 4.5% on the same contexts; p = 0.96). No other configuration change was tested, per the scope. 3.1 as the student does not show the defect, but it is the model rejected for removing misconceptions before teaching (`student_model_bakeoff.md`).
6. **Smallest next production step:** **detection-only telemetry.**
   - Add the five content-free server-side garble counters to student-call telemetry (additive A17 fields; no retry, rewrite or drop), and an `invalidSpeaker` counter on the client.
   - This measures the production rate per word class without changing behaviour.
   - **Possible later step, not yet tested:** treat a high-confidence garble (`foreignScript`, `mixedToken`, `cantillation`, `invalidSpeaker`) as retryable invalid output within the existing 2-attempt policy. If two attempts are independent, the visible rate would fall roughly from p to p², about 0.2% overall, but hot contexts would still leak about 8–25%. It should be A/B tested first.
   - **Also worth doing:** file a vendor bug report with the reproducible contexts (synthetic).

## 7. Limitations

- 75 synthetic conversations; Mode B scripted teacher; six geometry scenarios. Hot words depend on vocabulary, so pilot-style conversations may differ.
- Only one configuration alternative (temperature 0.7) was tested. Thinking level and topP were not.
- Word-level Hebrew substitutions were found by reading, not measured systematically.
- Rates per hot context come from 20 calls per arm.

**Files** (scratchpad `c37/`): `detector.mjs`, `scan.mjs`, `hits_v3.json`, `correlate.mjs`, `rows.json`, `pck_scan.mjs`, `legit_check.mjs`, `contexts.json`, `student_capture.cjs` (raw-capture preload; arm T adds temperature 0.7), `bench/garble.bench.js`, `raw-{A,T}.jsonl`, `bench-{A,T}.jsonl`, `analyze.mjs`, `hot.mjs`.

## 8. Implemented as detection-only telemetry in 1.4.2 (2026-10-13)

**Server, `server/student_garble.js`:** five rules, counted per reply on the returned output.
- **The rules:** `foreignScript` (in mostly-Hebrew text), `mixedScriptToken`, `cantillation`, `repeatedFunctionWord`, `markup`. They follow §5, with one tightening: a foreign letter counts only when Hebrew letters outnumber all other letters.
- **Not included:** the low-confidence digit rule.
- **Telemetry fields:** `garbleForeignScript`, `garbleMixedScriptToken`, `garbleCantillation`, `garbleRepeatedFunctionWord`, `garbleMarkup` and `garbleReplies`.

**Browser:** `unknownSpeaker`.

**No behaviour change:** nothing is retried, rewritten, dropped or reordered.

**Precision of the production detector:**
- 0 flags on 1,191 2.5 replies, 324 3.1 replies and 7,454 PCK Hebrew strings;
- 32 of 1,608 saved 3.5 replies flagged, all genuine (the 34 of §1 minus the digit case and the name case, which is now `unknownSpeaker`);
- 88 of 2,190 replies in the §4 reproduction.

**Live smoke on 1.4.2:**
- 90 calls; replies shown equal the raw output;
- telemetry equals the detector on 90 of 90 calls;
- 18 garbled replies and 3 unknown speakers counted, all shown unchanged;
- clean contexts 0.

Details: `regression_test_plan.md` §0.27.

