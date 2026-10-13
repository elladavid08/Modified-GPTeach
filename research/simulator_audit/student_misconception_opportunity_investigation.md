# Do students give the teacher a misconception to work with? (1.4.4 investigation)

**Date:** 2026-10-13. **System:** 1.4.4 working tree (HEAD `9f1c018` plus the uncommitted #8 and return-to-selection changes; the student prompt, PCK prompt and models are those of 1.4.3).

**Question:** after a manual test in which students "felt too smart", does the current student setup reliably give the teacher a real PCK opportunity? An opportunity means:
- one student expresses the scenario's intended misconception;
- it survives until the teacher has meaningfully addressed it;
- the student progresses after a good explanation.

No production code or prompt was changed. All conversations are synthetic: a scripted teacher and the production personas, with no participant data.

## 1. Answer

**C. The current student prompt and steering contract, on `gemini-3.5-flash-lite`, makes students give up the scenario misconception before the teacher has taught anything.** This needs a production fix before teachers practise with it.

- **The misconception usually appears:** in 29 of 36 production-like conversations.
- **It almost never survives the teacher's first good questions:**
  - it is still held when the teacher finally explains in 5 of 36 (3 of them only weakly);
  - in 24 of the 29 conversations where it appears, the carrier talks themself out of it after a diagnostic question, an "everyone agree?" or a peer's argument, with no teaching.
- **This is not bad luck.** The pattern is the same in every scenario and in both cast designs, and the mechanism is visible in every conversation (§4).

## 2. Method

**Bench:** `replay_harness/bench/opportunity.bench.js`, a research-only harness that drives the same real client path as `run.bench.js`: PCK first, then its analysis steers the students, against a local, unmodified server.

**Teacher plan:** fixed, 7 turns. Every turn is addressed to the class except T7.

| turn | move |
|---|---|
| T1 | neutral opening question (the Mode B opening) |
| T2 | a second neutral concept question (e.g. "ומה ההגדרה של ריבוע?") |
| T3 | explicit probe of the scenario misconception, without the answer (the Mode B direct question, addressed to the class, e.g. "האם ריבוע הוא מלבן? מה אתם חושבים?") |
| T4 | diagnostic, no teaching: "מעניין. תסבירו לי איך חשבתם על זה." |
| T5 | no teaching: "אוקיי. כולם מסכימים עם זה?" |
| T6 | the correct explanation (the Mode B explanation, with its drawing) |
| T7 | the check question, addressed to the student who voiced the misconception (else to the class) |

**Arms:**

| arm | casts | student model | conversations |
|---|---|---|---:|
| **R: 1.4.4, production-like** | 3 of the 9 personas drawn uniformly (as the app does), seeded | `gemini-3.5-flash-lite` | 36 (6 per scenario) |
| D: 1.4.4, designed casts | the Mode B designed casts (a persona whose tendencies fit the misconception), probes still class-addressed | `gemini-3.5-flash-lite` | 24 (4 per scenario) |
| P: pre-1.4.0 student model | the same seeded casts as R (paired) | `gemini-2.5-flash-lite`, temperature 0.7, topP 1. This is a research-only preload (`replay_harness/scripts/student_model_override.mjs`) that swaps only the student call; the served model was verified from the API's `modelVersion`. | 36 |

PCK ran on 1.4.4's `gemini-3.1-flash-lite` in all arms. There were 0 PCK failures and 0 student failures in all 96 conversations.

**Labels:** one reviewer (Claude) read every transcript.
- **Appears:** the intended misconception is voiced, firmly or tentatively.
- **Survives a teacher turn:** the carrier still holds it in their next reply after a teacher turn.
- **Held at T6:** still held, or still unsure, when the teacher explains.
- **Self-corrects:** abandons it before T6.
- **Multiple carriers:** more than one student voices it.
- **Conflicting:** another student introduces a different misconception.
- **Unresolved:** still wrong after T6/T7.

The per-conversation labels and outputs are local (`replay_harness/results/O-*`, git-ignored).

## 3. Results

### 3.1 By scenario: arm R (1.4.4, production-like casts; 6 conversations each)

| scenario | appears | survives ≥1 teacher turn | **held until the explanation (T6)** | self-corrects before teaching | never appears (students correct first) | >1 carrier |
|---|---:|---:|---:|---:|---:|---:|
| 1 square / rectangle inclusion | 5 | 3 | **1** | 4 | 1 | 1 |
| 2 perpendicular diagonals ⇒ rhombus | 5 | 2 | **0** | 5 | 1 | 0 |
| 3 rectangle must look long | 6 | 5 | **2** (both weak) | 4 | 0 | 2 |
| 4 diagonal always bisects the angle | 6 | 3 | **2** (1 weak) | 4 | 0 | 0 |
| 5 equal (and perpendicular) diagonals ⇒ square | 4 | 1 | **0** | 4 | 2 | 0 |
| 6 rhombus is not a kite | 3 | 1 | **0** | 3 | 3 | 1 |
| **total (36)** | **29 (81%)** | **15 (42%)** | **5 (14%)**, 3 weak | **24 of 29 (83%)** | **7 (19%)** | 4 |

Other measures:
- **Conflicting misconception at the same time:** 1 of 36.
- **Resolution after the explanation:** 36 of 36. This is trivial, because most carriers had already resolved.

### 3.2 Designed casts (arm D)

**Designed casts do not fix it.**

| scenario | appears | held at T6 |
|---|---:|---:|
| 1 | 3 / 4 | 2 (weak) |
| 2 | 4 / 4 | 0 |
| 3 | 4 / 4 | 1 |
| 4 | 4 / 4 | 0 |
| 5 | 4 / 4 | 1 (weak) |
| 6 | 3 / 4 | 0 |
| **total** | **22 / 24 (92%)** | **4 / 24 (17%)** |

- A carrier-friendly cast makes the misconception surface a little more often.
- It does not make it last: in scenario 2, all four carriers drop it at T5 after a peer offers the kite counterexample.

### 3.3 The same casts with the 2.5 student (arm P)

**The model matters.**

| | 1.4.4 (3.5 Flash-Lite) | 2.5 Flash-Lite, same casts, same PCK |
|---|---:|---:|
| appears | 29 / 36 | 33 / 36 |
| **held until the explanation** | **5 / 36** | **29 / 36** |
| more than one carrier | 4 / 36 | **20 / 36** |
| a carrier still wrong after the explanation (incl. partial) | 0 / 36 | 5 / 36 (2 fully, both in scenario 6) |

Under identical PCK steering:
- **2.5** keeps the misconception until the teacher teaches, but spreads it to two or three students at once.
- **3.5** keeps a single carrier but reasons itself to the answer. It resolves cleanly once taught, but usually before it is taught.

2.5 Flash-Lite retires on Vertex on 2026-10-20, so it is evidence, not an option.

### 3.4 Comparison with the saved 1.4.x Mode B findings

`student_stability_replay.md` §12–§13 reported carriers holding the misconception before the explanation in 17–18 of 24 conversations. Those runs used designed casts and addressed the probe to the carrier by name. Their T3 was a bare "אוקיי" / "יפה":
- **PCK at T3 in Mode B 1.4.1:** "problematic / misconception_reinforced" in 13 of 24, which tells the students to keep the idea.
- **PCK at T4 (a peer question):** "positive / improved" in 21 of 24.

So the earlier persistence came largely from a weak teacher move that the PCK agent punished. A teacher who responds well, with a diagnostic question or "explain how you thought", gets "improved" steering, and the misconception disappears. **The better the teacher's PCK, the less there is to practise on.**

## 4. Mechanism (traced in code and visible in the data)

1. **No designated carrier.**
   - The student prompt (`src/utils/ai.js` `makeProsePrompt`) says that "ONE or TWO students should naturally express this misconception early", and lets the model choose "based on their cognitive profile".
   - The cast is a random 3 of 9 personas, and their `misconception_tendencies` are generic labels (several unrelated to these scenarios, e.g. computational mistakes, formula mixing).
   - The same prompt also says "Possible misconception to watch for" and "Scenario context is BACKGROUND ONLY. Do not force the misconception…".
   - Nothing guarantees that anyone holds the misconception, or for how long.
2. **PCK steering treats a good teacher question as student progress.** The PCK agent rates the teacher's move and also predicts the students' state. In arm R:
   - the misconception probe (T3) is rated positive / understanding "improved" in **36 of 36**;
   - "תסבירו לי איך חשבתם" (T4) in **36 of 36**;
   - "כולם מסכימים?" (T5) in **34 of 36**.

   The same pattern holds in arms D and P.
3. **The student prompt makes that steering binding.**
   - The PCK block is headed "THIS OVERRIDES ALL OTHER INSTRUCTIONS … TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS".
   - Its rules say "If pedagogical_quality = 'positive' → Students MUST show understanding progress" and "If understanding_level = 'improved' → MUST show improvement".
   - Nothing in the prompt says that a question is not teaching.

   So after a good diagnostic question the students are told to progress, and the carrier does so by reasoning their way to the correct answer. Typical replies:
   - "רגע, אם אתה שואל ככה, אז אולי כן?";
   - "אה, עכשיו הבנתי!" (at T3, before anything was explained);
   - often with an invented justification, "אמרת קודם ש…".
4. **3.5 Flash-Lite follows this more literally than 2.5.** It also derives the definition-based answer as soon as a question points at it. With the same steering, 2.5 resisted; 3.5 complies (§3.3).
5. **Peers finish the job.** When the carrier holds, a peer often gives the full correct argument in the same turn (all 4 appearances in scenario 5; most of scenario 2's kite counterexamples), and the carrier then agrees. Peer disagreement is realistic and is itself a teaching opportunity. A peer giving the complete resolution before the teacher has acted is not.

**One student / one misconception** is mostly satisfied on 1.4.4:
- a single carrier in 25 of 29 appearances;
- a conflicting misconception in 1 of 36.

The problem is persistence, not multiplicity. However, 2.5's behaviour shows that making students hold misconceptions without naming who holds them spreads the misconception across the cast. **A persistence fix therefore needs a designated carrier.**

## 5. Fix options

| option | what | assessment |
|---|---|---|
| a. Prompt-only clarification | Tell students that questions are not teaching. | Necessary but probably not sufficient: without a named carrier, more persistence spreads to several students (2.5 evidence). |
| b. Designated carrier + carrier rule (**recommended**) | See below. | Small; deterministic; targets all three failure modes (no carrier, early self-correction, peers resolving). |
| c. Change PCK `predicted_student_state` semantics | Have PCK predict "same" after diagnostic questions. | Touches the PCK prompt and feedback decisions (the research track is paused), and couples the fix to a second model. Not first. |
| d. Explicit per-student state machine | held / shaken / resolved, tracked in code | Heavier. Only if (b) is not enough. |
| e. Make students "less smart" generally | — | Rejected: wrong target. Students should be competent except for the one designated misconception. |

**Recommended fix (b):**
- **Code:**
  - choose one carrier per session, deterministically: for example the first persona of the already shuffled cast, or a scenario-to-tendency match when one fits;
  - pass it to the student prompt;
  - store it as an additive field on the conversation (research needs to know who the carrier was).
- **Prompt:** replace the two conflicting misconception paragraphs with one carrier rule:
  - **Carrier:** <name> sincerely holds <misconception_focus> and voices it when the relevant concept comes up.
  - **Other students:** they do not hold it. They may voice doubt or ask, but they do not give the full correct argument before the teacher has addressed it, and they do not introduce other misconceptions about this topic.
  - **The carrier keeps the misconception through questions and probes:** "why?", "explain how you thought", "does everyone agree?", "is it always true?". There, "improved" means explaining their reasoning more clearly, not changing their mind.
  - **The carrier changes their mind only after the teacher addresses it:** an explanation, a counterexample, a teacher-led definition check, or the teacher endorsing a peer's argument.
  - **After that, they progress normally.**

  The PCK "override" wording should be scoped accordingly: it sets the reaction tone and progress, not the carrier's resolution.

**Validation before release:** rerun this bench (arm R, 36 conversations), Mode B (24) and the duplicate / garble checks.
- **Success:**
  - the misconception appears in ≥ 90%;
  - it is held until teaching in ≥ 80% of appearances;
  - exactly one carrier in ≥ 90%;
  - resolution after the explanation in ≥ 95%;
  - no loops, regressions or duplicates;
  - no carrier still stuck after two teaching moves.
- **Guard against over-stubbornness:** also add a variant where the teacher gives a counterexample at T4 (the carrier should then move).

## 6. Limitations

- One reviewer. "Weak" holds (tentative or unsure) are counted as held.
- A fixed, class-addressed script: real teachers vary. T5 ("כולם מסכימים?") invites peers to answer.
- Scenario 5's probe asks about equal diagonals alone, while the configured misconception is "equal and perpendicular". The carrier's statements mostly matched one or the other.
- 6 conversations per scenario. The per-scenario differences (for example scenario 6 surfacing least) are indicative.
- The PCK model was the same in all arms, so the model comparison isolates the student model only.
