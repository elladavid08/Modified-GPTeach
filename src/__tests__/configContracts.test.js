// Invariants A6 (systemVersion), A7 (persona ids/versions), A8/B20 (scenario fields; uniqueness
// of scenario.text as the de-facto identifier, A8 — title *stability* is A9, REVIEW, not asserted),
// B5 (enough personas for a 3-student cast), A15 (DECIDED: participation.baseline ∈ {low, medium, high}).
import fs from "fs";
import path from "path";
import { SYSTEM_VERSION } from "../config/version";
import { Constants } from "../config/constants";
import personas from "../config/students/personas";
import scenarios from "../config/scenarios/geometry_scenarios";

const personaList = Object.values(personas.students);
const scenarioList = scenarios.scenarios;

describe("systemVersion", () => {
	it("is semantic X.Y.Z", () => {
		expect(SYSTEM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("has a changelog entry in version.js for the current version (A6 process rule, DECIDED)", () => {
		const src = fs.readFileSync(path.join(__dirname, "..", "config", "version.js"), "utf8");
		expect(src).toContain(` * ${SYSTEM_VERSION} (`);
	});
});

describe("student personas", () => {
	it("have unique ids and names, and a version, description and participation baseline", () => {
		const ids = personaList.map((p) => p.id);
		const names = personaList.map((p) => p.name);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(names).size).toBe(names.length);
		for (const p of personaList) {
			expect(p.id).toMatch(/^[a-z0-9]+$/); // used in persona refs v<version>_<id>
			expect(typeof p.version).toBe("string");
			expect(p.description.length).toBeGreaterThan(0);
			expect(["low", "medium", "high"]).toContain(p.participation.baseline);
		}
	});

	it("are enough for the configured cast size (prompt examples need >= 3 students)", () => {
		expect(Constants.NUM_STUDENTS).toBeGreaterThanOrEqual(3);
		expect(personaList.length).toBeGreaterThanOrEqual(Constants.NUM_STUDENTS);
	});
});

describe("scenarios", () => {
	it("have unique non-empty titles (scenario.text is the de-facto identifier)", () => {
		const titles = scenarioList.map((s) => s.text);
		expect(titles.every((t) => typeof t === "string" && t.trim().length > 0)).toBe(true);
		expect(new Set(titles).size).toBe(titles.length);
	});

	it("carry the fields that are snapshotted into conversation records", () => {
		for (const s of scenarioList) {
			expect(s.teacher_briefing).toBeTruthy();
			expect(s.misconception_focus).toBeTruthy();
			expect(Array.isArray(s.target_pck_skills) && s.target_pck_skills.length > 0).toBe(true);
			expect(["teacher", "students"]).toContain(s.initiated_by);
		}
	});

	it("are all teacher-initiated in the pilot protocol (B20)", () => {
		expect(scenarioList.every((s) => s.initiated_by === "teacher")).toBe(true);
	});
});
