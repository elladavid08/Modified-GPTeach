# Student-agent model options on Vertex AI (research note)

Status: 2026-10-12, on committed **1.3.13**. Analysis only: no production change, no `SYSTEM_VERSION` bump. Model status is from the official Vertex AI (Gemini Enterprise Agent Platform) documentation, read today. Pricing is from third-party aggregators where marked; verify it in the Cloud console.

## 1. Bottom line

- **Every LLM path in production uses `gemini-2.5-flash-lite`, and Vertex AI retires it on October 20, 2026, in 8 days.**
- After that date, student generation, PCK feedback and the summary will stop working.
- **This migration is time-sensitive and takes priority over the local student-fix backlog.**

## 2. Current configuration (verified in the repo)

| path | endpoint | model instance | model ID | key settings |
|---|---|---|---|---|
| Student generation | `POST /api/generate` (`server/server.js` ~L304) | `turnModel` | `gemini-2.5-flash-lite` | JSON `responseSchema`, `maxOutputTokens` 512, temperature 0.7, topP 1, no thinking config (2.5 Flash-Lite thinks only if asked) |
| PCK feedback | `POST /api/pck-feedback` (~L475) | `turnModel` | same | JSON schema, `maxOutputTokens` 2000, temperature 0.7 |
| Summary | `POST /api/pck-summary` (~L967) | `model` | same | `maxOutputTokens` 2048, temperature 0.7, legacy `withRetry` |
| Completion / test | `/api/completion`, `/api/test` | `model` | same | — |

**Where it is configured:**
- one constant, `const MODEL_ID = 'gemini-2.5-flash-lite'` at `server/server.js:61`, used by both `model` (L63) and `turnModel` (L70, with `requestOptions.timeout`);
- the health endpoint repeats the literal `'gemini-2.5-flash-lite'` (~L1318) and so does the startup log;
- telemetry reports `MODEL_ID`;
- there is **no** environment override for the model.

**Provider:** Vertex AI only, through the `@google-cloud/vertexai` SDK (installed 1.10.0, `^1.1.0` in `server/package.json`).
- Project and location come from `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` (default `us-central1`; `ENVIRONMENT_VARIABLES.md`, `DEPLOYMENT_GUIDE.md`).
- The deployment config (`server/ecosystem.config.cjs`) does not override either.

**Other providers:**
- The client's `gpt-3.5-turbo` / `gpt-4` names in `src/utils/ai.js` are legacy labels; with `PROVIDER: "google"` (`src/config/constants.js`) all calls go to the server's Gemini endpoints.
- `src/components/RecordingButton.jsx` (OpenAI `whisper-1` speech-to-text) is not imported anywhere.

## 3. Official status (Vertex AI model lifecycle page, read 2026-10-12)

| model ID | launch stage | released | retirement | listed replacement |
|---|---|---|---|---|
| **`gemini-2.5-flash-lite`** (current) | GA | 2025-07-22 | **2026-10-20** | `gemini-3.8-flash`, `gemini-3.1-flash-lite`, or Gemma 4 |
| `gemini-2.5-flash` / `gemini-2.5-pro` | GA | 2025-06-17 | 2026-10-20 | 3.8 Flash / 3.5 Flash(-Lite) / 3.1 Flash-Lite |
| `gemini-3.1-flash-lite` | GA | 2026-05-07 | 2027-05-07 or later | — |
| `gemini-3.5-flash` | GA | 2026-05-19 | 2027-05-19 or later | — |
| `gemini-3.5-flash-lite` | GA | 2026-07-21 | 2027-07-21 or later | — |
| `gemini-3.8-flash` | GA, but in the **"short-term availability"** table | 2026-09-02 | not announced | — |
| `gemini-3.6-flash` / `3.7-flash` | short-term | 2026-07 / 2026-08 | 2026-11-19 / 2027-01-28 | `gemini-3.8-flash` |

**Operational notes from the docs:**
- **Regions:** the 3.x models are served from `global` and the `us` / `eu` multi-regions. Our `us-central1` endpoint returns 404 for `gemini-3.1-flash-lite`.
- **SDK:** the generative module of the Vertex AI SDK was deprecated on 2025-06-24 and scheduled for removal on 2026-06-24. The migration guide says "Vertex AI SDK releases after June 2026 won't support Gemini" and new features are only in the **Google Gen AI SDK** (`@google/genai`).
- **3.x request changes in the migration guide:**
  - use `thinking_level` (minimal / low / medium / high, depending on the model) instead of `thinking_budget`;
  - remove sampling parameters such as temperature.

## 4. Compatibility probe (one trivial call per model)

The probe used our pinned SDK, the existing service account (not read), and a synthetic one-student prompt with the student `responseSchema` and `maxOutputTokens` 512.
- 2.5 ran on `us-central1`.
- 3.x ran on `location: 'global'` with `apiEndpoint: 'aiplatform.googleapis.com'`.
- Script: scratchpad `c27/probe.mjs`.

| model | result | latency | thinking tokens | notes |
|---|---|---:|---:|---|
| `gemini-2.5-flash-lite` | valid JSON, `STOP` | 1.9 s | 0 | baseline |
| `gemini-3.1-flash-lite` (`thinkingLevel: MINIMAL`) | valid JSON, `STOP` | 1.2 s | 0 | the old SDK passes the thinking config through |
| `gemini-3.5-flash-lite` (default = minimal) | valid JSON, `STOP` | 1.0 s | 0 | |
| `gemini-3.8-flash` (`thinkingLevel: LOW`; MINIMAL not offered) | valid JSON, `STOP` | 2.3 s | 0 | default is MEDIUM |
| `gemini-3.5-flash` (default thinking) | **`MAX_TOKENS`, truncated JSON** | 11.2 s | 488 | thinking consumed the 512-token output budget |
| `gemini-3.1-flash-lite` on `us-central1` | **404 Not Found** | — | — | must use `global` (or `us`) |

**Consequences:**
- A migration is feasible **without** an SDK rewrite in the short term: change the model ID, add a `global` location with the API endpoint override, and set an explicit thinking level.
- The SDK move to `@google/genai` is a separate, medium-term task.
- Thinking tokens count against `maxOutputTokens`, so any model with non-minimal default thinking needs an explicit level, or it will fail our 512-token student limit (and possibly the PCK limit).
- **PCK and the summary use the same constant**, so they migrate too; the bakeoff must check PCK output as well.

## 5. Realistic candidates for the student agent

Prices are standard pay-as-you-go text prices per 1M tokens, input / output, from **third-party** listings: requesty.ai, cloudzero, mindstudio; verify before budgeting.

| | `gemini-3.1-flash-lite` | `gemini-3.5-flash-lite` | `gemini-3.8-flash` | `gemini-3.5-flash` |
|---|---|---|---|---|
| status | GA, 12+ months | GA, 12+ months (newest Lite) | GA, short-term table | GA, 12+ months |
| speed (probe) | fast (1.2 s) | fastest (1.0 s) | slower (2.3 s at LOW; MEDIUM default slower still) | slow by default (11 s); needs explicit minimal/low thinking |
| capability | Lite tier ("most cost-efficient … low latency"; better instruction following than 2.5) | Lite tier, newer | "most intelligent workhorse" Flash | "near-Pro at Flash cost" |
| structured JSON | yes | yes | yes | yes |
| image input (drawings) | yes | yes | yes | yes |
| thinking control | minimal / low / medium / high | minimal (default) / medium / high | low / medium (default) / high | yes (default consumes many tokens) |
| price (approx.) | $0.25 / $1.50 | $0.30 / $2.50 | $0.75 / $3.75 (introductory to 2026-12-31) | Flash tier (not verified) |
| vs current ($0.10 / $0.40) | about 2.5× input, 3.75× output | about 3× / 6× | about 7.5× / 9× | — |
| real-time simulator fit | **good** | **good** | possible if latency is acceptable; availability horizon unclear | **poor** without tuning |

**Not considered:**
- Gemma 4: an open model; using it would mean deploying and serving an endpoint, which is an architecture change;
- Pro models: latency and cost;
- the 3.6 / 3.7 Flash models: they retire within months.

## 6. A stronger model is not automatically better here (expected tradeoffs, untested)

| behaviour | Lite tier (3.1 / 3.5 Flash-Lite) | Flash tier (3.8 / 3.5 Flash) |
|---|---|---|
| **preserving a misconception** | likely close to today. Lite models follow persona text fairly literally; the probe answers kept the misconception ("לא, ריבוע הוא לא מלבן כי…") | risk of the model "knowing better" and softening misconceptions; it may need stronger persona/PCK steering |
| **avoiding premature correctness** (7/24 carriers in the 1.3.12 baseline) | similar risk | higher risk: capable models tend to reason to the right answer |
| **persona / PCK constraints** | better instruction following than 2.5 (vendor claim) may help | likely the best adherence, if the model does not override the role-play |
| **conversation continuity** | similar; no loops or regressions in the 2.5 baseline to improve on | marginal gain expected |
| **teacher-attribution grounding** (about 0.5% of replies; prompt fixes failed) | may improve with better instruction following; unknown | most likely to improve |
| **latency** (student p50 about 1.2 s today) | equal or better | +1 s or more; thinking settings matter |
| **output validity** | needs testing: the 3.x JSON style differs (compact vs pretty) and the ASCII-quote truncation (1.3.13) must be rechecked | same, plus thinking-token budget failures |

The **temperature 0.7** in our configs conflicts with the 3.x guidance to remove sampling parameters. Whether to keep it is a bakeoff variable, not a default.

## 7. Proposed bakeoff (not run)

**Arms:**
- **baseline:** `gemini-2.5-flash-lite` (possible only until 2026-10-20);
- **`gemini-3.5-flash-lite`** (thinking minimal);
- **`gemini-3.1-flash-lite`** (thinking minimal).
- Optional reference arm if time allows: `gemini-3.8-flash` (thinking LOW).

**Held constant:**
- the 1.3.13 prompt, PCK prompt, personas and examples;
- the duplicate guard and quote-cut telemetry;
- the replay harness 1.3.2, Mode B, designed casts;
- the same scripts and drawings;
- `maxOutputTokens` (512 student, 2000 PCK).

The only changes are the model ID, the `global` endpoint and an explicit thinking level. The bakeoff can run without touching production by starting the unmodified server with an analysis-only preload that overrides the model ID and location in `getGenerativeModel` (the same technique as the raw-capture preload).

**Scope:**
- PCK runs on the same arm model, as it would in production after migration.
- Optionally, a second variant keeps the PCK model fixed, to separate student from PCK effects.
- Volume: 12 conversations (6 scenarios × 2 casts) per arm at first, then 24 for the finalists.

**Compare per arm:**
- **output validity:** JSON or schema failures, `MAX_TOKENS`, empty replies, attempts per call, `quoteCutSuspected` / `quoteCutPaddedAttempts`;
- **behaviour:**
  - premature correctness of the slot-A carrier before T5;
  - misconception persistence and resolution (corrected definition) and regressions;
  - semantic loops and repeat-after-answered;
  - invented or mixed teacher attributions (corpus scanner plus manual check);
  - cross-student contamination;
  - persona participation;
- **PCK:** schema validity and `understanding_level` distribution, against the 2.5 baseline;
- **duplicate guard:** re-ask rate and outcomes;
- **latency:** p50 / p90 for student and PCK;
- **cost:** input/output and thinking tokens per turn, from `usageMetadata` captured by the preload.

**Decision rule:**
- pick the cheapest arm that matches the baseline on validity and latency (p90 at most the 45 s budget's practical margin; target student p90 under 2.5 s);
- it must not raise premature correctness or lose misconception persistence;
- attribution and loop rates must be no worse.

## 8. Recommendation

1. **Act now, before the local-fix backlog.** Run a compressed bakeoff this week: one run of 12 Mode B conversations per arm, 2.5 Flash-Lite vs 3.5 Flash-Lite vs 3.1 Flash-Lite, plus PCK checks.
2. **Then a minimal versioned migration before 2026-10-20:**
   - change `MODEL_ID`;
   - use the `global` location with the `apiEndpoint` override;
   - set an explicit thinking level;
   - decide whether to keep temperature;
   - update the health/log literal and tests.

   Prepare a fallback ready to deploy: 3.1 Flash-Lite is listed explicitly as a replacement for 2.5 Flash-Lite.
3. **Afterwards:** migrate the SDK to `@google/genai`, and rerun the 24-conversation baseline on the new model before more student-prompt work. Earlier findings (premature correctness, attribution, quote cuts) need re-measurement on the new model.

## Sources

- [Model versions and lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions)
- [Gemini 2.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-lite)
- [Gemini 3.1 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite)
- [Gemini 3.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite)
- [Gemini 3.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash)
- [Gemini 3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash)
- [Migrate to the latest Gemini models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/migrate)
- [Generative AI on Vertex AI deprecations](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/deprecations)
- Third-party pricing:
  - [requesty.ai 3.1 Flash-Lite](https://www.requesty.ai/models/vertex/gemini-3.1-flash-lite)
  - [requesty.ai 3.5 Flash-Lite](https://www.requesty.ai/models/vertex/gemini-3.5-flash-lite)
  - [requesty.ai 3.8 Flash](https://www.requesty.ai/models/vertex/gemini-3.8-flash)
  - [cloudzero Vertex pricing](https://www.cloudzero.com/blog/google-vertex-ai-pricing/)
- Retirement coverage:
  - [tokencost.app](https://tokencost.app/blog/gemini-2-5-shutdown-october-20-migration-cost)
  - [Google AI Developers Forum](https://discuss.ai.google.dev/t/gemini-2-5-flash-lite-retirement-date-different-for-gemini-api-vs-vertex-ai/177897)
