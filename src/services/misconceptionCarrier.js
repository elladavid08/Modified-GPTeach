/**
 * Misconception carrier (1.5.0).
 *
 * One student of the session's fixed cast is designated, once per conversation, as the student who holds the
 * scenario's misconception. The student prompt (utils/ai.js) then makes that student express it and keep it until
 * the teacher actually addresses it; without a carrier the student prompt is the 1.4.4 one.
 * Validated in research/simulator_audit/student_misconception_carrier_experiment.md (prototype v1).
 *
 * Rule "first-non-low-v1": the first cast member whose participation baseline is not "low", else the first.
 * The cast is already a uniform random draw (AppContext), so the carrier stays random while avoiding a student who
 * rarely speaks in class-addressed exchanges.
 */
export const MISCONCEPTION_CARRIER_RULE = "first-non-low-v1";

/** {name, personaId, rule} for the session, or null when the scenario has no misconception focus or no cast. */
export function selectMisconceptionCarrier(students, scenario) {
	if (!scenario || !scenario.misconception_focus || !Array.isArray(students) || students.length === 0) {
		return null;
	}
	const carrier = students.find((s) => !(s.participation && s.participation.baseline === "low")) || students[0];
	return { name: carrier.name, personaId: carrier.id || null, rule: MISCONCEPTION_CARRIER_RULE };
}

/** The scenario as the student agent sees it: a copy with `misconception_carrier` (the name), or the scenario itself. */
export function withMisconceptionCarrier(scenario, carrier) {
	return carrier ? { ...scenario, misconception_carrier: carrier.name } : scenario;
}
