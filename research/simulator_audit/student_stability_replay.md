# Student-agent stability: sequential live replay after C8 + C9

Status: evaluation only, run on 2026-10-07 against `SYSTEM_VERSION 1.3.9` with no production code changed. This re-measures pilot issue §2 in `student_agent_findings.md`, as `regression_test_plan.md` §5.1 asked to do after C8 and C9.

Sections 1–8 are the **1.3.9 baseline**. **§9 is the 1.3.10 rerun** (same harness), with a before/after comparison.

## 1. Method

- **Path under test:** the real client path, called in the same order as `Chat.jsx`.
  - `getPCKFeedback` runs first, and its `impact_analysis` steers the students. If PCK fails, the turn continues unsteered (B2).
  - `callAI` runs next. It calls `makeProsePrompt`, then `/api/generate`.
  - Both go to a local, unmodified `server/server.js` (port 3101), which calls Vertex AI `gemini-2.5-flash-lite` with the production settings: temperature 0.7, student `maxOutputTokens` 512, responseSchema, native thinking off, and the B24 retry policy.
- **History:** sequential. Each turn's student replies are appended to the history before the next teacher turn, so the model sees its own earlier outputs (with the C8 `"<name>: "` prefix) exactly as in a live session.
- **Data:** synthetic only. No participant data was read, and nothing was written to Firestore.
- **Design:** 6 scenarios × 2 conversations = **12 conversations × 12 teacher turns = 144 turns**.
  - Each conversation has a fixed cast of 3 personas, rotated so that every persona appears in several scenarios.
  - Every script mixes these teacher turns:
    - an opening question;
    - questions directed at a named student;
    - short acknowledgements (`אוקיי`, `נכון`, `יפה`, `?`);
    - an explanatory correction (the misconception follow-up);
    - a check that asks the same student again after the correction (resolution);
    - a revisit of the converse;
    - a summary request;
    - a short closing.
  - 4 turns carry a drawing (`rotated-square.png` / `rotated-parallelogram.png`).
  - There are no empty submissions.
- **Teacher behaviour:** scripted, so the teacher does not adapt to what the students say.
- **Analysis:**
  - Automated: exact match after trimming, against the same student's earlier messages and against all earlier messages; near-duplicates via `difflib` ratio on text with punctuation and whitespace removed; length; whether the student was addressed by name; valid name; regex flags for teacher attributions; latency, attempts and finishReason from A17 telemetry.
  - Manual: all 12 transcripts were read in full for semantic repetition, regression of a resolved misconception, premature correctness, cross-student contamination, speaker continuity and participation.
- **Scripts:** the harness (`replay.bench.js`, `analyze.py`) and the raw results (`replay_results.json`) are in the session scratchpad and are not part of the repo.

## 2. Totals

| measure | value |
|---|---|
| conversations / teacher turns | 12 / 144 |
| student responses | 280 (1.94 per turn; mean length 78 characters) |
| turns with no student reply | 2 |
| invalid / out-of-cast student names | 0 |
| turns that address a student by name / addressed student replied | 60 / 58 |

## 3. Repetition

### 3.1 Exact repeats

| measure | value |
|---|---|
| exact repeat of **any** earlier student message | **10 / 280 (3.6%)** |
| exact repeat of the **same student's** earlier message | **10 / 280 (3.6%)**, so every exact repeat was self-copying |
| near-duplicates (ratio ≥ 0.9), same student / any | 12 / 12 |
| near-duplicates (ratio ≥ 0.8), same student / any | 15 / 16 |

The 10 exact repeats are only **5 events**, and every event follows a short teacher turn:

| conv / turn | teacher said | what happened | gap to original | length |
|---|---|---|---|---|
| 1a T12 | `יפה מאוד, כל הכבוד.` | דנה and מעיין replay their T9 messages (the only two speakers), so the whole turn is a replay | 3 turns | 81–88 |
| 3a T6 | `נכון` | תמר and עדי replay T5 (full replay) | 1 | 59 |
| 3b T9 | `?` | הילה and רועי replay T8 (full replay) | 1 | 92–97 |
| 4a T9 | `אוקיי` | מעיין and נועה replay T6, and דנה replays T8 (full replay) | 1–3 | 90–92 |
| 4b T12 | `יפה, תודה.` | יונתן replays T6 exactly. *(Corrected 2026-10-07: originally described as the only speaker. עדי also spoke and repeated her T6 message with one word changed, and תמר paraphrased hers, so this is a near-full replay.)* | 6 | 108 |

As in the pilot, the copies are long (59–108 characters), not "כן.".

### 3.2 All-student replay turns

- **Strict pilot definition** (every reply equals that student's previous-turn message): **2 turns** (3a T6, 3b T9).
- **Every reply in the turn is an exact copy of something the same student said earlier:** **4 turns** (1a T12, 3a T6, 3b T9, 4a T9). 4b T12 is a near-full replay (corrected 2026-10-07, see §3.1), so there are **5 full or near-full replay turns**. Copies from more than one turn back are missed by the strict definition.

### 3.3 Early vs late

| turns | replies | exact repeats |
|---|---:|---:|
| early (T1–4) | 83 | 0 (0%) |
| mid (T5–8) | 101 | 2 (2.0%) |
| late (T9–12) | 96 | 8 (8.3%) |

### 3.4 Short vs normal teacher input

| teacher message | turns | replies | exact repeats |
|---|---:|---:|---:|
| ≤ 20 characters | 50 | 106 | **10 (9.4%)** |
| > 20 characters | 94 | 174 | **0 (0%)** |

On the pilot's own metric (the share of consecutive-turn pairs with at least one same-student verbatim repeat of the previous turn, gap 1):

| teacher message | pilot | this replay |
|---|---|---|
| ≤ 20 characters | 13% (16/124) | 6% (3/50) |
| 21–60 characters | 2.7% | 0/64 |
| > 60 characters | 3.8% | 0/18 |

Gap-1 understates this replay, because 3 of the 5 events copy from 3–6 turns back.

Position and input length are confounded by design: the scripts put short acknowledgements at T3, T6, T9 and the closing at T12. The late-turn concentration may therefore be largely a short-input effect.

### 3.5 Relation to PCK steering (observation, not a tested cause)

PCK feedback was shown on all 50 short turns. It rated 42 of them `problematic`. It predicted `confused` or `more_confused` on 35, and `misconception_reinforced` on 7.

**All 10 exact repeats** fell on turns where PCK predicted `confused` or `more_confused` (10 of the 80 replies on such turns). There were none on the 26 short-turn replies predicted `same`, `improved` or `misconception_reinforced`.

The student prompt turns `more_confused` into "MUST show confusion" (`ai.js:631`). A plausible mechanism follows: the teacher adds no new content, the steering asks for more confusion, and the cheapest way to comply is to restate the student's last confused message word for word. This replay does not isolate that mechanism. [HYPOTHESIS]

## 4. Qualitative review

| category | count | instances |
|---|---:|---|
| Full or near-full replay turn | 5 | 1a T12, 3a T6, 3b T9, 4a T9, 4b T12 (§3.1) |
| Semantic repetition loop (same idea reworded over several turns) | 3 | 2a T6–T9; 5a הילה; 5b נועה T9–T12 |
| Regression of a resolved misconception | 2 | 1a T12: דנה summarised correctly at T11, then replays her T9 confusion. 4a T12: מעיין and דנה fall back to the pre-correction claim about rectangle diagonals. |
| Premature correctness | 1 (mild) | 5b T2: דנה gives a nearly complete answer before any scaffolding. Elsewhere, misconceptions persist until the explanatory turn. |
| Persona-consistent persistence (not counted as a defect) | 3 | 2b דנה, 5b דנה, 6a עדי keep a misconception after the correction, which their personas allow |
| Cross-student contamination | 2 | 1a T9: מעיין adopts דנה's confusion as her own. 3a T12: יונתן voices the question עדי asked earlier. |
| Invented attribution ("you said …" that the teacher never said) | 4 (+1 confused) | 2a T3, 3b T2, 6b T2, 6b T4 invented; 4a T7 confuses what the teacher said. Of the 14 regex hits, the other 9 were accurate. |
| Third-person teacher reference ("המורה אמר/ה") | 2 | 1b T6, 3b T2 |
| Wrong speaker / name echo | 0 | Speaker continuity was good. Addressed students answered 58/60 times, and no `"name: "` prefix appeared in a message. |

**Closings.**
- `יפה, תודה לכם.` produced natural farewells in all four conversations that used it (2a, 2b, 6a, 6b).
- `יפה מאוד, כל הכבוד.` and `יפה, תודה.` produced replays instead (1a, 4b).
- `יפה מאוד.` (3a, 3b) produced short, appropriate closings.

**Participation** was mostly balanced. Low-baseline personas speak less (נועה twice in 2b, יובל once in 3b), which fits their personas.

## 5. Latency and retries

| agent | calls | failures | attempts > 1 | finishReason | p50 | p90 | max |
|---|---:|---:|---:|---|---:|---:|---:|
| PCK | 144 | 0 | 0 | STOP ×144 | 3,350 ms | 4,295 ms | 11,842 ms |
| student | 144 | 0 | 0 | STOP ×144 | 1,192 ms | 1,631 ms | 2,247 ms |

- PCK feedback was shown on 132/144 turns.
- There were no retries, timeouts, `MAX_TOKENS` stops or B2 fallbacks, so none of the repeats can come from retry or fallback paths.

## 6. Comparison with the pilot baseline

| measure | pilot (`student_agent_findings.md` §2.1) | this replay |
|---|---|---|
| exact repeat rate | 5.4% (171/3,163) | 3.6% (10/280) |
| by the same student | 132 of 171 (77%) | 10 of 10 |
| strict full-replay turns | 25 (in the whole corpus) | 2 in 144 turns (5 under the broader definition) |
| ≤ 20-character teacher input, gap-1 pair rate | 13% | 6% (3/50) |
| > 20-character teacher input | 2.7–3.8% | 0% |
| concentration | late (median position 0.82), after short or empty input | late, and only after short input |

**These numbers are not comparable enough to claim an improvement.**

- The teacher here is scripted and synthetic, and short turns are deliberately dense (35% of turns, against about 11% of pilot pairs).
- There are no empty sends here, which drove the pilot's 39% bucket.
- This is a single run of 280 responses at temperature 0.7.
- The pilot spans versions 1.1.0–1.3.0 and real teachers.

**What the replay does show:**

- After C8 + C9, the pilot failure mode **still occurs**, with the same shape: long, verbatim self-copies after short or acknowledgement teacher input, including whole-turn replays and replays at the closing.
- With substantive teacher input there were no exact repeats in this sample. The remaining issues on those turns are semantic loops, regressions and occasional invented attributions.

## 7. Limitations

- **Single run, small sample:** 280 responses, 10 repeats in 5 clustered events, so the rates have wide uncertainty.
- **Scripted teacher:** turns are not adapted to the students' answers, so some "repetition" may be the model fairly re-answering a teacher who ignored the previous answer. Short turns sit at fixed positions, which confounds position with input length.
- **Not covered:** empty sends and image-only turns, since the task excluded them.
- **No contrast run:** without a run before C8/C9 under the same harness, the effect of C8/C9 cannot be separated from that of the different teacher population.
- **Manual review:** one reviewer and no inter-rater check. The categories in §4 are judgements, and the counts are approximate.
- **Not separated:** the PCK `more_confused` association (§3.5) is correlational. PCK steering and input length were not varied independently.

## 8. Recommended next student-agent change

The target is the **short / acknowledgement-input replay**. It is the only exact-repeat mode left in this sample, and it is the most visible failure, since whole turns get replayed, including at closings.

Recommended order:

1. **A diagnostic A/B (no production change) to separate the two likely drivers on short turns:**
   - PCK steering (`more_confused`, "MUST show confusion") versus no steering or `same`;
   - the student prompt's handling of acknowledgements and closings (for example, an instruction that an acknowledgement or thanks from the teacher calls for a brief reaction, a new thought or a farewell, never a restatement).

   This is small and cheap with the existing harness (replaying only the short turns from the saved histories), and it tells you whether the fix belongs in the PCK-to-student mapping or in the student prompt.
2. **Then, depending on that result**, one of:
   - a prompt or steering change. This would change prompts, so it needs your decision.
   - **deterministic same-student duplicate detection with a single re-ask** (server-side, after `student_output_contract`). This is a model-independent safety net for verbatim copies, but it does not address semantic loops or regressions.
3. **Explicit student state** (per-student "resolved / still holding misconception X") is the candidate for the remaining semantic issues: the regressions at 1a and 4a T12, the loops, and the contamination. It is a larger change and should come after the replay fix.

Per instructions, none of these were implemented. Duplicate detection, explicit student state, B6, prompts, models and personas are unchanged, and `SYSTEM_VERSION` was not bumped.

---

## 9. Rerun on 1.3.10 (conversational-move rule), 2026-10-07

Acceptance check for the 1.3.10 student-prompt rule (`regression_test_plan.md` §0.21, invariant B25). This was an evaluation only: no production code changed, no version bump, synthetic data only, no Firestore.

### 9.1 Method

The method is the same as §1.
- **Harness:** the same `replay.bench.js`, byte-identical except for the output folder.
- **Kept the same:**
  - the 6 scenarios and 12-turn teacher scripts;
  - the casts (same deterministic rotation);
  - the 4 drawing turns;
  - the real `getPCKFeedback` → `callAI` path;
  - the local server on the committed 1.3.10 tree;
  - the same model and settings.
- **The only intended difference:** the one added student-prompt line.

**Confound: PCK steering differed a lot between the runs.** PCK code is unchanged, but PCK reads the students' replies, so whole conversations take different paths.

| | 1.3.9 | 1.3.10 |
|---|---:|---:|
| `pedagogical_quality` positive / problematic / neutral | 9 / 106 / 29 | 53 / 72 / 19 |
| `understanding_level` improved | 9 | 53 |
| `understanding_level` confused + more_confused | 88 | 49 |

Conversations 2a, 2b, 6a and 6b ran almost entirely under `positive / improved` in 1.3.10. The two runs therefore differ in steering as well as in the rule, so comparisons below are behavioural, not causal.

### 9.2 Before / after

| measure | 1.3.9 | 1.3.10 |
|---|---|---|
| conversations / teacher turns | 12 / 144 | 12 / 144 |
| student responses (per turn) | 280 (1.94) | 260 (1.81) |
| turns with no reply | 2 | 3 (3a T3 `אוקיי`, 4b T6 `נכון`, 3b T12 `יפה מאוד.`) |
| **exact repeats (any student)** | **10/280 (3.6%)** | **14/260 (5.4%)** |
| same-student exact repeats | 10/280 (all) | 14/260 (all) |
| near-duplicates, same student (ratio ≥ 0.9 / ≥ 0.8) | 12 / 15 | 17 / 22 |
| turns where every responder repeats exactly | 4 | 3 (2a T6, 2b T7, 3b T9) |
| full or near-full replay turns (manual) | 5 | **8** (2a T6, 2b T7, 2b T8, 2b T9, 3a T7, 3b T9, 4a T6, 5a T6) |
| early T1–4 / mid T5–8 / late T9–12 | 0/83 · 2/101 · 8/96 | 0/81 · **10/96** · 4/83 |
| after short (≤ 20 characters) teacher message | 10/106 (9.4%) | 8/96 (8.3%) |
| after longer teacher message | **0/174** | **6/164 (3.7%)** |
| invalid student names | 0 | 0 |
| addressed student replied | 58/60 | 58/60 |

1.3.9 counts use the corrected §3.2 definition: 4 exact plus 4b T12 near-full.

### 9.3 By teacher-message type

Turn types:
- **closing:** T12;
- **acknowledgement:** `אוקיי` / `נכון`;
- **praise:** mid-lesson `יפה`;
- **bare `?`**;
- **short content:** `X, מה דעתך?`.

| type (turns per run) | 1.3.9 exact | 1.3.10 exact | 1.3.9 replay turns | 1.3.10 replay turns | near ≥ 0.8 (1.3.9 → 1.3.10) |
|---|---|---|---|---|---|
| **closing** (12) | 3/30 (10.0%) | **0/26** | 2 (1a T12, 4b T12) | **0** | 6 → **0** |
| **acknowledgement** (24) | 5/51 (9.8%) | 6/47 (12.8%) | 2 (3a T6, 4a T9) | 3 (2a T6, 4a T6, 5a T6) + 2b T9 in a chain | 6 → 8 |
| praise (6) | 0/8 | 0/8 | 0 | 0 | 0 → 0 |
| bare `?` (6; synthetic only, absent from pilot) | 2/15 | 2/13 | 1 (3b T9) | 1 (3b T9) | 2 → 3 |
| short content (2) | 0/2 | 0/2 | 0 | 0 | 0 → 0 |
| longer (94) | 0/174 | **6/164** | 0 | 3 (2b T7, 2b T8, 3a T7) | 1 → 11 |

**Closing behaviour in 1.3.10:**
- 6 of 12 were brief farewells only (1a, 1b, 2a, 2b, 6a, 6b).
- One was thanks plus still-open confusion in new words (5a: "תודה! אבל אני עדיין לא לגמרי מבין…").
- 4 continued with new content and no copying (3a keeps תמר's misconception; 4a, 4b, 5b).
- One was silent (3b).

### 9.4 Do the five 1.3.9 repeat events recur?

| event (1.3.9) | 1.3.10 | PCK level in 1.3.10 (1.3.9) |
|---|---|---|
| 1a T12 `יפה מאוד, כל הכבוד.` (full replay) | **No.** "תודה רבה!" / "כן, תודה!" | improved (more_confused) |
| 3a T6 `נכון` (full replay) | **No.** One new reply ("אז בעצם, כל ריבוע הוא מלבן…"), but at **3a T7** the same students replay their T5/T6 messages after a content question | more_confused (confused) |
| 3b T9 `?` (full replay) | **Yes.** הילה and רועי replay T8 verbatim (same as `short_message_repetition_experiment.md`, E3) | more_confused (more_confused) |
| 4a T9 `אוקיי` (full replay) | **No.** New questions. But **4a T6** `נכון` is a near-full replay (דנה exact, מעיין 0.99) | misconception_reinforced (more_confused) |
| 4b T12 `יפה, תודה.` (near-full replay) | **No.** One new content question | more_confused (confused) |

The two closing events and the `אוקיי` event did not recur. `?` did. The acknowledgement pattern moved to `נכון` at T6, the acknowledgement that directly follows the teacher's explanation turn: 2a, 4a and 5a.

### 9.5 Qualitative review (all 12 transcripts read in full)

| category | 1.3.9 | 1.3.10 | 1.3.10 instances |
|---|---:|---:|---|
| Resolved-misconception regression | 2 | 2 | **2b T7** דנה: at T6 she asked "צריך שגם האלכסונים יחצו?", then at T7 replays her T2 "…זה לא מספיק? חשבתי שכן". The regression arrives *through a verbatim replay*. **4a T12** דנה: "אמרת שבמלבן … לא, אבל במקבילית כן?" after the teacher (T5) and she herself (T9) said neither does. |
| Semantic repetition loop | 3 | 3 | **2b T7–T9:** three consecutive turns of replayed messages (מעיין's T4 line three times, נועה's T5 line twice), under PCK `improved`. **5a T9–T12:** הילה and יובל restate "מה ההבדל בין 'חוצים זה את זה' ל'נפגשים באמצע'" every turn. The scripted teacher never answers it, so persistence is fair, but the wording is formulaic. **6a T7/T9** תמר restates her answer (mild; she even says "אה, כבר אמרתי את זה"). |
| Persona-consistent persistent misconception (not counted as a defect) | 3 | 2 | 3a תמר ("אם זה לא ארוך … זה לא מלבן", T5–T12); 5a רועי (T7 still "צריך שיהיו גם מאונכים", ignoring the T5 correction) |
| Cross-student contamination / peer misattribution | 2 | 1 | **3a T4** עדי: "יונתן אמר שריבוע זה גם מלבן". יונתן never said this. |
| Invented teacher attribution | 4 (+1 mixed) | 3 (+2 mixed) | Invented: **2b T4** מעיין "אמרת שצריך עוד משהו…" (the teacher only asked and said `יפה`; this line is then replayed at T8 and T9); **2a T8** הילה "אמרת מקודם שאלכסונים שחוצים זה את זה זה תכונה של כל המקבילית"; **3b T2** רועי attributes his own T1 words to the teacher. Mixed: **4a T12** (above); **5b T8** מעיין "אמרת שהאלכסונים שלו מאונכים, לא שווים" (the teacher said equal *and* perpendicular). Of the 16 "אמרת…" regex hits, 7 are these cases (2b T4's line counts three times because it is replayed). The other 9 are accurate or refer to the student's own words. |
| Third-person teacher reference | 2 | 1 | 1a T10 דנה "המורה התכוון … כשאמר" |
| Premature correctness | 1 | 2 (mild) | 6a T2 תמר and 6b T2 יובל give the correct inclusion argument at once. In both casts another student (עדי / הילה) voices the misconception. |
| Speaker continuity | good | good | Addressed students answered 58/60; no name echo; no wrong speaker |
| Participation | mostly balanced | mostly balanced | Low-baseline personas speak less (5b נועה, 3b יובל), as their personas imply |

### 9.6 Latency and retries

| agent | calls | failures | attempts > 1 | finishReason | p50 | p90 | max |
|---|---:|---:|---:|---|---:|---:|---:|
| PCK | 144 | 0 | 1 (4b T9, succeeded on attempt 2) | STOP ×144 | 3,370 ms | 4,053 ms | 14,329 ms |
| student | 144 | 0 | 0 | STOP ×144 | 1,230 ms | 1,626 ms | 7,639 ms |

- Two student calls took more than 3 s (5a T5 7.1 s, 6b T6 7.6 s). Both were single attempts, well inside the B24 limits.
- PCK feedback was shown on 133/144 turns.

### 9.7 Interpretation

This is one replay per version, so it is a behavioural acceptance check, not a statistical test.

1. **Did the rule reduce exact repetition overall?** **No.**
   - Exact repeats were 10/280 (3.6%) in 1.3.9 and 14/260 (5.4%) in 1.3.10.
   - Full or near-full replay turns went from 5 to 8.
   - The difference is within what one stochastic run can produce, especially with the PCK steering shift (§9.1). It does not show an increase, but there is no overall reduction.
2. **After closings and acknowledgements specifically?**
   - **Closings: yes, eliminated in this run.** Exact repeats 3/30 → 0/26 and near-duplicates 6 → 0, with no closing replay. Farewells were natural, and the closing events of 1.3.9 (1a T12, 4b T12) did not recur. This matches the 2×2 experiment.
   - **Acknowledgements: no.** 5/51 → 6/47. `נכון` right after the teacher's explanation (T6) produced near-full replays in 2a, 4a and 5a. That happened under PCK `improved`, `misconception_reinforced` and `more_confused` alike, so it is not only the confusion steering.
3. **Did it keep confusion and misconceptions?** **Yes.**
   - Confused students stayed confused in new words: 5a closing, 4b עדי, 5b דנה T8–T9.
   - Persona misconceptions persisted where the script never resolved them (3a תמר through T12).
   - There was no sign of students becoming generally agreeable or "fixed".
4. **New undesirable behaviour?**
   - **Verbatim replays after longer content questions** (0/174 → 6/164): 2b T7 and the T7–T9 chain, and 3a T7. These are revisit questions: the teacher asks again something close to an earlier question (2b T7 ≈ T2; 3a T7 follows T5/T6), and the students copy their earlier answers.
   - This was not seen in 1.3.9. One run cannot tell whether the rule contributed. It targets only conversational moves, so a direct mechanism is not obvious, and these conversations ran under very different PCK steering.
   - Otherwise nothing new: no invalid names, no name echo, and no increase in invented attributions (3+2 vs 4+1).
5. **The most important remaining issue** is **verbatim self-copying across triggers**:
   - acknowledgement right after an explanation;
   - a teacher revisiting an earlier question;
   - bare `?` (synthetic only).

   It occurs under every PCK level, including `improved`, and now after content questions, where a rule about conversational moves cannot apply. It is no longer explained by a single prompt gap. It is also the most visible failure: whole turns of copied text, sometimes several turns in a row (2b T7–T9). One of the two regressions (2b T7) arrived through such a copy.

### 9.8 Recommended next target (not implemented)

**Exact repeats are not rare after the rule (5.4%; 8 full or near-full replay turns).** So a deterministic, trigger-agnostic safety net is now the better next step:
- **Same-student duplicate detection with one re-ask.**
  - Compare each reply with that student's earlier messages, after normalising whitespace and punctuation, using exact and near-exact (for example ratio ≥ 0.9) matches.
  - On a hit, re-generate once with a short note naming the copied line. If the copy remains, drop that student's reply and keep the others.
  - It would have caught every replay in both runs, including the 2b T7–T9 chain and the 2b T7 regression.
  - It costs one extra student call on roughly 5% of turns, and it is deterministic and unit-testable.
  - It needs a design decision on: the threshold; whether to compare across students; whether the re-ask goes server-side, after `student_output_contract`, or client-side; and how a dropped reply interacts with B6 / A3 (zero replies).

**Explicit student state is the following target, not the next one.**
- Regressions (2), semantic loops (3) and contamination or misattribution (1) are at about the same level as in 1.3.9. They are real but less visible than copied turns.
- Explicit per-student state would address them, for example "resolved: square ⊂ rectangle", "still holds: long and thin". But it is a larger design change: where the state lives, who updates it, and how it interacts with the PCK hints.
- Duplicate detection would also remove the regressions that arrive by verbatim replay, which makes the remaining state problems easier to measure.

**Keep the 1.3.10 rule.** It eliminated closing replays in both the experiment and this replay without damaging student state.

**Optional before deciding:** a second 1.3.10 replay would show whether the longer-message replays (§9.7.4) recur, given the large PCK-steering difference between the two runs.

---

## 10. Rerun on 1.3.11 (same-student duplicate guard), 2026-10-07

Acceptance test for the 1.3.11 duplicate guard and its single re-ask (invariant B26, `regression_test_plan.md` §0.22). This was an evaluation only: no production code changed, no version bump, synthetic data only, no Firestore. §1–§9 are unchanged.

### 10.1 Method

- **Harness:** the same `replay.bench.js` as 1.3.9 and 1.3.10. The only addition is that it also records the four content-free duplicate-guard fields from the student call's telemetry.
- **Kept the same:** the 6 scenarios, 12-turn scripts, 2 casts per scenario (same deterministic rotation), 4 drawing turns, the real `getPCKFeedback` → `callAI` path, and the model and settings.
- **Code under test:** the committed 1.3.11 tree (`5184c24`, clean), on a local unmodified `server/server.js`.
- **The acceptance metric is the FINAL output returned to the teacher.**
  - Attempt-1 drafts are not exposed by the API, by design.
  - The number of flagged replies per triggered turn comes from the server's content-free log line ("same-student duplicate (n replies)").
- **PCK steering this run:** positive on 41 turns (1.3.9: 9, 1.3.10: 53); `improved` on 41 turns. PCK code is unchanged, but its trajectory again differs from the earlier runs.

### 10.2 1.3.9 vs 1.3.10 vs 1.3.11 (final output)

| measure | 1.3.9 | 1.3.10 | **1.3.11** |
|---|---|---|---|
| conversations / teacher turns | 12 / 144 | 12 / 144 | 12 / 144 |
| student responses (per turn) | 280 (1.94) | 260 (1.81) | 269 (1.87) |
| turns with no reply | 2 | 3 | **0** |
| **exact same-student repeats** | 10 (3.6%) | 14 (5.4%) | **0 (0%)** |
| exact repeats of any student | 10 | 14 | **0** |
| replies flagged by the production detector (≥ 30 characters; equal or edit ≥ 0.90) | 12 | 16 | **0** |
| near-duplicates (`difflib` ≥ 0.8, same student) | 15 | 22 | 1 |
| full or near-full replay turns | 5 | 8 | **0** |
| after short (≤ 20 characters) teacher messages | 10/106 (9.4%) | 8/96 (8.3%) | **0/105** |
| after longer teacher messages | 0/174 | 6/164 | **0/164** |
| closings (T12) | 3/30 | 0/26 | **0/30** (22 thanks/goodbye replies) |
| acknowledgements (`אוקיי` / `נכון`) | 5/51 | 6/47 | **0/50** |
| re-asked content questions (T7 revisits) | 0 | 4 (2b T7, 3a T7) | **0** |
| bare `?` (synthetic only) | 2/15 | 2/13 | **0/12** |
| early / mid / late turns | 0 · 2 · 8 | 0 · 10 · 4 | **0 · 0 · 0** |
| invalid student names | 0 | 0 | 0 |
| addressed student replied | 58/60 | 58/60 | 58/60 (2b T10 נועה silent while דנה and מעיין answered; 3a T2 יונתן addressed, עדי and תמר answered) |

**The five 1.3.9 repeat events** (1a T12, 3a T6, 3b T9, 4a T9, 4b T12) and **the 1.3.10 events** (2a T6, 2b T7–T9, 3a T7, 3b T9, 4a T6, 5a T6) have no exact or detector-level copy in the final output.

### 10.3 Duplicate-guard telemetry

| measure | value |
|---|---|
| turns with `duplicateRetries = 1` | **4 / 144 (2.8%)**: 2a T6 `נכון`, 3b T9 `?`, 4a T6 `נכון`, 4a T12 `יפה, תודה.` |
| replies that triggered regeneration (attempt 1) | **9** (3 + 2 + 2 + 2). In every triggered turn, every replying student had copied. |
| `duplicateOutcome` | none **140** · resolved **4** · dropped **0** · kept **0** · reask_failed **0** |
| `duplicateRepliesDropped` / `duplicateRepliesKept` | 0 / 0 |
| re-ask competing with a technical retry | **0.** No student or PCK call needed a technical retry (student `attempts`: 1 ×140, 2 ×4, all four being re-asks; PCK `attempts`: 1 ×144). |
| maximum model attempts per call | **2** (never exceeded) |
| student latency on re-ask turns | 2,457 · 2,569 · 3,037 · 3,314 ms, against p50 1,257 / p90 1,571 ms on other turns. That is **about +1.2 to 2 s** on the 2.8% of turns that re-ask. |
| failures | student 0 · PCK 0; all finishReason STOP |
| overall latency | student p50 1,269 / p90 1,710 / max 3,314 ms; PCK p50 3,255 / p90 4,102 / max 10,539 ms |

The guard triggered less often than attempt-1 duplicates occurred in earlier runs (1.3.10: 8 replay turns). Duplicates on attempt 1 vary from run to run, and this run's conversations took different paths. The fallback branches did not occur. Their expected rate from the live re-ask experiment is about 5% of re-asks.

### 10.4 Manual review of the regenerated turns

All 9 regenerated replies (the final versions) were read against the history. Labels are one reviewer's judgement.

| turn (teacher, PCK level) | final reply | natural reaction | state kept | not too correct | no semantic loop | no invented attribution | no transfer | sounds natural |
|---|---|---|---|---|---|---|---|---|
| 2a T6 `נכון` (misconception_reinforced): יובל | "אז אם האלכסונים מאונכים זה לא מספיק. הבנתי. אבל מה עוד צריך?" | ✓ | ✓ | ✓ | ✓ at this turn | ✓ | ✓ | ✓ |
| 2a T6: הילה | "…אז מה ההבדל המדויק בין מעויין לדלתון?" | ✓ | ✓ | ✓ | ✓ at this turn (the same question returns at T9) | ✓ | ✓ | ✓ |
| 2a T6: רועי | "אה, אז מה שציירת זה לא מעויין? חשבתי שכן." | ✓ | ✓ (low-baseline persona, slightly behind) | ✓ | ✓ | ✓ ("ציירת" is correct) | ✓ | ✓ |
| 3b T9 `?` (improved): הילה | "אז אני צריכה לבדוק שהזוויות ישרות, כמו שדיברנו, גם אם הצורה נראית מוטה?" | ✓ | ✓ | ✓ | ✗ restates T8 as a question | ✓ | ✓ | ✓ |
| 3b T9: רועי | "כן, אני אבדוק את הפינות. אם הן ישרות, אז זה מלבן." | ✓ | ✓ | ✓ | ✗ restates T8 | ✓ | ✓ | ✓ |
| 4a T6 `נכון` (confused): דנה | "אז זה אומר שרק במעוין וריבוע האלכסונים חוצים את הזוויות? אבל למה דווקא בהם?" | ✓ | ✓ | ✓ | ✗ the same "why only rhombus and square?" as T5 | ✓ | ✓ | ✓ |
| 4a T6: מעיין | "אוקיי, אז לא בכל מרובע האלכסונים חוצים זוויות. זה יותר ברור לי עכשיו. אבל אני עדיין תוהה למה במלבן זה לא קורה." | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4a T12 `יפה, תודה.` (same): דנה | "אז אני מבינה שזה לא נכון להכליל את זה לכל המרובעים. אבל למה דווקא במעוין ובריבוע זה כן מתקיים?" | weak (closing → content question) | ✓ | ✓ | ✗ her fourth "why rhombus and square?" (T5, T6, T10, T12) | ✓ | ✓ | ✓ |
| 4a T12: מעיין | "אוקיי, אז זה לא קורה במלבן ובמקבילית. אני מבינה שזה רק במעוין וריבוע. אבל למה?" | weak | ✓ | ✓ | ✗ same loop | ✓ | ✓ | ✓ |

**Summary:**
- **Exact duplication fixed with a genuinely new reply:** 4 / 9 (2a T6 ×3, 4a T6 מעיין).
- **Mechanically fresh wording but the same semantic content or loop:** 5 / 9 (3b T9 ×2, 4a T6 דנה, 4a T12 ×2).
- None of the 9 became prematurely correct, invented a teacher statement, took over another student's misconception, or showed the regeneration note or any meta language.
- **Why the 4a loop persists:** the scripted teacher never answers the students' "why only rhombus and square?", so the question keeps returning. A real teacher would answer it.

### 10.5 Qualitative review of all 12 conversations

| category | 1.3.9 | 1.3.10 | 1.3.11 | 1.3.11 instances |
|---|---:|---:|---:|---|
| Resolved-misconception regression | 2 | 2 | 2 (+1 harness artefact) | **2b T6** דנה: after "צריך שגם יחצו, נכון?" at T5, she asks whether perpendicular and bisecting is "still not enough"; she recovers at T7. **6a T6** תמר: after a correct "כל מעוין הוא דלתון, אבל לא כל דלתון הוא מעוין", she misapplies it ("אז … כל מלבן הוא גם ריבוע?"); she recovers at T7. *Artefact:* 5a T9 יובל is confused again after stating the full rule at T6. The T8 drawing is the rotated **square** image while the script says the diagonals do not bisect, so the confusion is reasonable. |
| Semantic repetition loop | 3 | 3 | **4** | **4a T5–T12** דנה and מעיין: "למה דווקא במעוין וריבוע?" 4–5 times, including both guard turns. **2a T6–T10:** הילה "מה ההבדל בין דלתון למעוין", רועי "לא זוכר / אין לי מושג", יובל "אמרת שזה לא מספיק". **2b T7–T9:** "צריך גם שיחצו" restated by both students each turn. **5b T8–T11:** "זה נראה כמו ריבוע, איך הם לא חוצים?", partly driven by the same square-image artefact. |
| Persona-consistent persistence (not counted as a defect) | 3 | 2 | 3 | 3a עדי (visual prototype through T12), 5b דנה (equal + perpendicular = square), 1b עדי (cannot give an example) |
| Cross-student contamination | 2 | 1 | **0** | Peer references were accurate (3a T2 תמר quoting יונתן's T1). |
| Prompt-example leakage (new category) | — | — | 1 | **6a T6** עדי: "אוקיי, אז אם אני רואה מרובע שהאלכסונים שלו מאונכים, אני יודע שזה מעויין, נכון?" This is almost verbatim the prompt's EXAMPLE 3, including its masculine "יודע", although עדי speaks in the feminine elsewhere. It is also off-topic for the kite lesson. |
| Invented teacher attribution | 4 (+1 mixed) | 3 (+2 mixed) | **1** | **2b T8** מעיין: "אני זוכרת שאמרת שצריך שאלכסונים יחצו זה את זה". The teacher never said this. The other 17 "אמרת / ציירת / אמרתם…" hits are accurate or refer to the student's own words. 5b T4 "שנה שעברה לימדו אותנו…" refers to a previous year, not to this teacher, and was not counted. |
| Third-person teacher reference | 2 | 1 | **0** | |
| Premature correctness | 1 | 2 (mild) | 2 (mild) | 1a T2 דנה and 4b T2 יונתן answer correctly at once, while another student carries the misconception. 3b רועי drops his "like a square but longer" idea at T3 after הילה's remark, without teaching. |
| Speaker continuity / participation | good | good | good | Low-baseline personas speak less, as their personas imply. |

**Closings:**
- 9 of 12 were farewells or brief closing reactions (1a, 1b, 2a, 2b, 4b, 5a, 5b, 6a, 6b). 1b's is a closing reaction: "איזה כיף! אז ההבנה שלי הייתה נכונה!"
- 3a, 3b and 4a continued with content. In 3a and 3b this is short and on-topic. In 4a it is the semantic loop above.

### 10.6 Interpretation

1. **Is word-for-word same-student repetition solved?** **Yes, in the final output of this run.**
   - 0 exact repeats, 0 detector-level near-copies and 0 replay turns in 269 replies.
   - The comparable figures were 10/280 (1.3.9) and 14/260 (1.3.10).
   - This is one run, but it agrees with the live re-ask test (95% resolved in one re-ask) and with the deterministic tests.
2. **How often did the guard trigger?** On 4 of 144 turns (2.8%), with 9 flagged replies. Each was a whole-turn copy.
3. **How often did the fallback branches occur?** None did (dropped 0, kept 0, reask_failed 0). No re-ask competed with a technical retry, and no call exceeded 2 model attempts.
4. **Did regeneration introduce a meaningful new problem?** No.
   - No meta leakage, invented attributions, premature correctness or contamination appeared in the regenerated replies.
   - The cost is about 1.2–2 s on 2.8% of turns.
   - The one new observation, prompt-example leakage at 6a T6, is in a turn where the guard did not trigger, so it is unrelated to the guard.
5. **Did semantic repetition and regression remain?** **Yes.**
   - 4 semantic loops, 2 mild regressions (+1 artefact), 1 invented attribution.
   - 5 of the 9 regenerated replies are fresh wording of the same content.
   - The guard turned verbatim loops into paraphrased loops, as expected.
6. **Should the 30-character / 0.90 criterion change?** No.
   - There is no evidence of misses at the verbatim level (0 detector flags, 1 `difflib` ≥ 0.8 pair in the final output) and no evidence of false triggers.
   - A more aggressive threshold would start catching paraphrases. Those are the semantic loops above, which string similarity cannot handle without also flagging legitimate restatements.
7. **Is duplicate detection complete enough to stop tuning?** **Yes.** Keep monitoring `duplicateOutcome` in production telemetry, especially `dropped`, `kept` and `reask_failed`, which this run never exercised live. Stop tuning the threshold.

### 10.7 The most important remaining student-behaviour problem

**State-unaware semantic repetition.** A student keeps asking the same open question, or restating the same position, in new words, turn after turn (4a, 2a, 2b, 5b). Related are the smaller regressions of something the student had already resolved (2b T6, 6a T6).

These share a cause: the student model has no explicit memory of each student's state. It does not track what the student has already asked, whether the teacher answered it, what the student has already understood, or what they still hold. It reconstructs all of that from the raw history every turn. Exact-copy prevention cannot address this.

**Does this justify investigating explicit per-student state?** **Yes, as an investigation, not yet an implementation.** A minimal design would keep, per student and per session, a few structured facts:
- open question asked / answered;
- resolved claims;
- persisting misconception;

These would be updated after each turn and passed to the student prompt. The design would need to decide:
- who updates the state (the PCK step, the student step, or a separate small call);
- how it interacts with the PCK `student_reaction_hints`;
- how it is stored (A-section contracts);
- how it is evaluated.

**Caveat for evaluating it:** part of the remaining looping is produced by **the harness, not the model.**
- The scripted teacher never answers the students' questions ("why only rhombus and square?").
- Scenario 5's drawing (the rotated square) contradicts the script's text.

Before measuring an explicit-state change, the replay needs either a teacher that answers questions (scripted answers or an adaptive teacher model) or a loop metric that discounts unanswered questions. Otherwise a state mechanism could be penalised for loops the script forces.

**Smaller items worth a separate look** (not the next target):
- prompt-example leakage (6a T6, EXAMPLE 3 copied with the wrong grammatical gender);
- the remaining invented attribution (2b T8).

---

## 11. Clean Mode B baseline on 1.3.12 (corrected harness, neutral prompt examples), 2026-10-12

> **Separate from §1–§10.** Those sections are Mode A–style sequential replays (the scripted teacher never answers students), and their loop and regression counts are not comparable with this section (`student_stability_harness_review.md` §2). This section is the first baseline from the corrected adaptive harness (Mode B).

### 11.1 Method

- **System:** committed **1.3.12** (`279721a`); production files unmodified (`gitDirtyProductionFiles` empty); local `server/server.js`; real PCK → student path; Gemini `gemini-2.5-flash-lite` with production settings. Synthetic personas and scripts only; no participant data; nothing written to Firestore.
- **Harness:** `replay_harness/`, **Mode B** (deterministic adaptive teacher, no LLM teacher).
- **Design:** designed casts (slot A = misconception carrier), 6 scenarios × 2 casts × **2 runs = 24 conversations**, 288 teacher turns.
- **Review before trusting the labels:** the first run (on HARNESS 1.1.0) was read in full, with the teacher decision log and labels. It surfaced harness defects (§11.2), which were fixed test-first, harness only, through HARNESS_VERSION **1.3.2** (74 harness unit tests).
- **Assembly of the final runs:**
  - The Mode B teacher is deterministic given the student replies, so each recorded conversation was **re-simulated** under the final teacher logic (`scripts/resimulate_teacher.js`).
  - **19 conversations** re-simulated identically and were kept.
  - **5 conversations** whose teacher would differ were **rerun**: run 1 s4 cast 1, s5 cast 0, s5 cast 1; run 2 s4 cast 1, s5 cast 0.
  - Final check: **all 288 teacher turns equal the 1.3.2 teacher**. Labels were computed with 1.3.2, and per-conversation provenance is in each `manifest.json`.
- **Outputs** (git-ignored): `replay_harness/results/B-baseline-1.3.12-final-run{1,2}`.
  - The superseded 1.1.0 run is kept as `superseded-h1.1.0-…`; 8 of its teacher turns differ from the final logic.
- **Manual review:** every regression, resolution, premature-correctness, persistence, contamination, loop, semantic-repetition, attribution and prompt-example candidate was judged by one reviewer.
  - The ambiguous and judgement-heavy cases are in the de-identified **second-review sample**, `mode_b_baseline_1.3.12_second_review.md` (23 cases).

### 11.2 Harness defects found in the first run (fixed before the baseline)

| # | defect | example (first run) | effect | fix (version) |
|---|---|---|---|---|
| H1 | A pending question got its full answer **prepended to the planned question that asks for exactly that answer** | s2 T8: "אם האלכסונים מאונכים וגם חוצים…, המרובע הוא מעוין. מה עוד צריך לדעת…?" | the student was confused by the contradiction; **4 false loop candidates** (T8–T11) | plan field `asks` (8 planned questions); such a question is not answered before it (`asked_by_planned_question`) (1.2.0) |
| H2 | s2 hint referred to "הדלתון שבשרטוט" before the kite is drawn (T5) | s2 cast 1 T3 | a reference to a non-existent drawing | hint reworded (1.2.0) |
| H3 | **Missed misconception claims, so the scripted "יפה" validated the misconception** | s6 cast 0 T2 "…אז לא, זה לא אותו דבר" (anaphora); s4 cast 1 T2 "…אז גם במלבן זה הגיוני"; s5 claim behind a "…, לא?" tag read as negation | the next student said "המורה אמרה 'יפה' לרועי, אז אולי הוא כן צודק?" (**harness-created confusion**) | s1/s6 anaphora, tag ≠ negation, s4 "גם במלבן" / "לחצות" (1.2.0–1.3.1) |
| H4 | **False misconception claims** | open or challenged questions ("האם הוא באמת חוצה…?", "…? אבל…", "…? או ש…"), "צר" inside "צריך", an ellipsis splitting a sentence, properties of the square ("בריבוע…"), reported former beliefs ("חשבתי ש…"), the correct contrast ("…רק במעוין…"), bisecting synonyms ("נחצים", "להיפגש באמצע", "לא נפגשים באמצע") | **2 false regression candidates** and **2 false persistence candidates**; one false claim also neutralized a correct "נכון" | narrower detection (1.2.0–1.3.2) |
| H5 | Answer-bank routing gaps left repeated questions unanswered | s5 "מה ההבדל בין מלבן לריבוע?" asked about 5 times (generic answer once); s3 "למה יש שני שמות?"; s5 "איך הם לא חוצים…?" routed to MEANING instead of WHY | artificial unanswered repeats and one false loop candidate | s5 `RECT_SQUARE`; s3 routing; s5 WHY routing (1.2.0, 1.3.0) |
| H6 | Self-quotes ("אמרתי") counted as teacher attributions | — | label noise | regex (1.2.0) |

**Remaining harness limitations (not fixed):**
- Some recurring questions have no answer-bank category, so the student gets the scenario key fact once, as a generic answer: s4 "מה ההבדל בין 'חוצים זה את זה' ל'חוצים זוויות'?" and s1 "how can a square with extra properties be a rectangle?". Generic answers were **22 of 54** teacher answers.
- Yes/no questions without an interrogative are not routed.
- The scripted validating probes ("נכון" / "יפה") can still confirm an error **outside** the scenario's misconception list. Example: s5 "if they meet in the middle, they are equal".
- These limitations produce *unanswered* repeats, which are counted as justified, never as loops.

### 11.3 Baseline counts (final)

| measure | run 1 | run 2 | total |
|---|---:|---:|---:|
| conversations / teacher turns / student replies | 12 / 144 / 284 | 12 / 144 / 275 | 24 / 288 / **559** |
| turns without a reply | 2 | 2 | 4 |
| **exact same-student duplicates (final output)** / production guard matches | 0 / 0 | 0 / 0 | **0 / 0** |
| duplicate-guard re-asks (outcome) | 5 (resolved 5) | 10 (resolved 9, dropped 1) | **15** (14 resolved, 1 dropped) |
| neutral prompt-example copies / placeholder leakage / invalid names | 0 / 0 / 0 | 0 / 0 / 0 | **0 / 0 / 0** |
| echoes of the unchanged WRONG example ("אז ריבוע זה (כן) מלבן?", s3, on-topic) | 2 | 0 | 2 |
| student / PCK failures | 0 / 0 | 0 / 0 | 0 / 0 |
| calls with 2 attempts: student (all duplicate re-asks) / PCK | 5 / 0 | 10 / 1 | 15 / 1 (max 2) |
| replies truncated at an ASCII `"` (see §11.5) | 3 | 1 | **4** |
| PCK understanding: same / confused / improved / more_confused / misconception_reinforced | 23 / 16 / 46 / 50 / 9 | 20 / 16 / 34 / 52 / 22 | 43 / 32 / 80 / **102** / 31 |
| Mode B teacher: turns with a pending question / answers given (generic) / probes replaced / validations neutralized | 33 / 25 (9) / 10 / 1 | 40 / 29 (13) / 7 / 2 | 73 / 54 (22) / 17 / 3 |

**Latency:**
- student: p50 1,238 ms, p90 1,807 ms, max 3,968 ms;
- PCK: p50 3,303 ms, p90 4,104 ms, max 11,972 ms.

Every student `finishReason` was `STOP`. Mean reply length was 77 characters, with 1.94 replies per turn.

### 11.4 Manual review

| label | candidates | genuine | not genuine / explained |
|---|---:|---:|---|
| **Repeated question, not yet answered** (justified) | 4 | — | all justified: the full answer had not been given |
| **Repeated question after the full answer** (loop candidate) | 6 | **2** (both s5, under more_confused / misconception_reinforced PCK); 1 borderline (the given definition did not address "is it a separate condition?") | 3 not loops: applying the answer to the drawing, a deeper follow-up ("אבל למה שזה יקרה?"), a challenge to the answer |
| **Semantic repetition** | 39 | **1** (mild: a third restatement of the same inclusion argument at T3/T5/T6, s6) | 22 progress, different content or a natural closing summary; 9 re-asks of unanswered questions (4 of them from harness answer-bank gaps); 4 restatements on a probe ("אוקיי" / "נכון"); 3 restatements of confusion that persists under negative PCK |
| **Persistent misconception** | 2 | **2** confirmed (both s5 cast 0: B in run 1 and A in run 2), both under more_confused PCK on every turn after the explanation | — |
| **Regression** (corrected definition) | 0 | **0** | Manual check of the only near case (run 1, s3 cast 1, [C] T10 → T11): the T10 "resolution" repeats the teacher's same-turn answer, so it is **not** a resolution. T11 is persistence, not regression. No student voiced a misconception after a target-idea turn. |
| **Resolution** (carriers who voiced the misconception: 16) | — | **11** reached the target idea in their own words after the explanation | 5 still confused or partly resolved at the end, all under negative PCK (s3 cast 0 ×2, s5 cast 0 ×2, s5 cast 1 run 2) |
| **Premature correctness** (carrier correct before the explanation) | 2 ledger candidates; carriers judged manually | **7 of 24 carriers** (3 firm, 4 tentative), plus 1 silent | both ledger candidates rejected: correctness driven by a peer, and an echo of the teacher's question. The firm cases are רועי (s1, false dichotomy) and תמר (s4, s5). |
| **Cross-student contamination** | 27 | **0** | 24 are shared lesson wording, canonical statements or generic phrases; 3 ambiguous: a peer's *non-target* confusion taken up as a question ("bisecting ⇒ equal" ×2, appearance-based wording ×1), which is plausible classroom influence (second-review sample S10–S12) |
| **Teacher attributions** | 33 | **4 invented** (3 original + 1 propagated to a peer, in 3 conversations); **3 mixed** (a peer's statement, or the premise of the teacher's question, presented as the teacher's) | 19 accurate; 7 "אמרת" that may address a peer |
| **Prompt-example copying** | 2 | 0 | both are natural on-topic questions that resemble the unchanged WRONG example |

### 11.5 Genuine problems vs harness- or persona-consistent behaviour

- **Harness-created (fixed before the baseline, §11.2):**
  - validations of undetected misconceptions;
  - answers prepended to the questions that ask for them;
  - false regression and persistence candidates;
  - unanswered re-asks from routing gaps.

  In the final runs, only the unanswered re-asks from the remaining answer-bank gaps are harness-related (4 semantic candidates), and they are counted as justified.
- **Consistent with PCK steering or persona (not student-model defects):**
  - both persistent misconceptions and both genuine re-asks after an answer happen under PCK more_confused / misconception_reinforced on every later turn;
  - confusion restated at closings;
  - הילה's / נועה's hedged, appearance-based doubts;
  - low participation of low-baseline personas.
  - **Observation:** PCK rated **167 of 288** teacher turns *problematic*, and 165 of 288 understanding levels are negative (confused, more_confused or misconception_reinforced). This is plausible for a minimal scripted teacher whose probes are "אוקיי" / "נכון" / "?". The students follow that steering, so much of the "persistent confusion" is PCK-driven rather than a failure to carry state.
- **Genuine student-agent issues:**
  1. **Invented or mixed teacher attributions:**
     - 4 invented, in 3 of 24 conversations, plus 3 mixed;
     - examples: "המורה אמרה שריבוע זה סוג נפרד" (the teacher never said it), and the premise of a question turned into a statement ("אבל אמרת שאם הם מאונכים זה מעוין");
     - once **propagated** to a peer, who then reasoned from it.
  2. **Premature correctness of the designed carrier:** 7 of 24 carriers were correct before the explanation, 3 firmly. This weakens the scenario's misconception for practice.
  3. **Truncated replies (production output defect):**
     - 4 of 559 replies stop at an ASCII `"` that the model meant as gershayim ("ס"מ") or a scare quote: "…מלבן שהצלע הארוכה היא 10 ס";
     - under JSON-constrained output the quote ends the string, `finishReason` is `STOP`, and nothing fails;
     - the reply is silently cut and is shown that way to the teacher.
  4. Mild semantic self-restatement: 1 case.

### 11.6 Is explicit per-student state justified?

**Not on this evidence.** After correcting the harness and neutralizing the prompt examples, the baseline shows:
- **no regressions** of resolved misconceptions;
- **no exact repetitions** in the final output (the guard resolved 14 of 15 cases and dropped 1);
- **no genuine semantic loops**;
- only **2 re-asks after an answer**, both under confused PCK.

Students carry their misconception state across turns: persistence and resolution follow the PCK steering and the teacher's answers.

The remaining genuine issues are not about losing track of a student's state:
- attributions are about **grounding who said what** in the history (teacher vs peer, question vs statement);
- premature correctness is about the **initial expression** of the carrier's misconception (persona and scenario);
- truncation is **output encoding**.

Explicit per-student state would not address attributions or truncation. For premature correctness, a scenario-level carrier instruction would be a cheaper and more targeted test.

**Caveats:**
- the sample is 24 conversations with a scripted, minimal teacher;
- one reviewer so far (the second-review sample is pending);
- negative PCK dominates, so late regressions under positive steering are under-sampled;
- with 0 observed regressions in about 16 carrier trajectories, a rare regression rate is not excluded.

### 11.7 Highest-value next student-agent issue

1. **Invented teacher attributions (highest value).** Students should only attribute to the teacher what the teacher actually said, and should not turn the teacher's question into a statement. A candidate is a prompt rule about attributions in the student prompt, tested live with the Mode B harness on the conversations above. A wrong attribution misleads the teacher about what they said, and peers then reason from it. That damages the feedback loop the simulator is for, in about 1 in 8 conversations.
2. **Quick defect fix (separate, small):** prevent the gershayim and quote truncation, for example with an instruction to write abbreviations without ASCII `"` (or with ״), or by server-side detection. It is a correctness bug, not a behaviour question. **Done in 1.3.13:** the abbreviation rule plus detection-only telemetry (`student_quote_truncation_investigation.md` §9). Opening-quote cuts remain rare and are now visible in telemetry.
3. **Then:** carrier misconception expression before the explanation (premature correctness, 7 of 24), possibly together with a check of the PCK level in the opening turns.
