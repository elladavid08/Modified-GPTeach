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
