// C5: teacher-message line breaks are preserved end-to-end (string) and shown in the chat bubble
// (presentation via white-space: pre-wrap; no HTML conversion).
import React from "react";
import fs from "fs";
import path from "path";
import ChatBubble from "../components/ChatBubble";
import ChatMessage from "../objects/ChatMessage";
import { AppContext } from "../objects/AppContext";
import { render } from "../testUtils/dom";

const MULTILINE = "שורה ראשונה\nשורה שנייה\n\nשורה רביעית";

function renderBubble(message) {
	return render(
		<AppContext.Provider value={{ TAname: "Teacher" }}>
			<ChatBubble message={message} />
		</AppContext.Provider>
	);
}

let view;
afterEach(() => view && view.unmount());

describe("ChatMessage keeps the teacher's original text", () => {
	it("teacher text keeps every line break and internal whitespace unchanged", () => {
		const m = new ChatMessage("Teacher", MULTILINE, "user");
		expect(m.text).toBe(MULTILINE);
		expect(m.toAIformat().content).toBe(MULTILINE);
		const spaced = new ChatMessage("Teacher", "  א  ב\n\tג  ", "user");
		expect(spaced.text).toBe("  א  ב\n\tג  ");
	});

	it("teacher text with a drawing keeps its line breaks in the multimodal format", () => {
		const m = new ChatMessage("Teacher", MULTILINE, "user", "iVBORx");
		expect(m.toAIformat().content[0]).toEqual({ text: MULTILINE });
	});
});

describe("ChatBubble rendering", () => {
	it("shows a teacher message with the same line breaks (pre-wrap), as plain text", () => {
		view = renderBubble(new ChatMessage("Teacher", MULTILINE, "user"));
		const bubble = view.container.querySelector(".chatBubbleUser");
		expect(bubble.style.whiteSpace).toBe("pre-wrap");
		expect(bubble.textContent).toContain(MULTILINE);
		expect(bubble.innerHTML).not.toMatch(/<br/i);
	});

	it("never interprets message text as HTML", () => {
		const text = "<b>מודגש</b>\n<img src=x onerror=alert(1)>";
		view = renderBubble(new ChatMessage("Teacher", text, "user"));
		const bubble = view.container.querySelector(".chatBubbleUser");
		expect(bubble.textContent).toContain(text);
		expect(bubble.querySelector("b")).toBeNull();
		expect(bubble.querySelector("img")).toBeNull();
	});

	it("does not use raw HTML injection", () => {
		const src = fs.readFileSync(path.join(__dirname, "..", "components", "ChatBubble.jsx"), "utf8");
		expect(src).not.toContain("dangerouslySetInnerHTML");
	});

	it("student messages still render with their name label and text", () => {
		view = renderBubble(new ChatMessage("נועה", "אז ריבוע הוא גם מלבן?", "assistant"));
		expect(view.container.querySelector(".chatBubbleSenderLabel").textContent).toContain("נועה");
		const bubble = view.container.querySelector(".chatBubbleOther");
		expect(bubble.textContent).toContain("אז ריבוע הוא גם מלבן?");
		expect(view.container.querySelector(".chatBubbleUser")).toBeNull();
	});

	it("a teacher drawing still renders under the text", () => {
		view = renderBubble(new ChatMessage("Teacher", MULTILINE, "user", "iVBORx"));
		const img = view.container.querySelector(".chatBubbleUser img");
		expect(img.getAttribute("src")).toBe("data:image/png;base64,iVBORx");
	});
});
