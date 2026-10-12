# Quote-safety prompt rule: live A/B

Status: experiment only, 2026-10-12, on committed **1.3.12** (`279721a`).
- No production change, no `SYSTEM_VERSION` bump, and no retry, telemetry, duplicate, PCK, persona, example, model-config or harness change.
- Synthetic contexts only; no participant data; nothing written to Firestore.
- Follows `student_quote_truncation_investigation.md`.

## Summary

- **Abbreviation cuts:** the rule removes them completely.
  - In the trigger contexts, A cut **29 of 127** replies and B cut **0 of 125**.
  - B wrote **77** abbreviations with a correct Hebrew gershayim (ס״מ, מ״ר, קמ״ש).
  - The rule never leaked into student output.
  - JSON validity was 100%, and latency was unchanged.
- **Opening-quote cuts:** the rule does **not** fix them.
  - These are cut replies where the model *opens* a quoted term with an ASCII `"` (for example `אני חושבת ש"` before a quoted term).
  - With B, there was 1 such cut in an ordinary context, and **6 of 56** replies in a probe where the teacher's own message contains double-quoted terms. A cut 1 of 53 in the same probe.
  - The samples are small, but B is not better here and may be worse.
- **Behaviour change:** students under B mention units and abbreviate them more often. The rule's examples prime this. It is natural Hebrew, but it is a measurable change.
- **Recommendation:** the exact rule is **not ready** as a complete fix. Its abbreviation clause works. Its quoting clause needs to be revised and retested (§7).

## 1. Conditions

**A** is the current 1.3.12 student prompt.

**B** is the identical prompt plus one line, item 6 of the "FORMAT REQUIREMENTS" list, directly after item 5:

```
6. Inside a message, never use the ASCII double quote character ("). Write Hebrew abbreviations with the Hebrew gershayim ״ (for example ס״מ, מ״ר, קמ״ש), and put quoted words in single quotes ('...').
```

**Prompt integrity:**
- B was produced benchmark-side by inserting this line into the outgoing `/api/generate` request (asserting that item 5 matches exactly once).
- A diff of the captured system prompts shows **exactly this one added line**.
- The server-side capture confirmed the rule appeared once in every B request (114 of 114) and in no A request.

## 2. Method

- **Path:** the real PCK → `callAI` → local **unmodified** `server/server.js` → Gemini (`gemini-2.5-flash-lite`, production settings).
  - The server ran with the analysis-only raw-capture preload from the investigation. It records each raw model response (all parts, `finishReason`) and its condition, before any parsing.
- **Contexts:** rebuilt from stored synthetic transcripts (exact history and drawings), with one real PCK analysis frozen per context and shared by A and B. The condition order alternates per repetition.

| id | context | calls per condition |
|---|---|---:|
| T1-cm | s1 cast 1 history; teacher asks for a non-square rectangle "עם אורכי הצלעות בסנטימטרים" | 12 |
| T2-s1c1T10 | the rebuilt baseline case (final run 1, s1 cast 1, T10: "תן או תני דוגמה למלבן שאינו ריבוע") | 12 |
| T3-m2 | area of a 3 m × 4 m rectangle, "כתבו את היחידות בקיצור" (מ"ר) | 12 |
| T4-kmh | speed of 15 km/h "בקיצור" (קמ"ש) | 12 |
| T5-scare | the prior scare-quote case (final run 1, s3 cast 1, T8) | 12 |
| T6-echoquotes | the teacher asks about "חוצים זה את זה" vs "חוצים זוויות" (double-quoted terms) | 12 |
| T7-c18 | the earlier A/B truncation case (s1 T10) | 12 |
| N1 / N2 / N3 | ordinary turns: s2 T5 explanation with drawing; s6 T8 content question; s5 T9 "?" probe | 8 each |
| **follow-up** N3 | the context of the one B cut in the main run | 20 |
| **follow-up** T8-prefixquote | s5 history; "עדי, מה בדיוק הכוונה ב"נקודת המפגש" של האלכסונים? ומה זה "באמצע"?" (quoted terms with prefix letters) | 20 |

**Volume:** 216 calls in the main run plus 80 in the follow-up, giving **296 calls** and **333 raw model responses** (including attempts 2).

**Measures:**
- **Cut reply:** a message without final punctuation that is visibly unfinished. Every such case was confirmed in the raw output, as a string closed by an unescaped `"`.
- Correctly completed abbreviations, written with `״` or an escaped `\"`.
- Unit usage, and spelled-out vs abbreviated units.
- Rule leakage (ASCII / gershayim / quote vocabulary in replies).
- JSON validity; responders, length, attempts and latency.

## 3. Results: trigger contexts (main run)

| context | A replies | **A cut** | A intact (escaped `\"`) | B replies | **B cut** | B with `״` | B with escaped `\"` |
|---|---:|---:|---:|---:|---:|---:|---:|
| T1-cm | 13 | **13** | 0 | 12 | **0** | 12 | 0 |
| T2-s1c1T10 | 12 | **9** | 1 | 12 | **0** | 12 | 0 |
| T3-m2 | 12 | **5** | 1 | 13 | **0** | 10 | 3 |
| T4-kmh | 34 | 1 | 22 | 33 | **0** | 31 | 2 |
| T5-scare | 24 | 0 | 0 | 24 | 0 | 0 | 0 |
| T6-echoquotes | 15 | 0 | 0 | 14 | 0 | 0 | 0 |
| T7-c18 | 17 | 1 | 3 | 17 | **0** | 12 | 0 |
| **total** | 127 | **29** | 27 | 125 | **0** | **77** | 5 |

- **Gershayim are used correctly:** U+05F4 between the letters (ס״מ, מ״ר, קמ״ש), never stray or doubled. The 5 B replies that still used ASCII `"` escaped it correctly, so nothing was lost; they are minor rule violations.
- **T5 / T6 (quotes):** in both conditions the model quoted with single quotes (`'חוצים זה את זה'`), and nothing was cut. The original scare-quote cut (baseline C2) did not recur in either condition.

**Units and abbreviations** (no avoidance, but a priming effect):

| context | A | B |
|---|---|---|
| T1-cm | 13 of 13 tried ס"מ, and all 13 were cut | 12 of 12 full "ס״מ" sentences |
| T2 | 10 of 12 tried ס"מ (9 cut) | 12 of 12 with ס״מ |
| T3-m2 | 12 of 12 spelled out "מטר רבוע" (5 then cut at a trailing "מ") | 13 of 13 abbreviated (10 × מ״ר) |
| T4-kmh | 22 abbreviated, 11 spelled out | 31 abbreviated, 3 spelled out |
| T7-c18 | units in 4 of 17 (plain numbers otherwise) | ס״מ in 12 of 17 |

B students never avoided measurements. Instead they used abbreviations more, and added units where A students gave plain numbers (T7). This follows from the rule naming ס״מ, מ״ר and קמ״ש.

## 4. Results: ordinary contexts and the follow-up

**Ordinary contexts N1–N3 (main run, 24 calls per condition):**

| | A | B |
|---|---|---|
| replies (per call) | 60 (2.50) | 63 (2.62) |
| mean length (characters) | 100 | 102 |
| cut replies | 0 | **1** (opening quote, below) |
| gershayim / rule leakage | 0 / 0 | 0 / 0 |
| errors / invalid JSON | 0 / 0 | 0 / 0 |
| attempt 2 (all duplicate re-asks) | 4 | 6 |

The one B cut was in N3 (raw): `"…אני עדיין לא מבינה איפה ה"` followed by the end of the string. The model opened a quoted term with a prefix letter, `ה"אמצע"`, using ASCII `"` despite the rule.

**Follow-up (20 calls per condition):**

| context | A replies / cut | B replies / cut |
|---|---|---|
| N3 (same context as the B cut) | 60 / 0 | 60 / 0 |
| T8-prefixquote (the teacher writes ב"נקודת המפגש", "באמצע") | 53 / **1** | 56 / **6** |

The raw outputs of the T8 cuts all open a quoted term with ASCII `"`:
- `"אני חושבת ש"`, `"…נכון? וה"` and `"אולי "`;
- `"…אבל מה זה אומר "` and `"…האם "`, which end in a trailing space inside the string.

Single-quoted terms were equally common in both conditions (A 23, B 21). The instruction "put quoted words in single quotes" did not stop ASCII opening quotes when the teacher's message itself contains double-quoted terms.

**All cuts, both runs:**
- **A: 30** (29 abbreviation + 1 opening quote).
- **B: 7** (0 abbreviation + 7 opening quote).

## 5. Validity, latency, leakage

- **JSON / schema:** all 333 raw responses were valid JSON with the schema, and all ended with `STOP`. There were no client errors and no replies with invalid names.
- **Latency, student calls:**
  - triggers: p50 / p90 / max = 1,073 / 1,589 / 8,702 ms (A) vs 1,107 / 1,528 / 1,838 ms (B);
  - ordinary: 1,836 / 7,880 / 8,799 ms (A) vs 1,737 / 8,391 / 10,681 ms (B).
  - The high p90 in both conditions comes from duplicate re-asks in N3, where the same context gave 13 (A) and 12 (B) duplicate re-asks out of 20 in the follow-up. This does not depend on the condition.
- **Rule leakage:** none. No reply mentions ASCII, gershayim, quotation marks or the rule.
- **Naturalness** (paired read):
  - B replies are as natural as A's, and in T1/T2 they are complete sentences where A's were cut ("…עם צלע אחת באורך 5 ס״מ וצלע שנייה באורך 8 ס״מ. זה מלבן כי…").
  - T4 B answers are slightly terser ("15 קמ״ש.").
  - No persona or PCK difference was visible.

## 6. Detection note (for the later telemetry step; not implemented)

Over all 841 raw messages from the investigation and this experiment:
- Every abbreviation cut, and the opening-quote cuts that end in a 1–2-letter prefix ("ש", "וה"), are caught by the earlier signature: no final punctuation plus a final 1–2-letter Hebrew token.
- The other opening-quote cuts ("…מה זה אומר ", "…האם ", "אולי ") **end in whitespace inside the raw string**. The client's `trim()` later hides this.
- A detector for the telemetry step should therefore check the raw, untrimmed message for trailing whitespace too. One complete reply also ended in a stray space, so this is a signal for telemetry, not grounds for a rewrite.

## 7. Recommendation

1. **Do not ship rule B as is.**
   - Its abbreviation clause works: 29 → 0 cuts, correct gershayim, no leakage, no regression in ordinary turns.
   - Its quoting clause does not prevent opening-quote cuts: 7 cuts under B, concentrated where the teacher uses double-quoted terms.
2. **Next (small) A/B before production:** current vs. two variants, on T1, T2, T7, T8-prefixquote and N3, with at least 20 calls per condition.
   - **C, abbreviation-only:**

     > 6. Inside a message, write Hebrew abbreviations with the Hebrew gershayim ״ (for example ס״מ, מ״ר, קמ״ש), never with the ASCII double quote character (").

   - **D, abbreviations plus an explicit quoting rule that covers the observed trigger:**

     > 6. Inside a message, never use the ASCII double quote character ("), even if the teacher's message uses it. Write Hebrew abbreviations with the Hebrew gershayim ״ (for example ס״מ, מ״ר, קמ״ש). To mention a term, write it in single quotes ('...') or without quotation marks.

   - Success criterion: 0 abbreviation cuts and opening-quote cuts at or below A, with no other change. If neither variant fixes opening quotes, ship the abbreviation rule (C), because it removes the large, measurement-triggered failure. The rarer quote cuts would then be left to the telemetry and safety-net step from the investigation (§6.2 there).
3. **Production diff** (for the winning variant, shown here for C; D differs only in the text): one line after item 5 in `makeProsePrompt` (`src/utils/ai.js:346`):

   ```diff
    	retStr += `\n5. Return ONLY the "responses" array: no reasoning, analysis or explanation fields, and no text outside it`;
   +	retStr += `\n6. Inside a message, write Hebrew abbreviations with the Hebrew gershayim ״ (for example ס״מ, מ״ר, קמ״ש), never with the ASCII double quote character (").`;
   ```

   With it:
   - `SYSTEM_VERSION` 1.3.13 and a changelog entry;
   - `studentAgent.test.js`: the exact rule appears once, with and without PCK guidance; the rest of the prompt is byte-identical to 1.3.12 (fingerprint with the line removed);
   - the `student_quote_truncation.test.mjs` fixture stays (it documents model behaviour, not the prompt);
   - the replay harness is unaffected (no prompt-example change).

## 8. Limitations

- **Sample sizes:** 12–20 calls per context and condition. The opening-quote difference in T8 (6/56 vs 1/53) is suggestive, not conclusive.
- **Off-lesson probes:** T3, T4 and T8 are deliberately unusual teacher turns.
- **Reconstruction:** PCK was regenerated per context, so the student prompt is not byte-identical to the original turns (the history is).
- **Analysis files** (scratchpad `c22/`, `c22/followup/`):
  - `qsafe.bench.js`, `capture.cjs`, `analyze.py`;
  - `raw_capture.jsonl` and `client_results.json`;
  - `prompt_samples.json` (the A and B system prompts).
