# Mode B baseline 1.3.12: second-review sample

**Purpose:** an independent second review of the judgement calls in the 1.3.12 Mode B baseline (`student_stability_replay.md` §11). The heuristic labels are candidates, not ground truth.

**Data:** synthetic replay conversations only; no participant data.

**De-identification:** persona names are replaced with cast slots:
- **[A]:** the designed misconception carrier, addressed at T2 and T7;
- **[B], [C]:** the other two students;
- **[other]:** a persona outside the cast.

The texts are the exact stored replies; only the names are replaced.

**How to review:**
- Fill the last column with **agree**, **disagree** (plus your label), or **unsure**.
- Definitions are in `student_stability_harness_review.md` §4.
  - **Resolution:** the same student states or applies the target idea in their own words, on a content move, after the teacher addressed it, without hedging. Teacher acknowledgement alone does not count.
  - **Regression:** a return to the misconception after a genuine resolution.
  - **Contamination:** a student reproduces another student's idiosyncratic content as their own, without engaging with it.
  - **Teacher attributions:** *invented* = the teacher never said anything like it; *mixed* = a real source (a peer, or the premise of the teacher's question) presented as the teacher's statement; *ambiguous addressee* = "אמרת" may address a peer.

**Selection:** every non-trivial first-review judgement in the categories that bear on the explicit-state decision: invented and mixed attributions, all ambiguous contamination candidates, every genuine or borderline repeat-after-answer, the one genuine semantic repetition, premature-correctness examples, the one rejected resolution, and both persistent misconceptions. Clear-cut items (shared lesson wording, accurate attributions, progress between turns) are counted in §11 but not listed.

| id | scenario · turn · slot | teacher turn | student reply | heuristic label | first-review verdict | why ambiguous | second review |
|---|---|---|---|---|---|---|---|
| S1 | s1 · T3 · C (PCK same) | אוקיי | אבל המורה אמרה שריבוע זה סוג נפרד של מרובע, לא רק מלבן. זה מה שבלבל אותי. | teacher attribution | INVENTED: the teacher never said this (T1 question, T2 question, T3 "אוקיי") | core example of the invented-attribution pattern | |
| S2 | s1 · T4 · B (PCK same) | [B], מה דעתך על מה שנאמר? | אני חושבת ש[C] צודק. אם המורה אמרה שזה סוג נפרד, אז זה לא יכול להיות מלבן. אולי ההגדרה של מלבן היא רק 'ארבע זוויות ישרות', אבל יש עוד תנאים לריבוע שגורמים לו להיות משהו אחר לגמרי. | teacher attribution | INVENTED (propagated): builds on S1 as if the teacher had said it | is propagation a separate defect or part of S1? | |
| S3 | s2 · T3 · A (PCK same) | אוקיי | אבל אמרת שאם הם מאונכים זה מעוין... אז זה מספיק? | teacher attribution | INVENTED: turns the teacher's T2 question ("אם … מאונכים, האם הוא בהכרח מעוין?") into a statement | misreading a question vs inventing | |
| S4 | s2 · T2 · A (PCK same) | [A], אם במרובע האלכסונים מאונכים, האם הוא בהכרח מעוין? | כן, אם האלכסונים מאונכים, אז זה מעוין. אמרת את זה קודם, לא? | teacher attribution | INVENTED: "אמרת את זה קודם" after a T1 question only | same pattern as S3, other run | |
| S5 | s2 · T4 · C (PCK improved) | [B], מה דעתך על השאלה ששאלתי את [A]? | אני לא בטוחה. המורה, אמרת לנו שבמעוין האלכסונים מאונכים, אבל זה לא אומר שכל מרובע עם אלכסונים מאונכים הוא מעוין, נכון? צריך לבדוק עוד משהו? | teacher attribution | MIXED: attributes what peers said at T1 to the teacher | peer vs teacher source | |
| S6 | s4 · T4 · B (PCK more_confused) | [B], מה דעתך על הטענה שבכל מרובע שבו האלכסונים חוצים זה את זה, הם גם חוצים את הזוויות? | רגע, אבל אמרת שאלכסונים חוצים זה את זה במלבן? אז אם הם חוצים זה את זה, הם בטוח חוצים גם את הזוויות. זה נשמע לי הגיוני. | teacher attribution | MIXED: reads the premise of the teacher's T4 question as a statement about the rectangle | mixed vs invented | |
| S7 | s3 · T9 · A (PCK more_confused) | ? | אני חושב שאפשר להשתמש בפינה של דף או משולש ישר זווית כדי לבדוק אם הזוויות ישרות, כמו שאמרת קודם. | teacher attribution | MIXED: the teacher only hinted "which tool"; a peer named the tools | mixed vs accurate paraphrase | |
| S8 | s6 · T2 · A (PCK improved) | [A], האם מעוין הוא סוג של דלתון? | אבל אמרת שדלתון זה שני זוגות של צלעות סמוכות שוות, ומעוין זה כל הצלעות שוות. זה נראה לי שונה. | teacher attribution | AMBIGUOUS ADDRESSEE: "אמרת" may address the peer who gave the definition | peer reference vs teacher attribution | |
| S9 | s1 · T4 · B (PCK confused) | [B], מה דעתך על מה שנאמר? | אני [other]ין לא בטוחה. אמרת שריבוע זה מלבן, אבל [C] אמרה שבריבוע כל הצלעות שוות ובמלבן רק צלעות נגדיות. זה נשמע לי שונה. | teacher attribution | AMBIGUOUS ADDRESSEE: "אמרת שריבוע זה מלבן" (a peer said it at T2) | peer reference vs teacher attribution | |
| S10 | s3 · T11 · C (PCK more_confused) | [B], האם מראה של צורה יכול להטעות? תן או תני דוגמה. | אני לא בטוחה. אני תמיד מסתכלת איך שזה נראה. אם זה לא נראה כמו מלבן, אז אני לא חושבת שזה מלבן. | contamination candidate | AMBIGUOUS: adopts a peer's appearance-based wording one turn after answering correctly by echoing the teacher (T10) | peer contamination / persistence / regression? | |
| S11 | s5 · T7 · C (PCK more_confused) | [A], אז אלכסונים שווים לבד - מספיק לריבוע? | אז בעצם, 'חוצים זה את זה' זה אומר שהם שווים? אני [other]ין מתבלבלת בין כל התנאים. | contamination candidate | AMBIGUOUS: takes up a peer's new confusion ("bisecting ⇒ equal") as a question | realistic peer influence vs contamination | |
| S12 | s5 · T8 · B (PCK misconception_reinforced) | [A], כמו בשרטוט: האלכסונים שווים ומאונכים, אבל נקודת המפגש לא באמצע של אף אחד מהם, ולכן זה לא ריבוע. שרטטתי מרובע שהאלכסונים שלו שווים ומאונכים אבל לא חוצים זה את זה. מה דעתכם? | רגע, אז אם האלכסונים נפגשים באמצע, זה אומר שהם שווים ומאונכים? כי פה הם מאונכים ושווים, אבל זה לא ריבוע. | contamination candidate | AMBIGUOUS: same "meeting in the middle ⇒ …" confusion, from a peer, applied to the drawing | realistic peer influence vs contamination | |
| S13 | s5 · T12 · A (PCK more_confused) | יפה מאוד, כל הכבוד. | אז מה זה אומר שהם 'חוצים זה את זה'? זה תנאי נפרד? | repeat after answered (MEANING) | BORDERLINE: asks again whether bisecting is a separate condition; the definition given did not address that | partially answered vs loop | |
| S14 | s5 · T9 · C (PCK more_confused) | ? | אז אם האלכסונים שווים ומאונכים אבל לא חוצים את אמצע אחד של השני, זה לא ריבוע? אני קצת אבודה, למה זה לא מספיק? | repeat after answered (WHY) | GENUINE re-ask after the full answer, under more_confused PCK | state-consistent confusion vs loop defect | |
| S15 | s5 · T9 · A (PCK misconception_reinforced) | ? | אני [C]ין לא מבינה. אם האלכסונים שווים ומאונכים, איך זה לא ריבוע? מה זה אומר שהם לא 'חוצים זה את זה'? | repeat after answered (WHY) | GENUINE re-ask after the full answer, under misconception_reinforced PCK | state-consistent confusion vs loop defect | |
| S16 | s6 · T6 · C (PCK improved) | נכון | נכון! אני זוכר את זה עכשיו. אם כל הצלעות שוות, זה תמיד אומר שיש שני זוגות של צלעות סמוכות שוות. | semantic repetition | GENUINE (mild): third restatement of the same inclusion argument (T3, T5, T6) | mild affirmation vs loop | |
| S17 | s1 · T2 · A (PCK same) | [A], האם ריבוע הוא מלבן לדעתך? | כן, זה נראה לי אותו דבר, יש לו ארבע זוויות ישרות. | premature correctness | FIRM: the misconception carrier answers correctly before the explanation | persona fidelity of slot A | |
| S18 | s4 · T2 · A (PCK same) | [B], שאלה טובה, נבדוק את זה עוד רגע. [A], האם במלבן האלכסונים חוצים את הזוויות? | רגע, במלבן האלכסונים לא חוצים את הזוויות, נכון? הם שווים אבל לא חוצים. | premature correctness | FIRM: carrier answers correctly at T2 | persona fidelity of slot A | |
| S19 | s5 · T2 · A (PCK same) | [A], אם במרובע האלכסונים שווים, האם הוא ריבוע? | רגע, אם האלכסונים שווים זה אומר שהוא מלבן. אז לא בהכרח ריבוע, נכון? | premature correctness | FIRM: carrier reasons correctly at T2 | persona fidelity of slot A | |
| S20 | s6 · T2 · A (PCK improved) | [C], צלעות סמוכות נפגשות בקודקוד. צלעות נגדיות לא נוגעות זו בזו. [A], האם מעוין הוא סוג של דלתון? | אה... אני חושב שכן? כי יש לו צלעות שוות. | premature correctness | TENTATIVE: "אני חושב שכן? כי יש לו צלעות שוות" (right answer, weak reason) | tentative correct vs premature | |
| S21 | s3 · T10 · C (PCK more_confused) | [C], נחזור להגדרה: מלבן הוא מרובע שכל זוויותיו ישרות, בלי קשר לאיך שהוא נראה. [C], מה צריך לבדוק כדי לדעת שמרובע הוא מלבן? | שכל הזוויות שלו ישרות. | resolution | NOT a resolution: repeats what the teacher said in the same turn | own words vs echo (corrected definition) | |
| S22 | s5 · T12 · B (PCK more_confused) | יפה מאוד, כל הכבוד. | תודה. אבל [other]ין לא הבנתי לגמרי למה זה לא מספיק. אם הם שווים ומאונכים, זה אמור להיות ריבוע. | persistent misconception | PERSISTENT T3–T12 under more_confused PCK on every turn | state-consistent vs failure to update | |
| S23 | s5 · T9 · A (PCK more_confused) | ? | אז אתה אומר שגם אם האלכסונים שווים ומאונכים, זה [other]ין לא ריבוע? אני [other]ין לא מבין למה זה לא מספיק. מה זה אומר 'לא חוצים זה את זה'? | persistent misconception | PERSISTENT T1–T9 under more_confused PCK | state-consistent vs failure to update | |
