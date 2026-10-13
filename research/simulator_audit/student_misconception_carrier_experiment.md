# Misconception-carrier prototype: experiment (2026-10-13)

**Follows:** `student_misconception_opportunity_investigation.md`, which found that on 1.4.4 the scenario misconception is usually voiced but almost never survives the teacher's good diagnostic questions.

**Goal:** guarantee a realistic opportunity. One student carries the scenario's misconception, keeps it through questions that do not teach, and revises it after real teaching.

**Status:** experimental only.
- No production code, prompt or `SYSTEM_VERSION` changed. The prototype lives in the replay harness (a patched copy of `src/utils/ai.js` built at run time).
- The 1.4.4 UI and reliability work (briefing panel, attempted-scenario marks, return to selection, history reset) is untouched and separable.
- All conversations are synthetic.

## 1. Answer

**Partial pass.**

**What it fixes:**
- The carrier rule removes the core failure, with no regressions in failures, repetition, duplicates or latency. On production-like casts with the same teacher script, the misconception is still held when the teacher finally explains in **29 of 36** conversations, against **6 of 36** on 1.4.4.
- In scenarios 1, 3, 5 and 6 the carrier holds it in essentially every conversation, through:
  - the neutral probe;
  - the targeted probe;
  - "explain how you thought";
  - "does everyone agree?".
- After the explanation, carriers resolve.

**What it does not meet:**
- **The peer targets.**
  - Peers often share the intuition: more than one holder in 11–14 of 36.
  - Peers often give the full resolution or the decisive counterexample before the teacher does: 16–20 of 36.
  - Two further variants that changed only the peer instructions did not move either number.
- **Scenarios 2 and 4 stay weak:** held in 2–4 of 6, because any peer can produce the kite counterexample or the 45° argument, and the carrier then gives in.

## 2. The prototype (exact change)

`replay_harness/prototype/carrier.js` produces a patched copy of `src/utils/ai.js` (5 exact replacements plus 3 helper functions). The changes are **active only when the scenario object passed to the student call has `misconception_carrier`**. Without it, the outgoing request is byte-identical to production; this is checked for all six scenarios, with and without PCK steering, by `bench/carrier_identity.bench.js`.

**Carrier selection (session-level, in code):** `selectCarrier(cast)` picks the first cast member whose participation baseline is not "low", else the first.
- The cast is already a uniform random draw, so the carrier is random but rarely a student who seldom speaks.
- The identity is fixed for the session and passed with every student call.
- PCK receives the unmodified scenario.

**Prompt changes (v1):**
1. **Compact context:**
   - the line "Possible misconception to watch for" is dropped;
   - "Do not force the misconception into every turn" is replaced by "The lesson's misconception belongs to one designated student (see MISCONCEPTION CARRIER below)".
2. **The "TARGETED MISCONCEPTION / LIFECYCLE" block** ("ONE or TWO students… choose student(s)") is replaced by a **MISCONCEPTION CARRIER** block:
   - <carrier> sincerely holds <misconception_focus> and is the only one who does;
   - the carrier voices it naturally when the concept comes up, never repeating the same sentence;
   - the carrier **keeps it** through questions, "why?", "explain how you thought", "does everyone agree?", acknowledgements and praise: these are not teaching;
   - the carrier revises it only after the teacher actually addresses it (an explanation, a counterexample, a definition check led by the teacher, or explicitly confirming a correct argument);
   - peers may doubt or ask, but not give the full explanation or the decisive counterexample first.
3. **PCK steering:**
   - the header "THE FOLLOWING ANALYSIS TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS" gains an exception for the carrier rule;
   - one paragraph under "MANDATORY ALIGNMENT RULES" scopes `positive` / `improved` / `addressed_misconception` to tone, confidence and conversational progress for the carrier: progress means explaining their reasoning more clearly or sounding less sure, not reaching the correct conclusion.

   This matters because PCK rated the probe and "explain how you thought" as positive / understanding "improved" with `addressed_misconception: true` in 36 of 36 conversations. The PCK model, prompt and output are unchanged.

**Variants tested** (`{ variant }` in `buildCarrierModule`):
- **v1:** as above.
- **v2:** peers do not agree with or argue for the idea, and leave the counterexample and full resolution to the teacher; the carrier does not test the idea on their own initiative; the steering exception also covers the peers (their "understanding_progress" before teaching means doubt, a question or a partial idea).
- **v3:** v2, plus the peers "do not know the full answer yet either" and do not come up with a counterexample.

## 3. Method

**Bench:** `bench/opportunity.bench.js` 1.1.0, the same 7-turn class-addressed teacher plan as the investigation, with the same seeded production-like casts (6 per scenario) in every arm.

| turn | move |
|---|---|
| T1 | neutral opening |
| T2 | neutral concept question |
| T3 | misconception probe |
| T4 | "explain how you thought" |
| T5 | "does everyone agree?" |
| T6 | correct explanation |
| T7 | check addressed to whoever voiced the misconception |

**Bench-only change (1.1.0, applied to all arms):** scenario 5's probe and check now target the configured misconception ("equal **and** perpendicular diagonals ⇒ square"). The Mode B direct question asked about equal diagonals alone. Telemetry and the first student prompt are recorded per run.

**Arms:** 36 conversations each.

| arm | student path |
|---|---|
| **A** | production 1.4.4 (`OX-current-*`) |
| **B v1** | `OX-carrier-*` |
| **B v2** | `OX-carrier2-*` |
| **B v3** | `OX-carrier3-*` |

Same models (student `gemini-3.5-flash-lite`, PCK `gemini-3.1-flash-lite`) and a local unmodified server.

**Labels:** one reviewer read all 144 transcripts.
- **Appears:** the intended misconception is voiced.
- **Held:** still held, or still unsure, by its carrier when the teacher explains at T6.
- **Self-corrects:** gives it up before T6.
- **>1 holder:** a peer firmly voices or argues the same idea (brief "sounds logical" agreement is counted separately as weak).
- **Peer full resolution:** a peer gives the correct conclusion with a justification, or names the decisive counterexample, before T6.
- **Resolves:** correct at T6/T7.

Labels are local (`results/OX-manual-labels.json`, git-ignored).

## 4. Results

### 4.1 Overall (36 conversations per arm)

| | **A: 1.4.4** | **B v1** | B v2 | B v3 | target |
|---|---:|---:|---:|---:|---|
| intended misconception appears | 26 (72%) | **35 (97%)** | 36 (100%) | 35 (97%) | ≥ 90% ✓ |
| exactly one holder | 16 of 26 (62%) | 21 of 35 (60%) | 25 of 36 (69%) | 23 of 35 (66%) | ≥ 90% ✗ |
| conflicting (different) misconception from a peer | 0 | 0 | 0 | 0 | ≤ 5% ✓ |
| **held until the teacher's explanation** | **6 (17%)**, 5 weak | **29 (81%)** | 30 (83%) | 28 (78%) | ≥ 85% ✗ (close) |
| self-correction before teaching (of appearances) | 20 of 26 (77%) | 6 of 35 (17%) | 6 of 36 (17%) | 7 of 35 (20%) | ≤ 10% ✗ (see below) |
| …of which spontaneous (no peer argument before it) | most | ≈ 1 | ≈ 1 | ≈ 2 | ≤ 10% ✓ |
| peer full resolution before teaching | 10 | 16 (44%) | 20 (56%) | 20 (56%) | ≤ 10% ✗ |
| carrier resolves after the explanation (of those still holding) | 6 of 6 | 26 of 29 (+2 partial, 1 still stuck) | 30 of 30 (3 partial) | 27 of 28 (1 slid back at T7) | ≥ 90% ✓ |

- **Self-correction:** nearly all carrier self-corrections in B follow a peer's counterexample or full argument. Under the prototype, carriers no longer talk themselves out of it because of a good question.
- **"Partial":** the carrier accepts the taught idea but asks a transfer question at T7. In scenario 3 this is "if all sides are equal it's a square, so how is it a rectangle?", which the T6 explanation did not cover.

### 4.2 By scenario (6 conversations each)

| scenario | arm | appears | **held at T6** | >1 holder | peer full resolution |
|---|---|---:|---:|---:|---:|
| 1 square ⊂ rectangle | A | 2 | 2 (weak) | 1 | 2 |
| | v1 / v2 / v3 | 6 / 6 / 6 | **5 / 6 / 6** | 2 / 3 / 2 | 2 / 3 / 2 |
| 2 perpendicular diagonals ⇒ rhombus | A | 5 | 0 | 1 | 5 |
| | v1 / v2 / v3 | 6 / 6 / 6 | **4 / 3 / 2** | 2 / 1 / 1 | 4 / 5 / 6 |
| 3 rectangle must look long | A | 6 | 0 | 4 | 0 |
| | v1 / v2 / v3 | 6 / 6 / 6 | **6 / 6 / 6** | 5 / 2 / 2 | 1 / 2 / 2 |
| 4 diagonal always bisects the angle | A | 5 | 0 | 1 | 2 |
| | v1 / v2 / v3 | 5 / 6 / 5 | **2 / 3 / 2** | 1 / 0 / 1 | 4 / 5 / 4 |
| 5 equal and perpendicular diagonals ⇒ square | A | 5 | 2 (weak) | 1 | 0 |
| | v1 / v2 / v3 | 6 / 6 / 6 | **6 / 6 / 6** | 2 / 2 / 4 | 0 / 0 / 0 |
| 6 rhombus is not a kite | A | 3 | 2 (1 weak) | 2 | 1 |
| | v1 / v2 / v3 | 6 / 6 / 6 | **6 / 6 / 6** | 2 / 3 / 2 | 5 / 5 / 6 |

**Per-turn hold (B v1):** where the carrier voices it by T3, it is still held after the probe (T3), after "explain how you thought" (T4) and after "does everyone agree?" (T5) in every conversation of scenarios 1, 3, 5 and 6. Scenarios 2 and 4 lose it at T4–T5, right after a peer's kite example or angle argument.

### 4.3 Regressions and other measures (automatic, `scripts/opportunity_metrics.mjs`)

| | A | v1 | v2 | v3 |
|---|---:|---:|---:|---:|
| student / PCK failures | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| calls needing a retry (student) | 0 | 1 | 0 | 0 |
| duplicate-guard re-asks / final same-student duplicates | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| near-repeats (edit similarity ≥ 0.7 to an earlier reply of the same student) | 0 | 0 | 0 | 1 |
| garbled replies (telemetry) | 5 | 6 | 9 | 6 |
| replies under a non-cast name ("מעוין" / "מעין" for מעיין) | 0 | 1 | 0 | 4 |
| replies per turn / mean length | 1.94 / 99 | 2.15 / 96 | 2.29 / 97 | 2.27 / 98 |
| student latency p50 / p90 | 1.69 / 2.41 s | 1.71 / 2.39 s | 1.56 / 2.07 s | 1.60 / 2.18 s |

- **Repetition:** the carrier rephrases rather than repeats. No loops were seen in manual review.
- **Speaker-name slips:** the misspelled name is the known 3.5 slip of the name מעיין in rhombus scenarios. It also appeared before this experiment, and the 1.4.2 telemetry counts it.
- **Attribution (new, small):** a carrier occasionally justifies the misconception with an invented teacher statement ("אבל אמרת שריבוע ומלבן הם שתי צורות שונות"). This happened in roughly 2–4 of 36 carrier conversations, against about 0–1 in A. One sentence in the carrier block ("present it as your own idea, never as something the teacher said") should cover it.

## 5. Interpretation

1. **One carrier and a fixed identity work.**
   - The intended misconception now appears in essentially every conversation, voiced by the designated student.
   - Good questioning no longer erases it.
   - The steering exception is what makes the difference: the PCK block's "MUST show understanding progress" is now limited to tone and progress.
2. **The peers are not controllable through prompt wording.**
   - Three peer formulations (v1–v3) gave the same rates.
   - The model readily produces a well-known counterexample (scenario 2, the kite) or an easy calculation (scenario 4, 45°).
   - In scenarios 3, 5 and 6 peers also often voice the same intuitive misconception.
   - These are plausible classroom dynamics, and in most of these conversations the carrier still holds the misconception for the teacher to address. They do miss the stated targets.
3. **v2 and v3 add text without measurable benefit.** v1 is the smallest effective version.

## 6. Options from here (not implemented)

1. **Promote v1 with the limitation documented.**
   - It moves "held until teaching" from 17% to 81%, with no regressions.
   - It still needs the one Mode B validation run before release: 12-turn conversations check that resolution is not over-stubborn and that behaviour after resolution is normal.
2. **One structural experiment on peers before promotion.** Prompt wording has been exhausted. Candidates:
   - Rewrite peer entries in PCK's `student_reaction_hints` before teaching. The hints name peers with "understanding_progress" on the probe turns. Any rewrite would be on the student side; the PCK model and prompt stay unchanged.
   - Tell peers to answer class-wide probes only with a doubt or question until the carrier has spoken.
3. **Accept peer resolution as realistic, and re-scope the targets** to the carrier: held through teaching, resolved after teaching.

**If promoted (sketch only):**
- **Code:**
  - `ai.js` gets the v1 carrier block and the steering exception, gated on `scenario.misconception_carrier`;
  - `Chat.jsx` chooses the carrier once per session (`selectCarrier`) and passes it to the student call only;
  - add the attribution sentence from §4.3.
- **Data:** an additive top-level field on the conversation, for example `misconceptionCarrier: { name, personaId, rule: "first-non-low-v1" }`. It is not stored inside the scenario snapshot, which stays a copy of the config.
  - Existing conversations simply lack it, which means pre-carrier behaviour.
  - The contract validator, viewers and exports treat it as optional.
- **Version:** **1.5.0**, a student-behaviour change that breaks comparability with 1.4.x research data, kept separate from the 1.4.4 UI release.

## 7. Limitations

- **One reviewer.** The ">1 holder" and "peer full resolution" judgements are the softest labels.
- **One fixed, class-addressed teacher script:**
  - T5 ("does everyone agree?") explicitly invites peers to weigh in;
  - a teacher who addresses the carrier directly would likely see fewer peer resolutions.
- **6 conversations per scenario per arm.**
- **Scenario 3's T7** asks about an equal-sided rectangle (a square), which the T6 explanation does not cover. "Partial" there reflects the script, not stubbornness.
