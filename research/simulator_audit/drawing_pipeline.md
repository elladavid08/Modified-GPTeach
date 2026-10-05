# Drawing / whiteboard pipeline (current behaviour)

Legend: [CODE] traced in code · [DATA] measured on the 133 exported conversations · [HYPOTHESIS].

## 1. What the teacher can draw (UI) [CODE]

`src/components/DrawingBoard.jsx` uses fabric.js v5. The ✏️ button in `InputField` toggles the board. The board **replaces the message list** inside the chat column (`Messages.jsx:68-71`): it is hidden with `display:none` but never unmounted.

| tool | implementation |
|---|---|
| Select / move / resize / rotate | fabric native selection. Delete / Backspace or a floating 🗑️ removes the selected object(s). |
| Pen | `fabric.PencilBrush`, black, 2 px, which yields `fabric.Path` objects |
| Line, rectangle, square, parallelogram, rhombus, trapezoid, kite | drag-to-size `fabric.Line` / `Rect` / `Polygon`, black 2 px, transparent fill. After each shape the tool switches to Select automatically. |
| Eraser | **Pixel eraser.** On first use it **rasterises all pen paths into one background bitmap** (`DrawingBoard.jsx:166-268`). Vector shapes stay objects. Each later erase stroke re-encodes the whole bitmap as a data URL. |
| Clear all | `canvas.clear()` |
| "כלול בהודעה" checkbox | opt-in to attach the board to the *next* message |

Not available: colours, text or labels on the drawing, vertex labels (A, B, C), measurements or angle marks, undo/redo, grid, snapping, student drawing, and any view of a previously sent drawing except inside the chat bubble.

## 2. Internal representation [CODE]

- **Live state:** a fabric object list (`Path`, `Line`, `Rect`, `Polygon`), plus once the eraser has been used, a `backgroundImage` raster of the erased pen layer. It lives only in the browser tab.
- The board **persists across messages** within the session, because it is never cleared after a send. Each attached image is therefore a snapshot of the **cumulative** board.
- After *every* send (with or without a drawing) the board closes and the checkbox resets (`Chat.jsx:81-85`).
- Canvas pixel size equals the container size. It changes with window size and resize events (`resizeCanvas`), so snapshot dimensions vary by device (observed widths 600-1,055 px [DATA]).

## 3. Send path [CODE]

```
InputField submit → Chat.addUserResponse (Chat.jsx:59-90)
  if include ✓ && hasDrawing():  base64 = DrawingBoard.exportAsImage()
        → fabricCanvas.toDataURL({format:'png'}) (full canvas, white bg) → strip "data:…," prefix
  ChatMessage(agent, text, 'user', image=base64)          ← full-resolution PNG in React state
  history.addMessage(msg)
```

The chat bubble shows the full-resolution PNG under the text (`ChatBubble.jsx`, `max-height 300px`).

## 4. What each LLM receives

| agent | receives the drawing? | how |
|---|---|---|
| **Student agent** (`/api/generate`) | **Yes, as raw pixels, on every later turn.** | `ChatMessage.toAIformat` → `content:[{text},{inline_data:{mime_type:'image/png', data}}]`. `convertMessagesToGenAI` (`server.js:190-219`) emits `parts:[{text}, {inline_data}]`. Because the whole history is re-sent each turn, **every past drawing is re-sent on every subsequent student call**. There is no textual description or caption and no "this drawing replaces the previous one" marker. The only guidance is a generic sentence in `Constants.RESPONSE_INSTRUCTIONS` ("DRAWING/DIAGRAM CONTEXT … reference specific parts of it"). If the teacher text is empty, the text part is dropped and only the image is sent (`server.js:197-202` skips the falsy `""`). |
| **PCK feedback** (`/api/pck-feedback`) | **No.** | The base64 travels in the request body (`conversationHistory` = full `ChatMessage` objects), but `formatConversationHistory` uses only `text`. The prompt does not even note that a drawing was attached. The PCK agent judges the teacher's move **without seeing the drawing**, even when the drawing *is* the pedagogical move (e.g. "I drew a counterexample"). |
| **Summary** (`/api/pck-summary`) | **No.** | `turn.teacher.image` is in the payload but unused in the prompt. |

So the student agent and the feedback agent see different evidence for the same turn. This is a structural source of student/feedback inconsistency (e.g. the students react to a counterexample drawing while the feedback says "no counterexample was used"). [CODE; frequency HYPOTHESIS]

## 5. Persistence [CODE + DATA]

- `conversationLogger.addTurn(..., teacherImage)` → `compressImageBase64(base64, 600)` (`conversationLogger.js:14-37`) **downscales to ≤ 600 px width** (still PNG) → `turn.teacher.image`.
  - It is stored **inline in the conversation document**, which is rewritten in full on every turn.
  - On compression error it falls back to the original image.
- It is stored **only if the turn is logged**, i.e. if students replied. A drawing sent on a turn whose student call failed is lost.
- **Not stored:** the full-resolution PNG the model actually received; fabric JSON / vector objects; stroke order or timing; board states that were never attached; whether the board was open but not included; the eraser layer as a separate layer.
- [DATA]
  - 99 turns carry images, in 49 conversations (the research exporter already extracted these under `data/raw/images/`).
  - Base64 length: median 18.7 KB, max 76.5 KB.
  - Largest conversation document: 237 KB, comfortably under Firestore's 1 MB limit. The limit is a future risk for drawing-heavy long sessions. A failed `setDoc` is only `console.error`ed, and *every later save of that conversation would also fail*.
  - Observed PNG widths of 697-1,055 px show that some older records were stored **uncompressed**. Compression was added after the first drawing commit, so the stored resolution varies by system version.
  - 5 cases where a byte-identical image was attached again later in the same conversation (the board was re-included unchanged).
  - 11 turns are image-only (empty teacher text).

## 6. Can the raw drawing be reconstructed later?

| question | answer |
|---|---|
| The image the teacher attached, as a picture | **Approximately.** A ≤ 600 px-wide PNG is available for logged turns (older records hold the original resolution). |
| The exact bytes the student model received | **No.** Only the downscaled copy is stored. |
| The drawing as geometry (which shapes, vertices, lines) | **No.** No vector data is stored. It would need image analysis. |
| How the drawing evolved / what was added this turn | **Only by diffing consecutive snapshots**, and only for turns where the teacher chose to attach. |
| What the students "saw" on turns without an attachment | The model was still being re-sent **all previous images** in history, so the effective visual context for turn *k* = all images attached at turns < *k*. That set is reconstructable from stored turns, at reduced resolution. |
| Drawings on failed / unlogged turns | **Lost.** |

## 7. Notes relevant to a future shared mathematical workspace (no design here)

- Today's representation is a write-only raster attachment. There is no shared object model, no student-side rendering surface, and no stable identifiers for geometric elements that either agent could refer to.
- The feedback agent is blind to drawings. Any workspace work will need to decide what the PCK agent sees (pixels, a structured description, or both).
- Persistence is inline base64 in the conversation document. A workspace with richer state would need a separate store (e.g. a subcollection or Cloud Storage), mainly because of the 1 MB document limit and the whole-document rewrite on every turn.
- Downstream research tooling (`research/pck_feedback/src/pck_feedback/export/extract_images.py`, annotation UIs, the Excel export) reads `turn.teacher.image` as base64 PNG. That contract should be kept or versioned.

## 8. Known issue: image-only teacher turns (added 2026-10-05)

Image-only turns (drawing included, no text) are a supported input (`invariants.md` B22, DECIDED). The C4 empty-message fix deliberately keeps them. Downstream they are incomplete (`invariants.md` §E1):
- they appear as **blank teacher messages** in the Excel and CSV exports and in agent transcripts;
- in-app viewers show the drawing under an empty text line;
- the **student agent sees the drawing**, but the **PCK agent receives an empty message** (`/api/pck-feedback` returns 400, so there is no feedback and the students run unsteered);
- the **summary agent** sees an empty `Teacher:` line;
- so saved pilot conversations with such turns are hard to interpret, and the agents worked from inconsistent evidence (11 turns in the 2026-07-27 export).

Not changed yet. It belongs to the drawing/multimodal backlog (`regression_test_plan.md` §0.10), together with B17 (PCK and summary drawing visibility).
