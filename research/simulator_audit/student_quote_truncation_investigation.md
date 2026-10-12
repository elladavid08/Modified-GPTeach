# Silent student-reply truncation at Hebrew gershayim: root-cause investigation

Status: investigation only, 2026-10-12, on committed **1.3.12** (`279721a`).
- No production change, no `SYSTEM_VERSION` bump, and no prompt, PCK, persona, duplicate-guard or harness change.
- Synthetic data only; no participant data; nothing written to Firestore.
- Found in the Mode B baseline (`student_stability_replay.md` §11.5).

## 1. Summary

- **Root cause:** in JSON mode with the student `responseSchema`, Gemini writes a Hebrew abbreviation with an **ASCII double quote as gershayim** (ס"מ, מ"ר, קמ"ש) without escaping it. Constrained decoding takes that `"` as the **end of the `message` string**, and the model then completes valid JSON.
  - The model's own output is therefore **valid JSON with an already-cut message**: `"message": "…באורך 5 ס"\n    }`.
  - `finishReason` is `STOP`, and there is one part.
- **Nothing in our code removes text.** The server validates the (valid) JSON and returns `parts[0].text` verbatim; the client parses it with `JSON.parse`.
  - The defect is that **no layer can tell that the message was cut**, so the reply is shown as a normal success.
- **Frequency:** context-dependent and high when the model reaches for such an abbreviation.
  - The cut rate is about 70% (25 cut vs 10 correctly escaped `\"` in the reconstruction).
  - It reached 8 of 8 when the teacher asked for side lengths in centimetres.
- **Classification:** a model-output (constrained-decoding) failure that becomes a **production bug** because it is silent and user-visible.
  - Retry alone cannot fix it: in strongly triggering contexts every attempt is cut.

## 2. Trace through `/api/generate` (where text could be lost)

| step | code | what happens to the text |
|---|---|---|
| 1 | `src/utils/ai.js:171` | the client requests the student turn, with `stop: ["Teacher:"]` (not involved: no captured output contains it) |
| 2 | `server/server.js:293` (route), `generationConfig` | `responseMimeType: application/json` plus the `responses[{student, message}]` `responseSchema`, temperature 0.7, 512 tokens |
| 3 | Gemini (`gemini-2.5-flash-lite`) | **text lost here.** The unescaped `"` closes the string; the decoder completes the JSON (§3) |
| 4 | `server/llm_call_policy.js:70` `interpretCandidate` | takes `candidates[0].content.parts[0].text` unchanged (all captures had exactly one part) |
| 5 | `server/server.js:366` → `student_output_contract.js:31` | `JSON.parse` succeeds and the schema check passes, so there is no retry |
| 6 | `server/server.js:383/428/434` | the duplicate guard finds nothing, so `candidate.text` is returned verbatim (it is re-serialized only when a duplicate is dropped, which keeps the string) |
| 7 | `src/services/genai.js:120` | returns `result.text` unchanged |
| 8 | `src/utils/ai.js:274, 306` | `JSON.parse`, then `message.trim()`, which removes only surrounding whitespace |

**Ruled out:**
- our parser or a repair step (there is none);
- the stop sequence;
- multi-part responses;
- token limit (`finishReason` `STOP`);
- the duplicate guard;
- client trimming.

## 3. Evidence: raw model output before any parsing

**Method:**
- The **unmodified** server was run with an analysis-only preload, `node -r capture.cjs` (scratchpad). It wraps the Vertex SDK's `GenerativeModel.generateContent` and appends every raw student result (all parts, `finishReason`, usage) to a JSONL file.
- **Reconstruction:**
  - the 5 affected turns were rebuilt from the stored transcripts: the exact history plus harness drawings;
  - one real PCK analysis was frozen per context;
  - each context was called 10 times through the real `callAI` → `/api/generate` path.
- **Probes:** 4 abbreviation probes on the same history, 8 calls each.
- **Volume:** 84 raw responses. All had one part; 83 ended with `STOP`, and 1 with `MAX_TOKENS` (a degenerate repeated-"?" output, which was invalid JSON and was retried by the existing policy; unrelated).

**Typical raw outputs** (exact):

```
{\n  "responses": [\n    {\n      "student": "יובל",\n      "message": "בטח. מלבן עם צלע אחת באורך 5 ס"\n    }\n  ]\n}
{\n  "responses": [\n    {\n      "student": "יובל",\n      "message": "אממ... מלבן עם צלע אחת באורך 5 ס"  }\n  ]\n}
…, {\n      "student": "נועה",\n      "message": "זה קמ"\n    }, …
```

The same model escaping correctly:

```
"message": "מלבן עם צלעות של 7 ס\"מ ו-4 ס\"מ. כל הזוויות שלו ישרות…"
```

The odd whitespace after a cut (`ס"  }`) is the decoder closing the JSON where the model wanted to continue the word. It appears in about half the cuts, so it is not a reliable signal.

| context | raw responses | message cut at `"` | quote escaped correctly |
|---|---:|---:|---:|
| C1 baseline run 1, s1 cast 1, T10 ("תן דוגמה למלבן שאינו ריבוע") | 10 | **6** | 0 |
| C2 baseline run 1, s3 cast 1, T8 (scare-quote case) | 10 | 0 | 0 |
| C3 baseline run 1, s6 cast 1, T10 | 10 | 1 | 0 |
| C4 baseline run 2, s1 cast 0, T10 | 10 | 0 | 0 |
| C5 prompt-examples A/B, s1 T10 | 11 | 4 | 1 |
| P1 "…עם אורכי הצלעות בסנטימטרים" (ס"מ) | 9 | **8** (of 8 valid) | 0 |
| P2 area in square metres (מ"ר) | 8 | 1 ("12 מ") | 1 ("ממ\"ר") |
| P3 speed (קמ"ש) | 8 | 5 ("זה קמ", "אולי קמ") | 8 |
| P4 quoted words ("רגיל") | 8 | 0 (the model used `'…'`) | 0 |

**Common abbreviations:**
- ס"מ, מ"ר and קמ"ש all fail the same way; the decisive factor is whether the model escapes the quote.
- Quotation marks inside ordinary text: the stored baseline case C2 ("…אם זה לא נראה כמו מלבן", most likely cut at an opening scare quote) **was not reproduced** in 10 reconstructions. In P4 the model chose single quotes.
- The mechanism is the same for any unescaped `"`, but the scare-quote variant is rarer.

## 4. All affected cases in the synthetic outputs

All synthetic outputs were scanned:
- 132 files: harness results, imported 1.3.9–1.3.11 replays, and every scratchpad experiment;
- 5,088 replies, 2,235 unique.

| case | reply (end) | kind |
|---|---|---|
| Mode B baseline final run 1, s1 cast 1, T10 (יובל) | "…מלבן שהצלע הארוכה היא 10 ס" | ס"מ |
| final run 1, s3 cast 1, T8 (תמר) | "אני עדיין לא מבינה. אם זה לא נראה כמו מלבן" | scare quote (inferred) |
| final run 1, s6 cast 1, T10 (יובל) | "…(נניח 5 ס" | ס"מ |
| final run 2, s1 cast 0, T10 (הילה) | "…מלבן עם צלע אחת של 5 ס" | ס"מ |
| prompt-examples A/B (c18), s1 T10, condition A (מעיין) | "כן, אם יש לי מלבן עם צלעות באורך 5 ס" | ס"מ (newly found) |

**Not affected:**
- Two replies kept ס"מ intact (escaped): historical 1.3.11 s1, and Mode B run 2 s1 cast 1.
- The only other replies without final punctuation are the natural "תודה" and "ביי".
- No earlier replay (1.3.9–1.3.11) shows a cut. Their teacher scripts rarely invite measurements.

**Not checked:** the pilot export (participant data; out of scope for this task). An aggregate, read-only count would show whether real teachers trigger it, since teachers asking for numeric examples is common.

## 5. Deterministic regression fixture

`server/test/student_quote_truncation.test.mjs` contains 3 tests and runs in `npm run test:all`. It uses three verbatim raw outputs from §3 (newline after the cut, spaces after the cut, and one cut reply of three) plus a correctly escaped control.
1. The raw outputs are valid JSON and the messages are already cut (`…באורך 5 ס`, `זה קמ`).
2. `validateStudentOutputText` accepts all of them: a structural check cannot see the loss.
3. **CURRENT BEHAVIOUR (defect):** with the fake model returning each raw output, `/api/generate` returns `200`, `success`, `text === raw`, `attempts: 1` and one model call.

This test documents the defect and is expected to change with the fix.

`npm run test:all` passed twice: 193 frontend and 195 backend tests (192 plus 3).

## 6. Proposed minimal fix (not implemented)

### 6.1 Prevention (primary): one output rule in the student prompt

Add, to the student prompt's output-format rules:

> Inside a message, never use the ASCII double quote character ("). Write Hebrew abbreviations with the Hebrew gershayim ״ (for example ס״מ, מ״ר, קמ״ש) or spell the word out, and quote words with single quotes ('…').

- `״` (U+05F4) is a normal string character in JSON, so there is nothing to escape and nothing for the decoder to misread.
- This is the only lever that fixes contexts like P1, where every attempt is cut.
- **Validate live before production**, with the A/B method of the earlier prompt experiments:
  - contexts P1 (8/8 baseline), C1 (6/10), C5 and P3, 10 calls per condition;
  - success: 0 cut replies, and no change to the rest of the output (reply length, responders, prompt-example copying, gershayim rendered correctly).
- It is a prompt change, so it needs a `SYSTEM_VERSION` bump, a changelog entry, and the "rest of the prompt unchanged" fingerprint test.

### 6.2 Detection (safety net, no repair, no retry change): content-free telemetry

- Add an exported pure function to `server/student_output_contract.js`, `findCutAbbreviations(responses)`. It flags a `message` that has **no sentence-final punctuation and ends in a 1–2-letter Hebrew token** (`/(^|[\s(\-–])[א-ת]{1,2}$/` after trimming).
  - **Corpus check:** it flags all 24 abbreviation cuts among 2,355 unique synthetic messages, and 0 natural replies ("תודה", "ביי", "כן." and similar are not flagged).
  - It does not catch a cut at an opening scare quote; the prompt rule addresses that.
  - A bare one-word reply without punctuation ("כן", "לא") would be flagged. None occurs in the corpus, and since the flag is telemetry only, such a false positive has no user-visible effect.
- In `/api/generate`, record a content-free counter `quoteCutSuspected` (an integer) in the student telemetry (A17 whitelist). Keep the output as is.
  - No retry, no rewrite and no drop: the 2-attempt policy and duplicate handling are unchanged.
  - It measures the residual rate in production after 6.1.
- **Optional, only if telemetry shows residual cuts after 6.1:** make a suspected cut a retryable outcome *as attempt 2 of the same B24 loop* (shared with technical retries and the duplicate re-ask; never a third attempt).
  - On the final attempt the output is returned unchanged.
  - Not recommended now: without prevention, a retry in the same context is usually cut again.

**Not proposed:**
- JSON repair, or changing `responseMimeType` / schema validation;
- rewriting student text (for example replacing `ס` with `ס״מ`);
- dropping replies.

## 7. Tests to add with the fix

**With 6.1 (prompt):**
- `studentAgent.test.js`:
  - the exact rule appears once, with and without PCK guidance;
  - the rest of the prompt is byte-identical to 1.3.12 (SHA-256 of the prompt with the rule removed, as for 1.3.12);
  - the WRONG and correct examples are unchanged.
- **Live A/B (analysis, not CI):** the contexts above, reporting cut replies and gershayim usage.

**With 6.2 (telemetry):**
- `student_output_contract` unit tests:
  - flags `…באורך 5 ס`, `זה קמ` and `…אז 12 מ`;
  - does not flag `…ס״מ.`, `…ס"מ.` (escaped), `תודה`, `ביי`, `כן.`, `לא?`, or a message ending in a number;
  - one flag per cut reply in a multi-reply output.
- Endpoint: the §5 fixture outputs give `200`, the text unchanged, `attempts: 1`, and `meta.quoteCutSuspected` equal to the number of cut replies. The control gives `quoteCutSuspected: 0`. The §5 "current behaviour" test is updated accordingly.
- `callTelemetry` / `conversationContract`: the new field is whitelisted, optional, a non-negative integer, and absent in older records.
- Regression: an existing duplicate-guard case still gives the same attempts and outcomes, so the 2-attempt policy is unchanged.

**If the optional retry is ever enabled:**
- a cut on attempt 1 leads to exactly 2 calls;
- a cut on both attempts returns attempt 2 unchanged, with `quoteCutSuspected` > 0;
- a duplicate plus a cut on attempt 1 leads to a single re-ask;
- a technical failure on attempt 2 returns attempt 1.

## 8. Limitations

- The reconstruction regenerated PCK, so the student prompt is not byte-identical to the original turn; the history is.
- C5 was originally recorded under the old prompt examples; it was reconstructed on 1.3.12.
- The scare-quote case (C2) is inferred: same signature, not reproduced live.
- Probes P2 and P3 are deliberately off-lesson.
- The pilot export was not checked (§4).
- Analysis files (scratchpad `c21/`): `capture.cjs`, `trunc.bench.js`, `raw_capture.jsonl` and `scan.py`.
  - The bench's client-side capture failed (the harness fetch shim has no `Response.clone`).
  - The server-side raw capture, which is the evidence used, is complete.
