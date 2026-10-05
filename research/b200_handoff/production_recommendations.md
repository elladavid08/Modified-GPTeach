# Recommendations for the production PCK feedback agent

These are conservative recommendations. Each one notes the evidence behind it. Production uses all five skills and Gemini, but the main evidence comes from p1+p4 with Gemma-31B on 45 conversations. Treat everything below as directional.

## A. High confidence

1. **Enforce structured output at the API level.**
   - Use Gemini's `response_mime_type="application/json"`, plus a response schema if available.
   - Evidence: without JSON mode, Gemini Flash-Lite produced trailing commas and unescaped `"` in Hebrew. With `json_object`, Gemma had 0 quote failures. [EVAL-P1/P4]
   - Even with JSON mode, keep the defensive parser described in A2.

2. **Use a never-throwing parser with a validation layer.**
   - Strip code fences, then parse. If that fails, slice from the first `{` to the last `}`.
   - Validate types: `feedback_text` must be a string, not an object. If it comes back as `{"מה קיים":…,"המלצה":…}`, flatten it and log the repair rather than failing silently.
   - Check consistency: the decision must equal the OR of relevance across dimensions; an irrelevant dimension must have null score and text; scores must be in {0,1,2}.
   - **Log every coercion** with a reason. Research nulled invalid fields silently, which hid schema errors.
   - Keep raw model output alongside the parsed result, plus `parse_status` and `finish_reason`.
   - Evidence: `failure_modes.md` §1–8. [EVAL]

3. **Retry policy.**
   - Retry transport errors and 5xx with backoff.
   - **Do not retry 4xx or context-length errors.**
   - On a parse or validation failure, allow at most one re-ask; HYPOTHESIS: a short "return valid JSON only" correction prompt should work. Then fall back to a safe default: no feedback shown, failure logged. Never show partial or garbled text to the teacher.
   - Treat `finish_reason == length` as a failure, not as a parse problem to repair. Two observed failures were repetition loops that hit the 1000-token cap. [EVAL]

4. **Keep the prompt's semantic rules. They are the most transferable part of the research.** [RESEARCHER rules; partly EVAL]
   - Relevance means "should be evaluated", not "succeeded". A relevant but failed skill gets score 0, not "irrelevant". This matters most for p3 (the v2.1 missed-opportunity rule).
   - The score rates the quality of the teacher's move, not how severe the student's error was.
   - p1, p2 and p3 need an actual student error in the current or preceding student messages. p4 may apply to a targeted task before any error. p5 needs an *actual* leveraging move, not just an opportunity.
   - Include the boundary rules (p1/p2, p2/p3, p3/p4, p4/p5) and only the scenario guide for the current lesson.
   - A greeting gets no dimensions.
   - Source text: `pck_skills_v2_1.py`, `pck_skills_v2.py::BOUNDARY_DECISION_RULES`, `SCENARIO_GUIDES`.

5. **Explicit score-conditioned text template, if the product wants this format.**
   - score 2 → `מה קיים:`; score 1 → `מה קיים:` then `המלצה:`; score 0 → `המלצה:`; Hebrew, short, actionable.
   - Validate it in code (`template_issue` logic) and decide what to do on a violation (e.g. re-ask, or re-label the markers).
   - Evidence: without the instruction, adherence was 0%. Even with it, Gemini Flash-Lite violated the template on 22–58% of turns. [EVAL]
   - Caveat: this is a researcher codification of one expert's habit, not an expert-written rule; see `pck_and_feedback_rules.md` §5. **Confirm with the experts**, especially whether score-2 feedback may include a recommendation. 21 of 75 expert p1 score-2 texts are non-compliant, mostly because they add a recommendation.

6. **Expect p1 (and probably p2/p3) over-assertion from a prompted Gemini Flash-Lite.**
   - Flash-Lite claimed p1 on almost every turn: recall 0.95–0.98, precision 0.39–0.45. Its score agreement was the worst of all models (p1 κ_quad 0.16, p4 0.09). [EVAL-P1/P4]
   - In the five-dimension run it selected 2.8–3.5 dimensions per turn vs 1.63 in gold. [EVAL-5D-SMALL]
   - If production shows feedback for every relevant dimension, teachers will get too much feedback. Consider capping the number of dimensions shown per turn [INFERENCE]. Experts favour the single most useful point (Otman Jaber's note).

7. **Do not truncate history to "fix" accuracy.**
   - Context length did not explain errors once turn position was controlled. [EVAL]
   - Do budget tokens, though. Zero-shot prompts were up to about 6.3k tokens and 8-shot prompts up to about 15k. Keep output headroom (about 1000 tokens was ample; trained outputs averaged about 150).

8. **Evaluate components separately.** Decision, per-skill relevance, score and text behaved differently across methods; no single model won all four. Never use text similarity (BERTScore) as a proxy for correct relevance: Gemini's text looked expert-like while its relevance κ was 0.18–0.32 lower. [EVAL]

## B. Medium confidence / experimental

9. **Model choice.**
   - **No evidence supports Flash-Lite as the best option for this task.** In research it was clearly worse than an open 31B model on relevance and score.
   - Not tested: stronger Gemini models (Flash, Pro), Gemini with JSON mode, and Gemini with the production prompt.
   - Before switching models, **run a small offline evaluation of 2–3 candidate production models** on the research gold, using `scripts/evaluate_p1_p4_reduced_v1.py` semantics. Gold is `data/training/sft/gemma_rubric_v2_1_p1_p4_user_cv3_v1/fold*/eval_turns.jsonl`, which has p1/p4 only. Five-dimension gold, 71 turns, is `data/processed/test_set_v1.jsonl`. [INFERENCE]
   - Fine-tuning (Gemma SFT) gave 0 format failures, better wording and better p4 scores. It did **not** improve p1 precision or the feedback decision. Gemma zero-shot had the best decision F1, and Gemma few-shot the best p1 score agreement. Fine-tuning is only worth it if a self-hosted path is acceptable. [EVAL-P1/P4]
   - Preference optimisation (DPO/MODPO) gave at most about 15 examples' worth of gain, and plain DPO matched the rubric-margin variant. **Not worth it for production.** [EVAL-P1/P4]

10. **Few-shot.** [EVAL mixed → experimental]
    - Few-shot fixes format but can worsen decisions: for Flash-Lite, p1 precision fell from 0.45 to 0.39.
    - If used, add a few short demos covering:
      - a "no feedback" mid-lesson turn;
      - "p4 relevant / p1 not";
      - a relevant score 0, a relevant score 1 and a relevant score 2.
    - Candidates are in `prompt_and_examples.md` §4.
    - A/B test against zero-shot on held-out gold before adopting. Do not use retrieval-selected demos; that was NO-GO in research.

11. **Late-conversation p1 drift.** Models increasingly assert p1 late in a lesson, while experts assert it less. Simple fixes failed: suppressing repeats hurts, and adding the turn number did not help. HYPOTHESIS worth testing: prompt guidance that a teacher re-addressing an error already identified earlier is not a new p1 event unless a new error appears. This is untested and may cost recall. [INFERENCE]

12. **Decompose relevance from writing.** Stage A (label-only relevance) gave the largest p1-FP reduction (−21%), but the result was only suggestive (p = 0.06). One production analogue would be a two-call design: call 1 decides relevance and score, call 2 writes text only for relevant skills. Cost and latency go up; the benefit is unproven. [EVAL suggestive]

## C. How far to generalise from P1/P4 to all five skills

| lesson | applies to p2/p3/p5? |
|---|---|
| Parsing, JSON mode, retries, validation, logging | **Yes**, independent of skill |
| Relevance ≠ success; score = move quality | **Yes**; v2.1 rule written for p3 |
| Template format | Yes in form; expert compliance not checked per skill beyond p1/p4 |
| Over-assertion by prompted models | **Likely**: five-dimension run shows over-selection, p2 weakest (F1 0.27–0.55), p2/p3 boundary main confusion [EVAL-5D-SMALL] |
| p4 is easy, p1 is hard | p1/p4 only; p2 and p3 are likely harder than p1 (expert κ p2 0.24, p3 0.07) |
| Strict p5 wording | Descriptive support only (71 turns) |
| Fine-tuning / DPO effects | p1/p4 only; no five-dimension result survived FDR |
| Few-shot demos | No validated p2/p3/p5 demos exist in this handoff |

**[INFERENCE]** Expert agreement on p2, p3 and p4 relevance is very low (κ 0.06–0.24 in IRR round 2). Production feedback on those skills will look inconsistent to experts regardless of model. A clearer expert-written relevance guideline per skill, plus more double-annotated data, is likely to help more than prompt or model tuning.
