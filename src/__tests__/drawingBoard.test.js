// Drawing board (1.5.0, pilot request #7, partial): Undo and a small colour palette.
// Protects:
//   - Undo reverts the most recent user drawing action; repeated Undo steps back through earlier ones;
//     it is disabled when there is nothing to undo. One step = one completed action: a pen stroke, a
//     drawn shape, a move/resize/rotate, deleting the selected shape(s), one eraser stroke, "נקה הכל".
//   - The eraser keeps its semantics: it erases only freehand strokes (flattened to a pixel layer);
//     shapes stay objects and are never erased. Undo of an eraser stroke restores the strokes.
//   - The palette: black is the default; the selection is visible (aria-pressed); new strokes and
//     shapes use it; existing drawings never change colour.
// NOT asserted: partial erasing of shapes and line straightening (deliberately not implemented).
//
// jsdom has no canvas, so Fabric is replaced by a small fake with the same API surface the board uses.
import React from "react";
import { act } from "react";
import { DrawingBoard } from "../components/DrawingBoard";
import { DRAWING_COLORS, DEFAULT_DRAWING_COLOR } from "../config/drawingPalette";
import { createDrawingHistory, MAX_UNDO_STEPS } from "../utils/drawingHistory";
import { render, click, flush } from "../testUtils/dom";

jest.mock("fabric", () => {
	let nextId = 1;
	class FakeObject {
		constructor(type, props) {
			Object.assign(this, { selectable: true, evented: true }, props);
			this.type = type;
			this.id = props && props.id ? props.id : nextId++;
		}
		set(props) {
			Object.assign(this, props);
			return this;
		}
		setCoords() {}
		getBoundingRect() {
			return { left: this.left || 0, top: this.top || 0, width: this.width || 0, height: this.height || 0 };
		}
		toObject() {
			// like Fabric: drawing properties only (no selectable / evented)
			const { type, id, left, top, width, height, stroke, x1, y1, x2, y2, points, angle } = this;
			return { type, id, left, top, width, height, stroke, x1, y1, x2, y2, points, angle };
		}
	}
	class FakeImage extends FakeObject {
		constructor(el, props) {
			super("image", props);
			this.src = (el && (el.src || el._src)) || (props && props.src) || "data:image/png;base64,PENLAYER";
		}
	}
	FakeImage.fromURL = (url, cb) => cb(new FakeImage({ src: url }));
	class FakeCanvas {
		constructor(_id, opts) {
			this.objects = [];
			this.handlers = {};
			this.active = [];
			this.backgroundImage = null;
			this.backgroundColor = opts.backgroundColor;
			this.isDrawingMode = opts.isDrawingMode;
			this.width = opts.width;
			this.height = opts.height;
			this.freeDrawingBrush = { color: "#000000", width: 2 };
			FakeCanvas.instances.push(this);
		}
		on(ev, fn) {
			(this.handlers[ev] = this.handlers[ev] || []).push(fn);
		}
		off(ev) {
			delete this.handlers[ev];
		}
		fire(ev, opt = {}) {
			(this.handlers[ev] || []).slice().forEach((fn) => fn(opt));
		}
		add(...objs) {
			this.objects.push(...objs);
		}
		remove(obj) {
			this.objects = this.objects.filter((o) => o !== obj);
		}
		getObjects() {
			return this.objects.slice();
		}
		forEachObject(fn) {
			this.objects.slice().forEach(fn);
		}
		clear() {
			this.objects = [];
			this.backgroundImage = null;
		}
		toJSON() {
			return {
				objects: this.objects.map((o) => o.toObject()),
				background: this.backgroundColor,
				backgroundImage: this.backgroundImage ? { src: this.backgroundImage.src } : undefined,
			};
		}
		loadFromJSON(json, cb) {
			const data = typeof json === "string" ? JSON.parse(json) : json;
			this.objects = data.objects.map((o) => new FakeObject(o.type, o));
			this.backgroundImage = data.backgroundImage ? new FakeImage({ src: data.backgroundImage.src }) : null;
			this.backgroundColor = data.background;
			setTimeout(cb, 0); // Fabric restores asynchronously
		}
		setBackgroundImage(img, cb) {
			this.backgroundImage = img;
			if (cb) cb();
		}
		toDataURL() {
			return "data:image/png;base64,SNAPSHOT";
		}
		getPointer(e) {
			return { x: e.x, y: e.y };
		}
		getElement() {
			return { getContext: () => null };
		}
		getActiveObject() {
			return this.active[0] || null;
		}
		getActiveObjects() {
			return this.active.slice();
		}
		setActiveObject(o) {
			this.active = [o];
			this.fire("selection:created");
		}
		discardActiveObject() {
			this.active = [];
		}
		renderAll() {}
		setWidth(w) {
			this.width = w;
		}
		setHeight(h) {
			this.height = h;
		}
		dispose() {}
	}
	FakeCanvas.instances = [];
	const fabric = {
		Canvas: FakeCanvas,
		Rect: class extends FakeObject {
			constructor(p) {
				super("rect", p);
			}
		},
		Line: class extends FakeObject {
			constructor(pts, p) {
				super("line", { ...p, x1: pts[0], y1: pts[1], x2: pts[2], y2: pts[3] });
			}
		},
		Polygon: class extends FakeObject {
			constructor(points, p) {
				super("polygon", { ...p, points });
			}
		},
		Path: class extends FakeObject {
			constructor(p) {
				super("path", p);
			}
		},
		Image: FakeImage,
		PencilBrush: class {
			constructor() {
				this.color = "#000000";
				this.width = 2;
			}
		},
	};
	return { fabric };
});
const { fabric } = require("fabric");

let view;
let canvas;
const undoButton = () => view.container.querySelector('[data-testid="drawing-undo"]');
const swatch = (id) => view.container.querySelector(`[data-testid="drawing-color-${id}"]`);
const toolButton = (title) =>
	Array.from(view.container.querySelectorAll("button")).find((b) => b.title === title || b.textContent.includes(title));

async function mountBoard() {
	fabric.Canvas.instances.length = 0;
	view = render(<DrawingBoard onDrawingCapture={React.createRef()} />);
	await act(async () => {
		await new Promise((r) => setTimeout(r, 130)); // the board creates its canvas after 100 ms
	});
	canvas = fabric.Canvas.instances[0];
}

/** A finished pen stroke, as Fabric's PencilBrush produces it. */
function penStroke(id) {
	const path = new fabric.Path({ id, stroke: canvas.freeDrawingBrush.color });
	act(() => {
		canvas.add(path);
		canvas.fire("path:created", { path });
	});
	return path;
}

function drag(from, to) {
	act(() => {
		canvas.fire("mouse:down", { e: from });
		canvas.fire("mouse:move", { e: to });
		canvas.fire("mouse:up", { e: to });
	});
}

async function undo() {
	click(undoButton());
	await flush();
}

const ids = () => canvas.getObjects().map((o) => o.id);

afterEach(() => view && view.unmount());

describe("drawing history (undo stack)", () => {
	it("starts with nothing to undo; each commit is one step; undo returns the previous state", () => {
		const h = createDrawingHistory();
		h.reset("S0");
		expect(h.canUndo()).toBe(false);
		expect(h.undo()).toBeNull();
		h.commit("S1");
		h.commit("S2");
		expect(h.canUndo()).toBe(true);
		expect(h.undo()).toBe("S1");
		expect(h.undo()).toBe("S0");
		expect(h.undo()).toBeNull();
		expect(h.canUndo()).toBe(false);
	});

	it("keeps at most MAX_UNDO_STEPS steps (oldest dropped)", () => {
		const h = createDrawingHistory(3);
		h.reset("S0");
		["S1", "S2", "S3", "S4"].forEach((s) => h.commit(s));
		expect(h.undo()).toBe("S3");
		expect(h.undo()).toBe("S2");
		expect(h.undo()).toBe("S1");
		expect(h.undo()).toBeNull();
		expect(MAX_UNDO_STEPS).toBeGreaterThanOrEqual(20);
	});
});

describe("Undo on the drawing board", () => {
	it("is in the toolbar and disabled while there is nothing to undo", async () => {
		await mountBoard();
		expect(undoButton()).toBeTruthy();
		expect(undoButton().disabled).toBe(true);
		expect(undoButton().getAttribute("aria-label")).toBe("בטל פעולה אחרונה");
		await undo(); // harmless
		expect(ids()).toEqual([]);
	});

	it("a pen stroke is one step; repeated Undo steps back through earlier strokes", async () => {
		await mountBoard();
		penStroke("p1");
		penStroke("p2");
		penStroke("p3");
		expect(undoButton().disabled).toBe(false);

		await undo();
		expect(ids()).toEqual(["p1", "p2"]);
		await undo();
		expect(ids()).toEqual(["p1"]);
		await undo();
		expect(ids()).toEqual([]);
		expect(undoButton().disabled).toBe(true);
	});

	it("a drawn shape is one step (not one per mouse move)", async () => {
		await mountBoard();
		penStroke("p1");
		click(toolButton("מקבילית"));
		await flush();
		act(() => {
			canvas.fire("mouse:down", { e: { x: 10, y: 10 } });
			canvas.fire("mouse:move", { e: { x: 50, y: 40 } });
			canvas.fire("mouse:move", { e: { x: 90, y: 70 } });
			canvas.fire("mouse:up", {});
		});
		await flush();
		expect(canvas.getObjects().map((o) => o.type)).toEqual(["path", "polygon"]);

		await undo();
		expect(ids()).toEqual(["p1"]);
	});

	it("restored shapes follow the current tool (interactive in select mode)", async () => {
		await mountBoard();
		click(toolButton("מלבן"));
		await flush();
		drag({ x: 10, y: 10 }, { x: 60, y: 40 }); // auto-switches to select mode
		await flush();
		click(toolButton("ריבוע"));
		await flush();
		drag({ x: 100, y: 100 }, { x: 140, y: 140 });
		await flush();

		await undo();
		expect(canvas.getObjects()).toHaveLength(1);
		expect(canvas.getObjects()[0].selectable).toBe(true);
		expect(canvas.getObjects()[0].evented).toBe(true);
	});

	it("moving / resizing a shape is one step; Undo puts it back", async () => {
		await mountBoard();
		click(toolButton("מלבן"));
		await flush();
		drag({ x: 10, y: 10 }, { x: 60, y: 40 });
		await flush();
		const rect = canvas.getObjects()[0];
		act(() => {
			rect.set({ left: 200, top: 150 });
			canvas.fire("object:modified", { target: rect });
		});
		await undo();
		expect(canvas.getObjects()[0].left).toBe(10);
		expect(canvas.getObjects()[0].top).toBe(10);
	});

	it("deleting the selected shape (Delete key or the floating button) is one step", async () => {
		await mountBoard();
		click(toolButton("מלבן"));
		await flush();
		drag({ x: 10, y: 10 }, { x: 60, y: 40 });
		await flush();

		act(() => canvas.setActiveObject(canvas.getObjects()[0]));
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
		});
		expect(canvas.getObjects()).toHaveLength(0);
		await undo();
		expect(canvas.getObjects().map((o) => o.type)).toEqual(["rect"]);

		act(() => canvas.setActiveObject(canvas.getObjects()[0]));
		await flush();
		click(view.container.querySelector('button[title="מחק צורה (Delete)"]'));
		expect(canvas.getObjects()).toHaveLength(0);
		await undo();
		expect(canvas.getObjects().map((o) => o.type)).toEqual(["rect"]);
	});

	it("נקה הכל is one step and can be undone", async () => {
		await mountBoard();
		penStroke("p1");
		penStroke("p2");
		click(toolButton("נקה הכל"));
		expect(ids()).toEqual([]);
		await undo();
		expect(ids()).toEqual(["p1", "p2"]);
	});

	describe("eraser semantics are unchanged", () => {
		let getContext;
		let image;
		beforeEach(() => {
			const ctx = { drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
			getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx);
			jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => "data:image/png;base64,ERASED");
			image = global.Image;
			global.Image = class {
				set src(v) {
					this._src = v;
					setTimeout(() => this.onload && this.onload(), 0);
				}
			};
		});
		afterEach(() => {
			getContext.mockRestore();
			HTMLCanvasElement.prototype.toDataURL.mockRestore && HTMLCanvasElement.prototype.toDataURL.mockRestore();
			global.Image = image;
		});

		async function eraserStroke() {
			act(() => canvas.fire("mouse:down", { e: { x: 5, y: 5 } }));
			await flush(); // the pen layer is flattened asynchronously on the first press
			act(() => {
				canvas.fire("mouse:move", { e: { x: 20, y: 20 } });
				canvas.fire("mouse:up", {});
			});
			await flush();
		}

		it("erases only the pen-stroke layer; shapes stay objects and are never erased", async () => {
			await mountBoard();
			penStroke("p1");
			click(toolButton("מלבן"));
			await flush();
			drag({ x: 10, y: 10 }, { x: 60, y: 40 });
			await flush();
			click(view.container.querySelector('button[title="מחק"]'));
			await flush();

			await eraserStroke();
			expect(canvas.getObjects().map((o) => o.type)).toEqual(["rect"]); // stroke flattened, shape kept
			expect(canvas.backgroundImage.src).toBe("data:image/png;base64,ERASED");
		});

		it("one eraser stroke is one step; Undo restores the strokes as they were", async () => {
			await mountBoard();
			penStroke("p1");
			click(toolButton("מלבן"));
			await flush();
			drag({ x: 10, y: 10 }, { x: 60, y: 40 });
			await flush();
			click(view.container.querySelector('button[title="מחק"]'));
			await flush();
			await eraserStroke();

			await undo();
			expect(canvas.getObjects().map((o) => o.type)).toEqual(["path", "rect"]);
			expect(canvas.backgroundImage).toBeNull();
			// restored objects stay non-interactive while the eraser is the active tool
			canvas.getObjects().forEach((o) => expect(o.selectable).toBe(false));

			// and the eraser works again afterwards (the pen layer is rebuilt from the restored state)
			await eraserStroke();
			expect(canvas.getObjects().map((o) => o.type)).toEqual(["rect"]);
		});

		it("a press of the eraser that erases nothing adds no undo step", async () => {
			await mountBoard();
			penStroke("p1");
			click(view.container.querySelector('button[title="מחק"]'));
			await flush();
			act(() => canvas.fire("mouse:down", { e: { x: 5, y: 5 } }));
			await flush();
			act(() => canvas.fire("mouse:up", {}));
			await flush();
			await undo(); // undoes the pen stroke, not the empty press
			expect(canvas.getObjects()).toHaveLength(0);
			expect(canvas.backgroundImage).toBeNull();
			expect(undoButton().disabled).toBe(true);
		});
	});
});

describe("colour palette", () => {
	it("is a small fixed palette with black first and as the default, the selection marked", async () => {
		expect(DRAWING_COLORS.length).toBeGreaterThanOrEqual(3);
		expect(DRAWING_COLORS.length).toBeLessThanOrEqual(6);
		expect(DRAWING_COLORS[0].value).toBe("#000000");
		expect(DEFAULT_DRAWING_COLOR).toBe("#000000");
		expect(new Set(DRAWING_COLORS.map((c) => c.value.toLowerCase())).size).toBe(DRAWING_COLORS.length);

		await mountBoard();
		DRAWING_COLORS.forEach((c) => {
			expect(swatch(c.id)).toBeTruthy();
			expect(swatch(c.id).getAttribute("aria-label")).toContain(c.label);
			expect(swatch(c.id).getAttribute("aria-pressed")).toBe(c.value === DEFAULT_DRAWING_COLOR ? "true" : "false");
		});
		expect(canvas.freeDrawingBrush.color).toBe("#000000");
	});

	it("new pen strokes and new shapes use the selected colour; existing drawings keep theirs", async () => {
		await mountBoard();
		const blue = DRAWING_COLORS[1];
		const red = DRAWING_COLORS[2];
		const first = penStroke("p1");

		click(swatch(blue.id));
		await flush();
		expect(swatch(blue.id).getAttribute("aria-pressed")).toBe("true");
		expect(swatch("black").getAttribute("aria-pressed")).toBe("false");
		expect(canvas.freeDrawingBrush.color).toBe(blue.value); // pen brush updated in place
		expect(first.stroke).toBe("#000000");

		for (const tool of ["קו", "מלבן", "ריבוע", "מקבילית", "מעוין", "טרפז", "דלתון"]) {
			click(toolButton(tool));
			await flush();
			drag({ x: 10, y: 10 }, { x: 60, y: 40 });
			await flush();
		}
		const shapes = canvas.getObjects().slice(1);
		expect(shapes).toHaveLength(7);
		shapes.forEach((s) => expect(s.stroke).toBe(blue.value));

		click(swatch(red.id));
		await flush();
		shapes.forEach((s) => expect(s.stroke).toBe(blue.value)); // unchanged
		click(toolButton("עפרון"));
		await flush();
		expect(canvas.freeDrawingBrush.color).toBe(red.value); // a new brush also gets the selection
	});

	it("Undo does not change the selected colour", async () => {
		await mountBoard();
		penStroke("p1");
		click(swatch(DRAWING_COLORS[1].id));
		await undo();
		expect(swatch(DRAWING_COLORS[1].id).getAttribute("aria-pressed")).toBe("true");
		expect(canvas.freeDrawingBrush.color).toBe(DRAWING_COLORS[1].value);
	});
});
