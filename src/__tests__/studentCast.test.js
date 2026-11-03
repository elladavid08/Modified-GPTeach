// B5 (DECIDED): every conversation draws its own cast of NUM_STUDENTS distinct personas, uniformly at random from the
// full persona set (services/studentCast.js). Regression: until 1.6.1 the cast was the first three of a list shuffled
// once per page load, so every conversation in a tab got the same students.
// The session-level properties (fixed within a conversation, new draw per conversation, recorded) are asserted in
// chatTurnOrchestration.test.js and conversationLogger.test.js.
import { selectSessionCast } from "../services/studentCast";
import { Constants } from "../config/constants";
import personas from "../config/students/personas";

const allStudents = Object.values(personas.students);

// Deterministic PRNG (mulberry32) so the distribution checks never flake.
function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("selectSessionCast (B5)", () => {
	it("the persona set has 9 personas and a session uses 3", () => {
		expect(allStudents).toHaveLength(9);
		expect(Constants.NUM_STUDENTS).toBe(3);
	});

	it("returns NUM_STUDENTS distinct personas from the full set and leaves the input unchanged", () => {
		const before = allStudents.slice();
		const cast = selectSessionCast(allStudents, Constants.NUM_STUDENTS);
		expect(cast).toHaveLength(3);
		expect(new Set(cast.map((s) => s.id)).size).toBe(3);
		cast.forEach((s) => expect(allStudents).toContain(s));
		expect(allStudents).toEqual(before);
	});

	it("is not the first three personas: high random draws reach the end of the list", () => {
		const cast = selectSessionCast(allStudents, 3, () => 0.99);
		expect(cast).toEqual([allStudents[8], allStudents[0], allStudents[1]]);
	});

	it("samples uniformly from all 9: every persona is drawn, in every position, at about 1/3 of sessions", () => {
		const random = seeded(20261103);
		const draws = 9000;
		const inCast = new Map(allStudents.map((s) => [s.id, 0]));
		const first = new Map(allStudents.map((s) => [s.id, 0]));
		const casts = new Set();
		for (let k = 0; k < draws; k++) {
			const cast = selectSessionCast(allStudents, 3, random);
			cast.forEach((s) => inCast.set(s.id, inCast.get(s.id) + 1));
			first.set(cast[0].id, first.get(cast[0].id) + 1);
			casts.add(cast.map((s) => s.id).sort().join("|"));
		}
		inCast.forEach((n) => expect(n / draws).toBeGreaterThan(0.3) && expect(n / draws).toBeLessThan(0.37));
		// order is random too (the misconception carrier rule takes the first eligible cast member)
		first.forEach((n) => expect(n / draws).toBeGreaterThan(0.09) && expect(n / draws).toBeLessThan(0.13));
		expect(casts.size).toBe(84); // all C(9,3) casts occur
	});

	it("consecutive draws produce different casts", () => {
		const random = seeded(7);
		const keys = new Set(Array.from({ length: 10 }, () => selectSessionCast(allStudents, 3, random).map((s) => s.id).join("|")));
		expect(keys.size).toBeGreaterThan(1);
	});

	it("handles a set smaller than the cast size and an empty or missing set", () => {
		expect(selectSessionCast(allStudents.slice(0, 2), 3)).toHaveLength(2);
		expect(selectSessionCast([], 3)).toEqual([]);
		expect(selectSessionCast(null, 3)).toEqual([]);
	});
});
