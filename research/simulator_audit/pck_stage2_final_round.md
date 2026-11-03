# Final Stage-2 candidate (A1i design): rubric resolution and freeze

Status: research only, 2026-10-29, on committed **1.5.1** (`6452787`). Production code, models and `SYSTEM_VERSION` are unchanged.

- **Freeze:** `pck_eval/x12/FINAL_FREEZE.md`, hashes in `pck_eval/x12/FINAL.sha256`.
- **Production plan:** `pck_a1i_implementation_plan.md`.
- **Regression protocol:** `pck_eval/x12/REGRESSION_PROTOCOL.md`.

**No fresh validation.** No new expert annotations are collected and there is no fresh blind validation set.
- Every number below is development or **non-blind** regression evidence.
- The B200 consensus and agreed tiers were already used in earlier rounds.
- The synthetic decision cases were written by the developer who wrote the rubric.
- The next human validation is the educational team's end-to-end review of the implemented simulator.

## 1. Decisions and how each rule was resolved

**Evidence hierarchy (set by the team):**
1. the team's latest feedback;
2. the existing B200 expert annotations and comments;
3. older guidelines.

| rule | decision | evidence |
|---|---|---|
| Interpretation, articulation | stating what lies behind the error without probing it = **1**; 2 needs actual probing / verification / elicitation | team decision |
| Interpretation, a question about the mathematics | a question about the mathematics itself (what the definition says, what to check) is **0**, never 2 | the team's latest feedback on their "what do you check…?" case (a missed interpretation) |
| Leveraging after resolution, bare acknowledgement / praise | "כן", "בדיוק", "כל הכבוד", thanks, goodbye **without content** = **not relevant** | team decision; it overrides older B200 labels that marked some of these 0 |
| Leveraging, summary or closing that stays local (open point a) | relevant, **0** | B200 consensus: every local summary / closing with the conclusion is 0. At closing positions annotator 1 marks 9 / 9 explicit summaries relevant (6 of them 0); annotator 2 marks 3 / 5 relevant. Goodbye / thanks without content: unmarked in all 2 consensus and 5 double-annotated cases |
| Leveraging, restating the resolved conclusion (open point b) | relevant, **0** when it stays with this case, even briefly or inside praise; a general principle beyond this case without applying it = **1** | B200 consensus: all 9 turns where the teacher confirms and restates the resolved conclusion locally are 0. The turns that open a new direction or state a broader principle are 1; the one that states the principle and applies it is 2. Double-annotated: both annotators 0 on 3 such turns, both unmarked on 2 very short ones, split on the rest. The team's latest feedback: Leveraging scores were too high |
| No relevant / displayable row left (open point c) | **no feedback that turn**: no container, no placeholder. Stage 1 stays the first gate; Stage 2 can veto the display | team decision |

**Conflict resolved in the team's favour:** B200 annotators sometimes marked a bare acknowledgement or a content-free praise after resolution as a missed Leveraging opportunity (0).
- Annotator 1: 5 of 6 bare acknowledgements at closing positions.
- Consensus: one praise with a name.
- The team's latest feedback rules these not relevant, so the candidate follows the team.

**Conflict NOT resolved by a rule change (APR on a pure "why do you think" question):**
- The team's comment on their case: APR is "not really relevant" there.
- B200 consensus: marks APR on every "why" turn (5 / 5).
- The comment is about one case and generalising it would contradict all consensus labels, so APR is unchanged. This is flagged for the team review (§4).

## 2. What changed from the first freeze

| | first freeze (v4 + guard v1) | **final (v5c + guard v2 + suppression)** |
|---|---|---|
| Leveraging relevance | resolved AND the move generalises / extends / compares / asks what was learned / summarises or closes; "repeating the student's correct answer" not relevant | resolved AND the move takes up what was learned: **restates or summarises the conclusion (even briefly, inside praise)**, closes with that content, asks what was learned, generalises, extends, compares. Acknowledgement / praise / thanks / goodbye **without content** not relevant |
| Leveraging 0 / 1 | 0 = summarises / closes / asks what was learned, local. 1 = invites a new case, comparison or broader question, not developed | 0 = **restates or summarises this case's conclusion** (even in general words), closes with it, or asks what was learned. 1 = also **states a general principle beyond this case without applying it**, plus what is still missing for 2 |
| Interpretation | team decision 1 (articulation = 1) | + **a question about the mathematics itself is 0, never 2** |
| guard | closed list, ≤ 5 words, no "?" | v2: + letter stretching normalised ("כןןן", "נכוון"); + gender / number praise forms, pronouns, class address words. All 24 B200 messages it matches are acknowledgements |
| no row left | "no rows", steering "partial" | **no feedback**; the students are steered as on any turn without feedback (the Stage-1 analysis, unchanged) |

**Intermediate variants (rejected, with the reason):**
- **v5:** missing "what is still missing for 2" in Leveraging 1. 11 attempts returned a Leveraging 1 without improvement text, giving 4 Stage-1 fallbacks on dev.
- **v5b:** fixed the fallbacks, but scored the team's "what do you check…?" case as probing (Interpretation 2) in 7 / 8 samples, and Interpretation recall dropped (dev 0.32).

## 3. Results

**Development (A1-only tier, 142 shown turns × 2 samples):**

| | frozen X12 v3 | first freeze | **final** |
|---|---|---|---|
| Identification F1 / signed | 0.56 / −0.21 | 0.59 / −0.05 | 0.59 / −0.16 |
| Characterisation F1 | 0.26 | 0.25 | 0.26 |
| Interpretation recall / precision | 0.53 / 0.23 | 0.47 / 0.22 | **0.59** / 0.21 |
| APR signed / exact | +0.17 / 46% | +0.17 / 48% | +0.13 / 49% |
| Leveraging wrongly surfaced | **12%** | 15% | 17% |
| Leveraging signed / exact / κw | +0.17 / 69% / 0.02 | +0.26 / 78% / 0.44 | +0.21 / **80% / 0.54** |
| all-green feedback | 14% | 12% | 8% |
| suppressed (no feedback) | — | 1.8% | 2.8% |
| Stage-1 fallbacks | 0 | 0 | 0 |

**Consensus / agreed tiers (non-blind regression; one Stage-2 run on each of three Stage-1 passes):**

| | frozen X12 v3 | first freeze | **final** |
|---|---|---|---|
| Identification F1 | 0.57 / 0.46 | 0.52 / 0.53 | 0.50 / 0.51 |
| Characterisation F1 | 0.47 / 0.26 | 0.39 / 0.27 | 0.46 / 0.21 |
| Interpretation recall | 0.24 / 0.50 | 0.27 / 0.50 | 0.24 / 0.50 |
| APR F1 / signed | 0.80 −0.09 / 0.84 −0.03 | 0.79 −0.15 / 0.85 −0.06 | 0.79 −0.19 / 0.84 −0.09 |
| Leveraging F1 | 0.73 / 0.51 | 0.73 / 0.46 | 0.66 / 0.43 |
| Leveraging wrongly surfaced | 12% / 15% | 16% / 18% | 19% / 19% |
| Leveraging exact / signed | 55% +0.57 / 93% −0.08 | 52% +0.64 / 90% −0.13 | **64% +0.44** / 78% −0.24 |
| all-green feedback | 16% | 13% | 9% |
| steering vs expert κ / "strong" while the expert sees partial / none | 0.39 / 13% | 0.31 / 17% | 0.29 / 14% |
| suppressed / fallbacks | 0 / 0 | 0.5% / 0 | 1.7% / 0 |

- **1.5.1 steering:** the Stage-1 steering it replaces had κ about 0.09 and "strong" while the expert sees partial / none on 46% of turns (`pck_steering_dependency_experiment.md`).
- **Stage-2 call:** p50 2.0 s, p90 2.3–2.4 s; about 3.5–4.1k input / 0.45k output tokens.

**Team cases (exact, local) and paraphrases, 8 samples each, final:**
- **Leveraging cases** (partial 1, early not relevant, on "כן"): all 8 / 8.
  - On the paraphrased "כן" case feedback is suppressed in 7 / 8 samples. On the exact case the remaining rows are shown, without Leveraging.
- **Articulation case:** Interpretation 1 in 8 / 8 shown samples (the team's "orange").
- **"What do you check…?" case:** Interpretation relevant with 0 in 8 / 8 exact and 8 / 8 paraphrase (first freeze: 2 in 3 / 8; v5b: 2 in 7 / 8).
- **Pure "why" case:** Interpretation ≥ 1 in 4 / 8 exact (paraphrase 8 / 8). APR still added (exact 0 / 8, paraphrase 2 / 8 not relevant).

**Synthetic decision cases** (`fresh_decision_cases.json` v1.1.0; 23 gatable cases, one is never shown by Stage 1):

| | 1.5.1 Stage 1 | first freeze | v5b | **final** |
|---|---|---|---|---|
| gated cases passed | 7 / 23 | 19 / 23 | 19 / 23 | **20 / 23** |
| by group (D1 / D2 / guard) | 2 / 4 / 1 | 5 / 8 / 6 | 5 / 9 / 5 | 6 / 8 / 6 |

Final failures:
- the pure probe gets an APR row (2 / 8 not relevant);
- the synthetic "new direction" case is scored Leveraging 1 in only 3 / 8 (v5b 7 / 8);
- a longer content-free praise gets a Leveraging 0 (8 / 8).

## 4. Remaining known failure modes

1. **Leveraging over-selection:**
   - Wrongly surfaced on 17% (dev) and 19% (consensus / agreed) of turns where the experts have no Leveraging; frozen v3 had 12–15%.
   - Mostly substantive mid-discussion moves the model treats as consolidating an episode the experts do not consider resolved.
   - Longer content-free praise is outside the guard: the model still writes a "missed" 0.
   - Possible follow-up, not adopted: a deterministic "no mathematical content" rule. It needs an open-ended maths word list.
2. **Leveraging on generalisations phrased as a summary:**
   - Agreed tier signed −0.24 (exact 78% vs 90%): a stated principle is sometimes scored 0 / 1 where both annotators gave 2.
   - Mostly one conversation.
   - The other side of fixing the over-scoring the team reported (consensus +0.64 → +0.44).
3. **APR on a pure "why do you think" question:** still added (team's case). This is an open conflict between the team's case comment and the consensus labels (§1); it needs the team's view in the review.
4. **Interpretation instability on borderline turns:**
   - The team's pure-"why" case is ≥ 1 in 4 / 8 (v5b 7 / 8).
   - Several borderline cases flip by 3–4 of 8 samples with any prompt change, even in skills whose wording did not change.
   - Expect sample-to-sample variation in the team review.
5. **Characterisation weak, Identification recall low:** unchanged in character (Characterisation F1 0.21–0.46, Identification recall 0.36–0.49).
6. **Steering agreement:** κ 0.29 against 0.39 for the frozen v3, within run-to-run noise for this tier size, and far above 1.5.1's Stage-1 steering (κ about 0.09).
7. **Feedback suppressed on 1.7–2.8% of the turns Stage 1 shows.** All of them have no row left: mostly a Leveraging row dropped by the guard, a few with no relevant skill.
8. **Not addressed:**
   - text-quality items (masculine forms, occasional harsh tone, third person);
   - the student prompt still prints the Stage-1 demonstrated / missed lists, `how_addressed` and the hint reasons. This is the configuration A1i was evaluated with, and those lists can disagree with the shown rows.
    - On 47% of shown turn-passes the prompt would say neutral / not addressed while listing only demonstrated skills.
    - On 18.5% a listed demonstrated skill is scored 0 by Stage 2.
    - Resolved by the student data contract (`pck_a1i_implementation_plan.md` §1a). It passed a targeted live rerun (§5, 2026-11-02) with 0 contradictions and no worse student behaviour, and is now the production target.
