# Student-agent stability: sequential live replay after C8 + C9

Status: evaluation only, run on 2026-10-07 against `SYSTEM_VERSION 1.3.9` with no production code changed. This re-measures pilot issue §2 in `student_agent_findings.md`, as `regression_test_plan.md` §5.1 asked to do after C8 and C9.

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
| 4b T12 | `יפה, תודה.` | יונתן replays T6 (the only speaker) | 6 | 108 |

As in the pilot, the copies are long (59–108 characters), not "כן.".

### 3.2 All-student replay turns

- **Strict pilot definition** (every reply equals that student's previous-turn message): **2 turns** (3a T6, 3b T9).
- **Every reply in the turn is an exact copy of something the same student said earlier:** **5 turns**, the five events above. Three of them copy from more than one turn back, which the strict definition misses.

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
