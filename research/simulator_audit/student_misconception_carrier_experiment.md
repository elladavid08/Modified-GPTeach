# Misconception-carrier prototype: experiment (2026-10-13)

**Follows:** `student_misconception_opportunity_investigation.md`, which found that on 1.4.4 the scenario misconception is usually voiced but almost never survives the teacher's good diagnostic questions.

**Goal:** guarantee a realistic opportunity. One student carries the scenario's misconception, keeps it through questions that do not teach, and revises it after real teaching.

**Status:** carrier v1 **promoted to production as 1.5.0** (2026-10-14) after the Mode B release validation (§9). Sections 1–8 describe the experiment as it was run, on the unchanged 1.4.4 production code.
- The prototype lives in the replay harness (`prototype/carrier.js`). Since 1.5.0 it patches the 1.4.4 base `src/utils/ai.js` (commit `cf61c03`, read from git), because v1 is now production code.
- All conversations are synthetic.

> **Update (2026-10-14):** one structural peer control (pc1: an explicit open/addressed state gating the peers) did not reduce peer resolution (16 of 36, the same as v1); see §8. The peer targets were then re-scoped: a peer may give a correct contribution while the carrier still holds the misconception (a realistic classroom dynamic), but must not introduce a different misconception. Carrier v1 alone went to Mode B release validation and passed (§9).

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

## 8. Follow-up (2026-10-14): one structural peer control (pc1). Result: fails, stopped before Mode B

**Question:** can peers be kept from resolving the carrier's misconception before the teacher addresses it, without changing the validated carrier behaviour?

**Answer: no, not with this mechanism.**
- A peer still gives the full resolution or the decisive counterexample before teaching in **16 of 36** conversations, the same as carrier v1 (16 of 36).
- The carrier behaviour is preserved: held until teaching in 30 of 36.
- Per the brief, no Mode B run was made and no further prompt rules were added.

### 8.1 The change (prototype pc1, `prototype/carrier.js` + `prototype/addressedJudge.js`)

The change is one mechanism: an **explicit session state**, `misconception_state = 'open' | 'addressed'`, kept by code instead of being judged by the student model or by PCK.

- **Transition:** a separate one-word classifier ("ADDRESSED" / "NOT_ADDRESSED") reads the teacher's latest message and the scenario misconception.
  - ADDRESSED: an explanation, a counterexample (even as a question), a teacher-led check against the definition, or an explicit confirmation of a correct argument.
  - NOT_ADDRESSED: questions, "explain how you thought", "does everyone agree?", acknowledgements, praise.
  - It runs once per teacher turn, only while the state is open, through the server's existing `/api/completion` endpoint (gemini-3.1-flash-lite). It could run in parallel with PCK.
  - The state is sticky once addressed. A judge failure keeps the state open.
- **What the state gates, in the student prompt only (while open):**
  - **Peer role:** the peer line of the carrier block becomes a state-dependent role rule. Peers may react, doubt, disagree, ask or offer partial reasoning, but not the complete correction or a counterexample that settles it. Once addressed: "all students may reason it through normally".
  - **"Addressed" flag:** PCK's `addressed_misconception` is rendered as "WAS NOT Addressed (lesson state: not yet addressed)".
  - **Peer hints:** PCK hints of `understanding_progress` for a **peer** are rendered as `partial_understanding` (an existing reaction type), without the reason text.
- **Unchanged:** carrier selection, the carrier persistence rule, the PCK request, model and output, routing, the duplicate guard.
- **Inert without a state:** pc1 without a state is byte-identical to v1, and without a carrier to production (`bench/carrier_identity.bench.js`).

### 8.2 Results (36 conversations, same seeded casts and bench as A and B)

| | A: 1.4.4 | B: carrier v1 | **C: v1 + pc1** | target |
|---|---:|---:|---:|---|
| intended misconception appears | 26 | 35 | **36** | ≥ 90% ✓ |
| carrier holds it until teaching | 6 (5 weak) | 29 | **30** (2 weak) | ≥ 85% ≈ (83%) |
| a different, conflicting misconception from a peer | 0 | 0 | **0** | ≤ 5% ✓ |
| a peer agrees with or argues the carrier's same idea | — | 14 | **15** | (acceptable per the brief) |
| peer full resolution (argument) before teaching | 5 | 12 | **12** | ≤ 10% ✗ |
| peer decisive counterexample before teaching | 5 | 4 | **4** | ≤ 10% ≈ (11%) |
| any peer resolution before teaching | 10 | 16 | **16** | — |
| carrier self-corrects before teaching | 20 of 26 | 6 of 35 | **6 of 36** (4 after a peer argument, 2 spontaneous, both in scenario 4 after the judge had unlocked the peers) | spontaneous ≤ 10% ✓ |
| carrier resolves after the explanation | 6 of 6 | 26 of 29 | **26 of 30** (+4 partial, 0 stuck) | ≥ 90% ✓ |

In A and B, yesterday's single peer-resolution label was split: every scenario-2 resolution was the kite counterexample; all others were arguments.

**By scenario (C):**

| scenario | held at T6 | peer full resolution | peer counterexample | peer agrees with carrier |
|---|---:|---:|---:|---:|
| 1 square ⊂ rectangle | 6 | 1 | 0 | 5 |
| 2 perpendicular ⇒ rhombus | 4 | 0 | 4 (the kite, now usually hedged) | 2 |
| 3 rectangle must look long | 6 | 2 | 0 | 2 |
| 4 diagonal bisects the angle | 2 (weak) | 4 | 0 | 0 |
| 5 equal and perpendicular ⇒ square | 6 | 0 | 0 | 4 |
| 6 rhombus not a kite | 6 | 5 | 0 | 2 |

**Compared with B** (held / any peer resolution):

| scenario | B | C |
|---|---|---|
| 1 | 5 / 2 | 6 / 1 |
| 2 | 4 / 4 | 4 / 4 |
| 3 | 6 / 1 | 6 / 2 |
| 4 | 2 / 4 | 2 / 4 |
| 5 | 6 / 0 | 6 / 0 |
| 6 | 6 / 5 | 6 / 5 |

**Scenarios 2 and 4 are not fixed.**

### 8.3 Failure modes

1. **The peer resolutions are not driven by the inputs this mechanism controls.**
   - With the "addressed" flag hidden, peer progress hints downgraded and an explicit "not yet addressed" role rule, peers still produce the argument when it is **a one-step inference from the definition**:
     - scenario 6: four equal sides ⇒ two pairs of equal adjacent sides;
     - scenario 1: a square has four right angles;
     - scenario 4: 90° would have to split into 45°.
   - They also produce **a textbook counterexample** (scenario 2: the kite).
   - The model treats "partial reasoning" as license to state that one step. When the whole correction is one step, partial and full cannot be separated in wording.
   - The one visible effect: the kite is now often raised as a hedged question ("…כמו דלתון? לא בטוח"), which is still the decisive counterexample.
2. **The classifier has a scenario-specific false positive.**
   - It called scenario 4's neutral "מה אתם יודעים על האלכסונים במלבן?" ADDRESSED in 5 of 6 conversations (and the probe in the sixth), and scenario 6's "ומה ההגדרה של מעוין?" once.
   - So in scenario 4 the peer control was effectively off from T2 or T3; scenario 4's result in C does not test pc1.
   - Elsewhere the classifier was correct: NOT_ADDRESSED on every probe, diagnostic and "agree?" turn; ADDRESSED on all 29 explanations reached while still open. Latency p50 0.56 s, p90 0.94 s.
   - This is fixable, but fixing it would not change failure mode 1.

### 8.4 Natural participation and other measures

| T1–T5 (before teaching) | A | B v1 | C |
|---|---:|---:|---:|
| replies per turn | 1.93 | 2.12 | 2.22 |
| turns with a peer reply | — | 93% | 88% |
| peer replies per turn / mean length | — | 1.19 / 95 | 1.28 / 94 |
| peer replies containing a question | — | 35% | 37% |
| silent turns (`responses: []`) | 0 | 0 | 0 |

**Natural participation:** peers stay active and natural. They doubt, ask, offer hedged partial reasoning, and more often side with the carrier's intuition. Nothing reads as scripted or artificially confused.

**Other measures (C):**
- **Failures and retries:** 0 failures; 0 student or PCK retries.
- **Repetition:** 0 duplicate-guard re-asks; 0 duplicates or near-repeats.
- **Garbled replies:** 4.
- **Unknown speakers:** 0.
- **Teacher-attribution candidates:** 74 (A 87, B 78).
- **Latency:** student p50 1.28 s, PCK p50 2.42 s. Lower than A and B, but this reflects server load (C ran alone), not the prototype.
- **Invented teacher attributions by the carrier:** "אמרת קודם ש…" still occurs occasionally, as in B.

### 8.5 Where this leaves the release

- **Peer resolution cannot be controlled through the student prompt and steering.** Carrier v1, pc1, and the earlier wording variants v2 and v3 all land at 16–20 of 36. Stacking more rules is not justified.
- **What remains structurally possible (not built):**
  - **An output-side "peer-resolution guard,"** modelled on the duplicate guard. While the state is open, a classifier checks each generated peer reply for a full correction or counterexample of the carrier's misconception; a flagged reply is re-asked once, else dropped. It would reuse the explicit state and judge (with the scenario-4 false positive fixed), at the cost of one more classification call per turn while open.
  - **Accept peer contributions as a realistic dynamic.** The carrier still holds the misconception until teaching in 30 of 36, so the teacher still has to address it; a peer's correct argument becomes material the teacher can leverage. This means re-scoping the peer targets to "the carrier still needs the teacher".
- **The carrier v1 result itself stands:** 6 → 29–30 of 36 held until teaching, no regressions.

## 9. Release validation on Mode B (2026-10-14): carrier v1 passes, promoted as 1.5.0

### 9.1 Requirement and criteria (re-scoped after §8)

- Exactly one designated carrier per conversation. The carrier reliably expresses the intended misconception and does not drop it for diagnostic questions, praise, probes or "explain your thinking". The carrier changes their mind only after meaningful teaching, then resolves.
- Peers may participate naturally, including correct ideas and disagreement. They must not introduce a different or conflicting misconception.
- **Criteria:**
  - the misconception appears in at least 90% of conversations;
  - the carrier holds it until meaningful teaching in at least 80–85%;
  - spontaneous self-correction before teaching in at most 10%;
  - a conflicting misconception from another student in at most 5%;
  - at least 90% of carriers resolve or clearly progress after teaching;
  - no meaningful regression on the normal Mode B stability metrics.
- A peer's correct contribution is reported, not counted as a failure.

### 9.2 Method

- **Arms:**
  - **A:** committed 1.4.4 (`cf61c03`).
  - **B:** carrier v1 (`HARNESS_STUDENT_PROTOTYPE=carrier`; peer control pc1 not used).
- **Runs:** standard Mode B, 6 scenarios × 2 designed casts × 2 runs = 24 conversations per arm, 12 scripted teacher turns each.
  - Turn script: T1 opening; T2 a question to cast slot A; T3 a bare probe ("אוקיי" / "יפה"); T4 a peer question; **T5 the explanation**; T6 validation; T7 a check question to slot A; T8–T11 content and summary; T12 closing.
  - The Mode B teacher can answer a student's question from the answer bank. That counts as teaching when the answer addresses the misconception (scenario 5 T4 in four conversations).
- **Same conditions for both arms:** local server and models; PCK unchanged; synthetic only.
- **Carrier:** chosen by the session rule (first cast member with a non-low participation baseline). It is often not slot A, so the T2 and T7 questions sometimes go to a peer.
- **Labelling:**
  - automatic metrics from `analyze.js`;
  - manual review of all 48 transcripts, covering every pre-teaching self-correction, every carrier still wrong after teaching, every peer misconception and every pre-teaching teacher-attribution candidate.
  - In A there is no designated carrier, so "holder" is the first student to voice the misconception.
- **Results:** `results/MB-A-1.4.4-run{1,2}-{a,b,c}` and `results/MB-B-carrier-run{1,2}-{a,b,c}` (git-ignored).

### 9.3 Carrier measures (manual, 24 conversations per arm)

| measure | A (1.4.4) | B (carrier v1) | criterion | B result |
|---|---:|---:|---|---|
| intended misconception appears | 22 (92%) | **24 (100%)**; voiced by the carrier itself in 23 | ≥ 90% | pass |
| carrier identity stable (the designated student carries it) | — (no carrier) | **23**; in 1, a peer voiced it while the carrier only hinted | — | — |
| held until meaningful teaching | 15 (63%), often by a silent holder | **21 (88%)**: 19 clearly and 2 wavering but restated; 79% under the strict reading | ≥ 80–85% | pass |
| spontaneous self-correction before teaching | **8 (33%)** + 2 never voiced it | **2 (8%)**, both as a question ("…אז אולי בעצם לא?") | ≤ 10% | pass |
| carrier retreats to uncertainty before teaching (not correct) | — | 1 | — | — |
| conflicting / different misconception from a peer | 0 | **0** | ≤ 5% | pass |
| peer voices the same misconception as well | frequent (holder not designated) | 6 (echo; in 1 of them the only clear voice) | — | descriptive |
| peer correct contribution before teaching | — | 13 full, 8 doubt or partial, 3 none | not a failure | descriptive |
| carrier resolves or clearly progresses after teaching | — | **24 (100%)**: 23 at T5–T7; 1 resisted through T6 and resolved by T8–T11 | ≥ 90% | pass |
| carrier stuck after adequate teaching | — | 0 | — | — |
| post-teaching regression | 0 | 1 (s4: on the T8 parallelogram drawing the carrier says the diagonal bisects the angle "like a rhombus"; corrected at T9) | — | minor |

**By scenario (B):**
- All three hold failures and both self-corrections are in **scenario 4** ("a diagonal always bisects the angle"). The T2 question ("in a rectangle, do the diagonals bisect the angles?") is a pointed counterexample, and the carrier reasons through it (90° → 45° each → "but in a non-square rectangle that does not look right…").
- Scenario 4 held in 1 of 4. Scenarios 1, 2, 3, 5 and 6 held in 20 of 20. Scenarios 2 and 5 each had one wavering-but-held case.
- This matches the opportunity bench (§4.2), where scenario 4 was the weakest.

### 9.4 Mode B stability metrics (automatic, `analyze.js`)

| metric | A (1.4.4) | B (carrier v1) |
|---|---:|---:|
| conversations / turns / student replies | 24 / 288 / 493 | 24 / 288 / 537 |
| turns without a reply | 0 | 0 |
| exact duplicates / guard matches / duplicate retries | 0 / 0 / 0 | 0 / 0 / 0 |
| placeholder leaks / invalid students / unknown speaker | 0 / 1 / 1 | 0 / 0 / 0 |
| repeated question unanswered / after answered | 0 / 0 | 1 (justified: a "why?" answered next turn) / 0 |
| semantic-repetition candidates | 4 | 7 (reviewed: recaps, no loop) |
| teacher-attribution candidates (all / before T5) | 69 / 23 | 84 / 24 |
| garbled-text flags | 8 | 3 |
| quote cuts | 0 | 0 |
| PCK failures / retries; student failures | 0 / 1; 0 | 0 / 0; 0 |
| replies per turn; replies with "?"; mean length | 1.71; 30%; 83 chars | 1.86; 32%; 87 chars |
| turns with a non-carrier reply; carrier share of replies | — | 86%; 37% |
| student latency p50 / p90 | 1133 / 1431 ms | 1167 / 1452 ms |
| PCK latency p50 / p90 | 2327 / 2826 ms | 2334 / 2775 ms |
| PCK levels (same / improved / reinforced / confused) | 54 / 221 / 11 / 2 | 51 / 223 / 11 / 3 |

- **Teacher attribution:**
  - The increase is entirely after teaching (46 → 60), with more replies, and those are recaps of what the teacher actually said.
  - Before T5 the counts are equal (23 vs 24).
  - Misconception-supporting invented attributions ("אמרת ש…" used to back the idea) occur in both arms: about 3 in A and 3 in B. In B they come from the carrier, because the carrier is the one holding the idea.
  - The clearest B case attributes the misconception itself to the teacher ("you said in earlier lessons that equal and perpendicular diagonals are enough"). A has an equivalent case.
  - This is a pre-existing behaviour, not a regression.
- **Natural participation:** peers reply in 86% of turns. The carrier gives 37% of the replies, against one third if speaking were equal, so the lesson is not a one-student dialogue.

### 9.5 Verdict

**Pass.** Every criterion is met:
- appears 100%;
- held 88%;
- self-correction 8%;
- conflicting misconception 0%;
- resolves 100%;
- no stability regression.

The one soft spot is scenario 4, and the strict hold reading (79%) is just under 80%. Both are documented as limitations, not blockers.

### 9.6 Promotion to 1.5.0 (frozen prototype)

- **Frozen:** the 1.5.0 student-prompt texts are v1 unchanged.
  - `src/__tests__/fixtures/studentPromptCarrierV1.json` holds the SHA-256 and length of the student system prompt for 72 cases: 6 scenarios × 3 casts (including an all-low cast) × 4 impact / addendum variants. Each case is hashed with and without the carrier.
  - The fixture was generated from the prototype applied to the 1.4.4 base by `bench/carrier_identity.bench.js`, before production was changed.
  - `studentPromptCarrier.test.js` requires production to match it exactly, and the bench re-checks production against the prototype.
- **Production change:** `src/services/misconceptionCarrier.js`, `src/utils/ai.js`, `src/pages/Chat.jsx`, `src/services/conversationLogger.js` and the contract validator. Details are in `post_pilot_change_status.md` item 12 and in the 1.5.0 changelog.
- **Harness:** the prototypes and their checks now patch the base `cf61c03`.
  - `HARNESS_STUDENT_CARRIER=production` runs Mode B on the production 1.5.0 path, with the carrier from `selectMisconceptionCarrier`.
- **Live smoke on 1.5.0** (`results/MB-smoke-1.5.0`; production `callAI`, local server, `HARNESS_STUDENT_CARRIER=production`; Mode B, 6 scenarios × designed cast 0):
  - **Reliability:** 72 turns, 123 replies; 0 PCK or student failures; 0 duplicates, leaks or invalid students; 1 justified repeat; student p50 1185 ms.
  - **Logging:** `misconceptionCarrier` recorded as `{name, personaId, rule: "first-non-low-v1"}`.
  - **Carrier:**
    - expresses the misconception in 6 of 6;
    - holds it until the T5 explanation in 5 of 6 (scenario 4 again drifts at T3, after "יפה");
    - resolves in 6 of 6: scenario 1 resists through T6 and resolves at T10–T11;
    - 0 conflicting peer misconceptions.
  - **Flags:** the 3 contamination candidates are post-teaching recaps.

### 9.7 Remaining limitations

- **Scenario 4:** the carrier sometimes reasons its way out on the rectangle question before teaching (3 of 4 conversations wavered or self-corrected).
- **Peers:** peers often give the correct argument or the counterexample before the teacher (13 of 24). This is accepted: the carrier still needs the teacher.
- **Invented attributions:** occasional invented "אמרת ש…" attributions by the carrier, including one that attributes the misconception to the teacher. Pre-existing, at the same rate as 1.4.4.
- **The carrier is deterministic given the cast** (the cast itself is random per page load). Slot-A questions in the scripted teacher often address a peer, so real teachers may need to address the carrier to see the full arc.
- **Evidence scope:** a scripted synthetic teacher; 24 conversations per arm; Gemini generation is not deterministic.

