// Pilot request #8 (1.4.4): scenarios the current teacher has already attempted look different on
// the selection screen. Not a completion or locking feature: nothing is stored, nothing is blocked.
//   - attempted = at least one saved conversation of this teacher, with at least one logged turn,
//     whose scenario title matches the scenario (finished or not);
//   - matching uses the stored scenario.text (de-facto identifier, A9), normalised, including the
//     legacy "השיעור של השבוע הוא על " title prefix used before 2026-03-17.
// The page-level behaviour (query, failure, starting an attempted scenario) is covered in
// chatTurnOrchestration.test.js.
import React from "react";
import {
	LEGACY_SCENARIO_TITLE_PREFIX,
	normalizeScenarioTitle,
	getAttemptedScenarioTexts,
} from "../services/attemptedScenarios";
import { ScenarioSelector } from "../components/ScenarioSelector";
import scenarios from "../config/scenarios/geometry_scenarios";
import { render, click, findButtonByText } from "../testUtils/dom";

const all = scenarios.scenarios;
const [A, B] = all;
const UID = "teacher-1";

/** A saved conversation document as the logger writes it (only the fields used here). */
function conv(scenarioText, { userId = UID, turns = 1, endTime = null } = {}) {
	return {
		userId,
		endTime,
		scenario: { text: scenarioText },
		turns: Array.from({ length: turns }, (_, i) => ({ turnNumber: i + 1 })),
	};
}

describe("normalizeScenarioTitle", () => {
	it("leaves a current title unchanged", () => {
		for (const s of all) expect(normalizeScenarioTitle(s.text)).toBe(s.text);
	});

	it("strips the legacy 'השיעור של השבוע הוא על ' prefix used before 2026-03-17", () => {
		expect(LEGACY_SCENARIO_TITLE_PREFIX).toBe("השיעור של השבוע הוא על ");
		expect(normalizeScenarioTitle("השיעור של השבוע הוא על יחסי הכלה בין ריבוע למלבן")).toBe("יחסי הכלה בין ריבוע למלבן");
	});

	it("ignores surrounding and repeated whitespace", () => {
		expect(normalizeScenarioTitle("  יחסי  הכלה בין ריבוע למלבן \n")).toBe("יחסי הכלה בין ריבוע למלבן");
	});

	it("returns an empty string for missing or non-string titles", () => {
		expect(normalizeScenarioTitle(undefined)).toBe("");
		expect(normalizeScenarioTitle(null)).toBe("");
		expect(normalizeScenarioTitle(42)).toBe("");
	});
});

describe("getAttemptedScenarioTexts", () => {
	const attempted = (conversations, userId = UID) => Array.from(getAttemptedScenarioTexts(conversations, userId, all));

	it("no conversations: nothing attempted", () => {
		expect(attempted([])).toEqual([]);
		expect(attempted(undefined)).toEqual([]);
	});

	it("one saved conversation for scenario A marks only A", () => {
		expect(attempted([conv(A.text)])).toEqual([A.text]);
	});

	it("a conversation that was never finished counts, and a finished one counts the same", () => {
		expect(attempted([conv(A.text, { endTime: null })])).toEqual([A.text]);
		expect(attempted([conv(A.text, { endTime: "2026-10-01T10:00:00.000Z" })])).toEqual([A.text]);
	});

	it("several conversations for the same scenario give one entry", () => {
		expect(attempted([conv(A.text), conv(A.text, { turns: 5 }), conv(A.text, { endTime: "x" })])).toEqual([A.text]);
	});

	it("conversations for other scenarios do not affect a scenario", () => {
		const result = attempted([conv(B.text)]);
		expect(result).toEqual([B.text]);
		expect(result).not.toContain(A.text);
	});

	it("matches legacy records with the old title prefix to the current scenario", () => {
		expect(attempted([conv(LEGACY_SCENARIO_TITLE_PREFIX + A.text)])).toEqual([A.text]);
	});

	it("needs at least one logged turn (a document without turns is not an attempt)", () => {
		expect(attempted([conv(A.text, { turns: 0 })])).toEqual([]);
		expect(attempted([{ ...conv(A.text), turns: undefined }])).toEqual([]);
	});

	it("ignores another user's conversations even if they are passed in", () => {
		expect(attempted([conv(A.text, { userId: "someone-else" })])).toEqual([]);
		expect(attempted([conv(A.text)], null)).toEqual([]);
	});

	it("ignores retired or unknown scenario titles and malformed documents", () => {
		expect(
			attempted([
				conv("השיעור של השבוע הוא על משולשים: סוגי משולשים, תכונות משולשים, ומשפט אי-השוויון במשולש."),
				conv(""),
				{ userId: UID, turns: [{}] },
				null,
				"not a document",
			])
		).toEqual([]);
	});

	it("returns current scenario titles, in a Set", () => {
		const set = getAttemptedScenarioTexts([conv(LEGACY_SCENARIO_TITLE_PREFIX + A.text), conv(B.text)], UID, all);
		expect(set).toBeInstanceOf(Set);
		expect(set.has(A.text)).toBe(true);
		expect(set.has(B.text)).toBe(true);
		expect(set.size).toBe(2);
	});
});

describe("ScenarioSelector attempted styling", () => {
	let view;
	afterEach(() => view && view.unmount());

	const cards = () => Array.from(view.container.querySelectorAll('[data-testid="scenario-card"]'));
	const card = (text) => cards().find((c) => c.textContent.includes(text));
	const marked = () => cards().filter((c) => c.getAttribute("data-attempted") === "true");

	it("renders all six cards, in order, with the same look when nothing is attempted", () => {
		const onSelect = jest.fn();
		view = render(<ScenarioSelector scenarios={all} onSelect={onSelect} />);
		expect(cards()).toHaveLength(6);
		expect(cards().map((c) => c.textContent)).toEqual(all.map((s) => s.text));
		expect(marked()).toHaveLength(0);
		expect(new Set(cards().map((c) => c.getAttribute("style"))).size).toBe(1);
		expect(view.container.textContent).not.toContain("התנסית");
	});

	it("an empty attempted set looks exactly like no set", () => {
		view = render(<ScenarioSelector scenarios={all} onSelect={() => {}} />);
		const plain = cards().map((c) => c.outerHTML);
		view.unmount();
		view = render(<ScenarioSelector scenarios={all} onSelect={() => {}} attemptedScenarioTexts={new Set()} />);
		expect(cards().map((c) => c.outerHTML)).toEqual(plain);
	});

	it("marks only the attempted card, with a visible caption, and keeps the others unchanged", () => {
		view = render(<ScenarioSelector scenarios={all} onSelect={() => {}} />);
		const plain = cards().map((c) => c.outerHTML);
		view.unmount();
		view = render(<ScenarioSelector scenarios={all} onSelect={() => {}} attemptedScenarioTexts={new Set([A.text])} />);

		expect(marked()).toEqual([card(A.text)]);
		expect(card(A.text).textContent).toContain(A.text);
		expect(card(A.text).textContent).toContain("התנסית בתרחיש זה");
		expect(card(A.text).getAttribute("style")).not.toBe(card(B.text).getAttribute("style"));
		cards().slice(1).forEach((c, i) => expect(c.outerHTML).toBe(plain[i + 1]));
	});

	it("an attempted card stays an enabled, clickable button that opens the description and starts the lesson", () => {
		const onSelect = jest.fn();
		view = render(<ScenarioSelector scenarios={all} onSelect={onSelect} attemptedScenarioTexts={new Set([A.text])} />);
		const a = card(A.text);
		expect(a.tagName).toBe("BUTTON");
		expect(a.disabled).toBe(false);
		expect(a.getAttribute("aria-disabled")).toBeNull();
		expect(a.style.cursor).toBe("pointer");

		click(a);
		expect(findButtonByText(view.container, "התחל בשיעור")).toBeTruthy();
		click(findButtonByText(view.container, "התחל בשיעור"));
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(A);
	});

	it("the selected (open) state still wins over the attempted look, and the caption stays", () => {
		view = render(<ScenarioSelector scenarios={all} onSelect={() => {}} attemptedScenarioTexts={new Set([A.text])} />);
		click(card(A.text));
		expect(card(A.text).style.backgroundColor).toBe("rgb(26, 58, 92)"); // #1a3a5c, the existing selected look
		expect(card(A.text).textContent).toContain("התנסית בתרחיש זה");
	});

	it("keeps the RTL page and right-aligned cards", () => {
		view = render(<ScenarioSelector scenarios={all} onSelect={() => {}} attemptedScenarioTexts={new Set([A.text])} />);
		expect(view.container.firstChild.style.direction).toBe("rtl");
		for (const c of cards()) expect(c.style.textAlign).toBe("right");
	});
});
