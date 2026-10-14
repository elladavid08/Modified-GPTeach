# Student-stability replay harness

Research-only tool for replaying synthetic lessons through the **real** student and PCK path of the simulator. It is not part of the app build.

- **What it uses:** the real path, `getPCKFeedback` → `callAI` → local `server/server.js` → Gemini.
- **What it never does:** write to Firestore, read participant data, or modify production code.
- **Background:** design and rationale in [`../student_stability_harness_review.md`](../student_stability_harness_review.md); earlier results in [`../student_stability_replay.md`](../student_stability_replay.md).

## Two modes

| | **Mode A: fixed-script probe benchmark** | **Mode B: adaptive lesson benchmark** |
|---|---|---|
| Teacher | the 12 scripted turns per scenario, verbatim (the 1.3.9–1.3.11 scripts), never adaptive | the same 12-turn plan with deterministic adaptations (below); no LLM teacher |
| Drawings | corrected benchmark assets (`assets/`) | same |
| Casts | default `historical` (the 1.3.9–1.3.11 rotation) | default `designed` (slot A = a misconception carrier) |
| **Valid for** | exact / near duplication, duplicate guard (B26), short messages and closings, attempts / latency / failures, comparison with 1.3.9–1.3.11 | the above, **plus** semantic-loop, misconception-regression, premature-correctness and contamination labels (with manual review) |
| **Not valid for** | **semantic loops or misconception regressions.** The scripted teacher never answers student questions, so re-asking an unanswered question is reasonable. | — |

Comparability with 1.3.9–1.3.11 is exact for teacher texts and casts in Mode A. It is not exact for the s2 T5 and s5 T8 turns, whose historical drawings contradicted the teacher text and are now corrected.

## Mode B teacher rules (`lib/teacher.js`)

Before each planned move, the previous student turn is checked. Every decision is logged in the run output.

1. **Detect pending questions.** An open question is a sentence ending in "?" with an interrogative.
   - A confirmation question ("…, נכון?" / "…, לא?") is a claim, not an open question.
   - A purely deictic question ("מה זה אומר?", "למה?", "איך זה יכול להיות?") is routed together with its preceding sentence.
2. **Route** each question to a scenario answer-bank category (`ANSWER_BANK`).
3. **Answer at most one question per turn.**
   - A category whose planned discovery comes later (`earliest` turn) gets a **hint** first and the **full** answer from that turn on.
   - Each hint and each full answer is given **at most once**.
   - A question re-asked after its full answer is **not answered again** (`repeat_after_answered`): that repetition is a genuine loop candidate.
   - A question in the category that the planned question of this turn itself asks for (`asks` in the plan) is **not answered before it** (`asked_by_planned_question`): the planned question is asked as scripted, and the answer can follow at a later turn. Since HARNESS_VERSION 1.2.0; before, the answer was prepended to a question asking for it.
4. **Unmatched questions** get a staged generic answer once per student: "שאלה טובה, נבדוק את זה עוד רגע" before the explanation turn, and the scenario key fact after it.
5. **Nothing is added to the explanation turn (T5).** The explanation answers what came before it.
6. **Unsure student on a planned question.** If the student addressed by a planned question marked `answerIfUnsure` is unsure or silent, that answer is given before the next planned move (s2, s3, s4 and s5, at T10).
7. **No validating a misconception.** A validating probe ("נכון" / "יפה") after a detected misconception claim (`MISCONCEPTION`) becomes "אוקיי". Open questions, reported former beliefs ("חשבתי ש…") and challenged echo questions ("…? אבל …", "…? או ש…") are not claims; tag questions ("…, נכון?") and hesitant leaning questions are (1.2.0).
8. **Missing antecedent.** "{B}, מה דעתך על מה שנאמר / התשובה / את מסכים?" becomes "{B}, מה דעתך על השאלה ששאלתי את {A}?" when the previous turn had no reply.

**How the answer is placed:**
- **Probe turns** (אוקיי / נכון / יפה / ?) are replaced by the answer.
- **Content turns** get the answer in front, and the planned move follows unchanged.

## Behavioural labels (`lib/labels.js`, `analyze.js`)

**Automatic:**
- exact same-student duplicate;
- production duplicate-guard match (imported read-only from `server/student_duplicate_guard.js`);
- repeated-question status: `repeat_unanswered` (justified) vs `repeat_after_answered` (loop candidate);
- requested restatement (re-ask, summary or "?" probe);
- prompt-example copy (edit ≥ 0.6, or a shared 6-word sequence with a student-prompt example). The example set follows the run's `SYSTEM_VERSION`: the cast-bound examples up to 1.3.11, the content-neutral examples from 1.3.12 (`promptExamplesFor`). If the version is unknown, both sets are checked.
- placeholder leakage (example scaffolding such as "[", "<" or the placeholder name in a reply or speaker) and speakers outside the cast;
- call telemetry and attempts.

**Manual (queued with evidence in `review.md`):**
- semantic repetition;
- resolution, persistence, regression and premature correctness, from a per-student ledger of misconception-claim and target-idea candidate turns;
- cross-student contamination: a 6-word overlap with a peer that is not lesson vocabulary and does not name the peer;
- teacher attributions.

A misconception counts as **resolved** only if the same student, after the teacher addressed it, states or applies the correct idea in their own words on a content move, without hedging. Teacher acknowledgement alone is not evidence. Full definitions are in review §4.

## Running

All commands run from the repository root. Generated results go to `research/simulator_audit/replay_harness/results/<run id>/`, which is **git-ignored** (`.gitignore`).

```sh
# 0. Unit tests of the harness logic (no model calls)
node --test research/simulator_audit/replay_harness/test/

# 1. Start the local, unmodified server (uses the configured service account; another terminal)
cd server && PORT=3101 node server.js

# 2a. Smoke run: Mode B, scenarios 2, 4, 5, one designed cast
HARNESS_MODE=B HARNESS_RUN_ID=smoke-$(date +%Y%m%d-%H%M) HARNESS_SCENARIOS=2,4,5 HARNESS_CAST_INDEXES=0 \
  npx jest --config research/simulator_audit/replay_harness/jest.harness.json --runInBand

# 2b. Mode A (fixed scripts, historical casts), all scenarios
HARNESS_MODE=A HARNESS_RUN_ID=A-1.3.12-run1 \
  npx jest --config research/simulator_audit/replay_harness/jest.harness.json --runInBand

# 2c. Planned Mode B baseline: 6 scenarios x 2 designed casts x 2 runs = 24 conversations
HARNESS_MODE=B HARNESS_RUN_ID=B-baseline-1.3.12 HARNESS_REPEATS=2 \
  npx jest --config research/simulator_audit/replay_harness/jest.harness.json --runInBand

# 3. Label a run: writes labels.json, summary.json and review.md (fill the verdict columns)
node research/simulator_audit/replay_harness/analyze.js research/simulator_audit/replay_harness/results/<run id>

# 4. After any change to lib/teacher.js or the plans: check which recorded Mode B conversations are still valid
#    (exit 1 and a DIFF list if the current teacher would phrase any turn differently: rerun those conversations)
node research/simulator_audit/replay_harness/scripts/resimulate_teacher.js research/simulator_audit/replay_harness/results/<run id>
```

**Harness fixes and recorded runs.** The Mode B teacher is deterministic given the student replies, so a run recorded with an older HARNESS_VERSION stays valid if every teacher turn re-simulates identically (`lib/resimulate.js`); only the labels need recomputing. A conversation whose teacher would now differ must be rerun. The 1.3.12 baseline was assembled this way (`student_stability_replay.md` §11).

**Environment variables:**

| variable | values | default |
|---|---|---|
| `HARNESS_MODE` | `A` \| `B` | required |
| `HARNESS_RUN_ID` | folder name; must not exist | `<mode>-<timestamp>` |
| `HARNESS_SCENARIOS` | e.g. `1,2,3` | `1,2,3,4,5,6` |
| `HARNESS_CASTS` | `historical` \| `designed` | A: `historical`, B: `designed` |
| `HARNESS_CAST_INDEXES` | `0`, `1` or `0,1` | `0,1` |
| `HARNESS_REPEATS` | runs per scenario × cast | 1 |
| `HARNESS_API_URL` | local server only (127.0.0.1 / localhost) | `http://127.0.0.1:3101` |
| `HARNESS_STUDENT_PROTOTYPE` | `carrier` \| `carrier2` \| `carrier3`: research carrier variants v1–v3 (`prototype/carrier.js`), patched onto the 1.4.4 base `src/utils/ai.js` (commit `cf61c03`, read from git) | unset |
| `HARNESS_STUDENT_CARRIER` | `production`: the production 1.5.0 student path with the session carrier from `src/services/misconceptionCarrier.js`, given to the student call only (as `Chat.jsx` does) | unset (no carrier; equals the 1.4.4 student prompt) |

**Reproducibility:**
- The teacher, casts, drawings and labels are deterministic.
- **Gemini generation is not.** The server exposes no seed, so a run ID identifies a run, not a deterministic replay.
- Every `manifest.json` records:
  - `harnessVersion` (`config/scenarios.js`, bumped when plans, answer bank, rules, labels or assets change; the version history is the comment above `HARNESS_VERSION`);
  - `systemVersion` and the git commit;
  - whether production files or harness files were modified at run time.

**Historical runs:** `scripts/import_historical.js` converts a 1.3.9–1.3.11 output file (the session-harness format) into a run folder so `analyze.js` can label it. The three historical outputs were imported locally as `results/historical-1.3.{9,10,11}` (not committed).

## Layout

| path | content |
|---|---|
| `config/scenarios.js` | 12-turn plans (teacher text, move type, drawing, `answerIfUnsure`); historical and designed casts; ids; `HARNESS_VERSION` |
| `lib/teacher.js` | Mode A / Mode B teacher, answer bank, question routing, misconception claims |
| `lib/labels.js` | behavioural labels, student ledger, manual-review queue, prompt-example metric (example sets per `SYSTEM_VERSION`) |
| `lib/assets.js` | drawing specs, geometry checks, SVG generation |
| `lib/text.js`, `lib/turnFlow.js` | text helpers (production duplicate criterion re-exported); Chat.jsx first-turn addendum mirror |
| `bench/run.bench.js`, `bench/setup.js`, `jest.harness.json` | live runner (Jest + react-scripts Babel, local-only fetch) |
| `analyze.js` | labelling and review report |
| `lib/resimulate.js`, `scripts/resimulate_teacher.js` | re-simulate the Mode B teacher over a recorded run (validity after a harness change) |
| `assets/` | corrected benchmark drawings (SVG + 300×300 PNG) and `rotated-rectangle.png` |
| `scripts/` | `render_assets.js` + `render_png.sh` (regenerate drawings), `import_historical.js` |
| `test/` | `node:test` unit tests (no model calls) |

**Regenerating drawings** after changing `lib/assets.js`: run `node research/simulator_audit/replay_harness/scripts/render_assets.js`, then `sh research/simulator_audit/replay_harness/scripts/render_png.sh`. The PNG step uses macOS Quick Look; any SVG renderer producing 300×300 PNGs works. `test/assets.test.js` fails if the SVGs are out of date.

## Provenance

- **Scripts and casts.** The 12-turn teacher scripts and the historical cast rotation were reconstructed from the session-only harness used for 1.3.9 (`9eb14e0`), 1.3.10 (`15866e1`) and 1.3.11 (`5184c24`). They were verified turn by turn against all 432 teacher turns of the three historical output files, and are pinned by a fingerprint test.
- **Turn flow.** The runner reproduces the historical turn flow, which mirrors `Chat.jsx`: PCK first; feedback history = the last 3 of at most 5 items; the first-turn addendum only on the opening turn; B2 when PCK fails.
- **Not reconstructible exactly:**
  - the model outputs themselves (non-deterministic);
  - the server-side state of each historical run beyond its commit;
  - the historical drawings at s2 T5 and s5 T8, which are deliberately replaced.
