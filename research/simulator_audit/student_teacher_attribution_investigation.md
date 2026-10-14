# Invented teacher attributions: investigation and prompt-rule A/B

Status: investigation only, 2026-10-12, on committed **1.3.13** (`7d37615`). Production code was not modified for this investigation.
- No `SYSTEM_VERSION` bump.
- Synthetic data only; no participant data; nothing written to Firestore.
- Starting point: the 1.3.12 Mode B baseline (`student_stability_replay.md` §11.4–§11.5; `mode_b_baseline_1.3.12_second_review.md` S1–S9).

## Summary

- **The problem is real but narrow.**
  - Invented or mixed teacher attributions are about 0.5% of student replies, and occur in about 1 in 8 conversations.
  - They cluster in the **opening turns (T2–T4)**, before the teacher has taught anything, when the history contains only teacher *questions* and acknowledgements ("אוקיי", "יפה").
- **Four failure patterns:**
  1. a teacher **question's premise** restated as a teacher assertion;
  2. a bare **acknowledgement** read as endorsement and reported as "you said";
  3. a **peer's, the student's own, or general** content attributed to the teacher;
  4. a peer **picking up** an invented attribution.
- **Part of the baseline count is benchmark ambiguity.**
  - The scenario's `ai_prior_knowledge` legitimately implies earlier lessons ("you told us that in a rhombus…").
  - Several "אמרת" replies address a classmate without naming them.
  - The scripted Mode B teacher concentrates the triggers: questions with "אם X, האם Y?" premises, and "אוקיי"/"יפה" probes right after a claim.
- **The prompt already contains five grounding instructions**, all ignored in these cases:
  - "Do not attribute earlier statements to the teacher unless they actually appear in the conversation";
  - "phrase it as their own doubt rather than as 'אמרת קודם ש...'";
  - "NEVER refer to the teacher in third person (המורה, המורה אמרה)";
  - and others (§4).
- **A minimal extra rule did not help.** It defined what counts as a teacher statement. In a live A/B (280 calls):
  - problematic attributions: **9 vs 10**;
  - the rule increased "אמרת" references, which suggests priming;
  - it caused **2 failed turns** through the known opening-quote failure.
- **Not ready for production. No prompt rule is recommended.** §7 lists the next candidates, none of which are rules.

## 1. The baseline cases, re-classified with full context

All 33 attribution candidates of the 1.3.12 Mode B baseline were rebuilt, with every earlier teacher message, the peers' replies and the scenario's prior knowledge (§4.2).

| # | case (final run, scenario, cast, turn, slot) | student claim | what the teacher actually said | class |
|---|---|---|---|---|
| 1 | run 1, s1, cast 1, T3, C | "המורה אמרה שריבוע זה סוג נפרד של מרובע" | T1 "מה ההגדרה של מלבן?", T2 "נועה, האם ריבוע הוא מלבן לדעתך?", T3 "אוקיי" (after נועה's "הם נראים שונה") | **invented**: an acknowledgement taken as endorsement; content not said by anyone |
| 2 | run 1, s1, cast 1, T4, B | "אם המורה אמרה שזה סוג נפרד…" | — | **peer pickup** of #1 |
| 3 | run 1, s2, cast 0, T3, A | "אבל אמרת שאם הם מאונכים זה מעוין" | T2 "אם במרובע האלכסונים מאונכים, האם הוא בהכרח מעוין?", T3 "אוקיי" after her own claim | **invented**: question premise taken as a statement, plus an acknowledgement; also the converse of the prior-lesson fact |
| 4 | run 2, s2, cast 0, T2, A | "…אז זה מעוין. אמרת את זה קודם, לא?" | T1 "מה אתם יודעים על האלכסונים במעוין?" (question only) | **invented**: question premise taken as a statement; converse of prior knowledge; matches the persona's inverse-implication tendency |
| 5 | run 2, s4, cast 1, T4, B | "אבל אמרת שאלכסונים חוצים זה את זה במלבן?" | T4 "מה דעתך על הטענה שבכל מרובע שבו האלכסונים חוצים זה את זה…?" | **mixed**: question premise taken as a statement |
| 6 | run 2, s3, cast 1, T9, A | "פינה של דף או משולש ישר זווית…, כמו שאמרת קודם" | T7 hint "חשבו באיזה כלי אפשר לבדוק…"; the peers named the tools | **mixed**: peer statement attributed to the teacher |
| 7 | run 1, s2, cast 1, T4, C | "המורה, אמרת לנו שבמעוין האלכסונים מאונכים" | question only, **but** the scenario prior knowledge says the students learned it | **legitimate** prior-lesson reference (was "mixed") |

**Re-classified totals for the 33:**
- **accurate: 19 + 1 = 20**;
- **prior-lesson consistent: 4** of the 7 ambiguous ones (s5 cast 1 T2/T4, s6 cast 1 T2, s5 cast 1 run 2 T3: "אמרת קודם ש… שווים ומאונכים" matches s5/s6 prior knowledge);
- **peer reference without a name: 3** (s1 cast 0 run 2 T4 ×2, s3 cast 0 run 2 T4);
- **mixed: 2** (#5, #6);
- **invented: 4** (#1–#4, of which #2 is a propagation and #3–#4 are question-premise distortions of the prior-lesson converse).

## 2. Additional cases in the saved synthetic runs

The scan covered 94 unique multi-turn synthetic conversations: historical 1.3.9–1.3.11 Mode A, smoke runs, the superseded and original baseline runs, and the reruns. It found 146 attribution candidates; 95 were supported by earlier teacher wording, and the rest were reviewed manually. Most of those were accurate:
- references to the teacher's drawings ("שציירת");
- accurate paraphrases;
- named peers ("יובל, אמרת…");
- plural "אמרתם";
- regex hits inside other words.

New problematic cases:

| run | case | claim | teacher actually | class |
|---|---|---|---|---|
| historical 1.3.9 | s3, cast 1, T2 | "המורה אמרה שזה לא חייב להיראות ככה" | only asked "האם מלבן חייב להיות ארוך וצר?" | invented (question premise) |
| historical 1.3.10 | s2, cast 0, T8 | "אמרת מקודם שאלכסונים שחוצים זה את זה זה תכונה של כל המקבילית" | never said (a true fact) | invented (general knowledge) |
| historical 1.3.10 | s2, cast 1, T4 | "אמרת שצריך עוד משהו חוץ מזה שהאלכסונים מאונכים" | "יפה" after a peer's doubt | mixed (acknowledgement); close to accurate |
| baseline 1.3.12 run 1 (non-final) | s4, cast 1, T3 | "אמרת שבריבוע האלכסונים לא תמיד חוצים זווית" | question + "יפה"; the student said it herself | mixed (own statement) |

**Across all synthetic transcripts:** about 6 invented (incl. 1 propagation) and about 4 mixed, in 94 conversations (about 2,150 replies). That is about 0.5% of replies; 7 of the 10 occurred at T2–T4.

## 3. Failure patterns

| pattern | cases | typical shape |
|---|---|---|
| P1 question premise → teacher assertion | #3, #4, #5, historical 1.3.9 s3 | the teacher asks "אם X, האם Y?" and the student says "אמרת ש-X ⇒ Y" |
| P2 acknowledgement → endorsement | #1, #3, historical 1.3.10 s2 cast 1 | "אוקיי"/"יפה" after a student's claim, then "אמרת ש…" / "המורה אמרה ש…" |
| P3 peer / own / general content → teacher | #6, historical 1.3.10 s2 cast 0, run 1 s4 cast 1 | a classmate (or the student) said it, or it is true background knowledge |
| P4 propagation | #2 | a peer reasons from the invented attribution ("אם המורה אמרה…") |

Distortions of the **prior-lesson fact** (s2: "in a rhombus the diagonals are perpendicular" taken as "if perpendicular, then rhombus") fit the s2 misconception and the inverse-implication persona. That is realistic student behaviour, but the simulator shows it as a claim about the live teacher.

## 4. Likely causes in the prompt and history representation

1. **Existing grounding rules are present and ignored.** The 1.3.13 prompt already has, since 2026-03-17 (`07983fa`):
   - STEP 3: "If you refer to something said earlier, it must appear in the actual conversation history. Do not invent earlier teacher or student statements";
   - the guidelines: "Ground responses in the actual conversation history";
   - "If a student challenges the teacher, base it on what was really said…";
   - "Do not attribute earlier statements to the teacher unless they actually appear in the conversation";
   - "If a student senses a contradiction but it was not explicitly said earlier, phrase it as their own doubt rather than as 'אמרת קודם ש...'";
   - "NEVER refer to the teacher in third person (המורה, המורה אמרה)".

   Third-person "המורה אמרה" still occurs (#1, #2, and in both A/B conditions).
2. **An instruction models "אמרת" as the default way to address the teacher:** "ALWAYS address the teacher directly in second person (אתה/את, **אמרת**, שאלת)".
3. **PCK steering frames acknowledgements as validation.**
   - The prompt defines `reinforced_acceptance` as "accepts a wrong idea more confidently after teacher validation", and allows a change of view when "the teacher validates a wrong idea".
   - Frozen PCK for the failure contexts: in F3, "תמר reinforced_acceptance — …the teacher's 'Okay' did not correct this"; in F8, "יובל … likely to accept the teacher's acknowledgement as confirmation".
   - F1 had no such framing, so the invention there came from the student model alone.
4. **History representation:**
   - Teacher turns are plain `user` messages without a speaker label (the system prompt is merged into the first). Student turns are `model` messages with a `name: ` prefix (C8).
   - Own-statement misattributions (run 1 s4 cast 1 T3; A/B F4 r4 and F7) show the model sometimes loses track of *who* said a sentence.
   - That a missing teacher label causes this is a plausible but untested contributor.
5. **Scenario prior knowledge** ("התלמידים כבר יודעים ש…") makes "you told us" legitimate for those facts, and invites converse distortions.
6. **Long-history effects: not involved.** The failures are early (T2–T4), with short histories.
7. **Prompt examples / neutral examples: not involved.** No case echoes an example.

## 5. Live A/B of a minimal grounding rule

**Rule B** is one bullet, inserted directly after the existing "Do not attribute earlier statements to the teacher unless they actually appear in the conversation" guideline. Nothing else was changed, which was verified per request.

> - Count as the teacher's statements only what the teacher actually asserted. A teacher's question (for example 'אם X, האם Y?'), a brief acknowledgement such as 'אוקיי' or 'יפה', or something a classmate said is not a teacher statement, so never report it as 'אמרת ש...' or 'המורה אמרה ש...'.

**Method:**
- Real PCK → student path on the local unmodified server, with the raw-capture preload.
- A = the 1.3.13 prompt.
- Each context was rebuilt exactly, with PCK frozen per context and shared by A and B; the condition order alternates.
- 280 calls / 299 raw responses:
  - **8 failure contexts** × 12 calls per condition: #1, #2 (with the invented T3 line in the history), #3, #4, #5, #6, historical 1.3.9 s3 T2, run 1 s4 cast 1 T3;
  - **4 accurate-reference contexts** × 8: turns where students correctly quoted the teacher;
  - **2 ordinary explanation turns** × 6.
- Attributions were found by regex; each was checked against every earlier teacher message, and then all of them were classified **manually**.

| | A | B |
|---|---:|---:|
| **Failure contexts:** invented / propagated / distorted | **4** (F1 ×2 "המורה אמרה…", F2 pickup, F4 "כי ככה לימדת אותנו") | **7** (F1 ×2, F2 ×3 incl. 2 conditional pickups "אם המורה אמרה שזה סוג נפרד", F3 ×2 "אמרת קודם ש…") |
| **Failure contexts:** mixed (own or peer content) | 2 | 1 |
| **Accurate controls:** problematic (question premise / distortion / own) | 3 | 2 |
| **All problematic attributions** | **9** | **10** |
| accurate references to real teacher statements (accurate controls) | about 10 | about 20 (G3 0 → 4, G4 1 → 7) |
| failed turns | 0 | **2** (G2: both attempts closed a string at an opening quote and padded to `MAX_TOKENS`) |
| addressed student answered | 72 / 72 | 72 / 72 |
| misconception claims (failure contexts) | 24 | 24 |
| hedged replies (failure contexts) | 38 / 166 | 45 / 162 |
| mean length (failure / accurate / ordinary, characters) | 79 / 74 / 89 | 83 / 77 / 86 |
| student latency p50 / p90 (failure contexts) | 1,121 / 1,819 ms | 1,127 / 1,712 ms |

**Reading:**
- **No reduction in problematic attributions.** The F1 invention reappears at the same rate in both conditions (about 2/12).
- **B increases references to the teacher** ("אמרת…"). They are mostly accurate, but this is the opposite of the intended effect, and is consistent with priming by the rule's own quoted forms.
- **B triggered two turn failures** through the known opening-quote decoding failure. This is plausibly related to the rule's quoted examples, which mirrors the quote-priming observation in `student_quote_safety_experiment.md` §9.4.
- **No change in responsiveness, misconception preservation, verbosity or latency.**
- **No awkward avoidance** of referring to the teacher.

## 6. Answers

- **Root patterns:**
  - question premise → teacher statement;
  - acknowledgement → endorsement;
  - peer / own / general content → teacher;
  - peer propagation.

  All are concentrated in the opening turns, before any teacher explanation.
- **Real student-agent issue or benchmark ambiguity:** both.
  - **Real:** fabricated "המורה אמרה…" and premise-to-statement errors are reproducible (F1 about 2/12 per condition) and break explicit existing rules.
  - **Benchmark-amplified:** the Mode B script's premise questions and bare "אוקיי"/"יפה" probes after a claim, the scenario prior-knowledge field, and unnamed peer "אמרת" account for a large share of the 33 baseline candidates. Natural rate across all synthetic runs: about 0.5% of replies.
- **Does a small prompt rule fix it?** No. The tested rule did not reduce invented or mixed attributions (9 vs 10), increased teacher references, and caused 2 failed turns.
- **Ready for a versioned change:** no. Nothing should be shipped from this experiment.

## 7. Candidate next steps (not implemented, not tested)

None of these adds prompt text:
1. **Label teacher turns in the student-model history** ("Teacher: …"). This is symmetric to C8 for students, so the model always sees who said each sentence. Targets P1/P3 and own-statement confusion. Needs the same history-format tests as C8 and a live A/B on the F contexts.
2. **Remove the "אמרת" example** from "ALWAYS address the teacher directly in second person (אתה/את, אמרת, שאלת)", keeping the instruction. This is a deletion, not new text.
3. **Revisit the PCK steering vocabulary** that equates "אוקיי" with validation (`reinforced_acceptance` "after teacher validation"). That is PCK scope and needs its own review.
4. **Optional measurement (content-free):** a telemetry counter for second-person or third-person teacher attributions whose content words do not appear in earlier teacher turns. It would be noisy (§2 needed manual review), so it is suited to research use, not production.

**Recommended order:** (1) as a small history-format A/B on these F contexts; then (2). Before either, decide whether prior-lesson references ("you told us…") are desired behaviour, since the scenario prior knowledge invites them.

## 8. Limitations

- **Sample sizes:** 12 calls per failure context per condition; the A/B differences are within noise, except the 2 failures.
- **Manual classification by one reviewer.** Peer vs teacher addressee for a bare "אמרת" is inherently ambiguous.
- **Contexts are concentrated:** the 8 failure contexts come from s1–s4; F2's history contains the invented line by design.
- **Analysis files** (scratchpad `c25/`):
  - `attr_cases.json` (the 33 baseline cases), `scan_attr.py` / `attr_scan.json` (corpus scan);
  - `attr.bench.js`, `capture.cjs`, `analyze_attr.mjs`;
  - `raw_capture.jsonl`, `client_results.json`, `frozen_pck.json`, `review.json`.
