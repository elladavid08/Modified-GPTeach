// TeacherBriefingPanel (B20, 1.4.4) in isolation: the fallback path that no active scenario uses.
// The full behaviour inside the chat page is covered in chatTurnOrchestration.test.js.
import React from "react";
import { TeacherBriefingPanel } from "../components/TeacherBriefingPanel";
import { render, click } from "../testUtils/dom";

let view;
afterEach(() => view && view.unmount());

const q = (id) => view.container.querySelector(`[data-testid="${id}"]`);

it("without a briefing shows the fallback before the lesson and nothing once it has started", () => {
	view = render(<TeacherBriefingPanel briefing={undefined} fallbackText="FALLBACK" lessonStarted={false} />);
	expect(q("teacher-briefing-prelesson").textContent).toContain("FALLBACK");
	view.unmount();
	view = render(<TeacherBriefingPanel briefing={undefined} fallbackText="FALLBACK" lessonStarted />);
	expect(view.container.innerHTML).toBe("");
});

it("renders the briefing as plain text (markup-like text is not interpreted)", () => {
	const briefing = "שורה ראשונה\n<b>לא מודגש</b>";
	view = render(<TeacherBriefingPanel briefing={briefing} lessonStarted />);
	click(q("teacher-briefing-toggle"));
	expect(q("teacher-briefing-content").textContent).toBe(briefing);
	expect(q("teacher-briefing-content").querySelector("b")).toBeNull();
});
