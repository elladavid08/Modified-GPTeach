// Contract for Firestore `conversations/{sessionId}` documents (invariants.md A1-A13).
// Readers that depend on it: ConversationLogs, AdminConversationLogs, ResearchConversations,
// ConvAnnotationEditor, exportConversationExcel, firebaseAdmin agreement/comparison code,
// research/pck_feedback export scripts.
//
// The validator checks REQUIRED structure only. Additional fields are allowed, because schema
// extensions must be additive (A2). It returns a list of violations (empty = valid).

import contract from "./contracts/pckSkillsContract.json";

export const SESSION_ID_RE = /^session_\d+_[a-z0-9]+$/;
export const PERSONA_REF_RE = /^v[^_]+_[a-z0-9]+$/;
export const SKILL_IDS = contract.skills.map((s) => s.skill_id);
export const SCORES = contract.scores;

const isStr = (v) => typeof v === "string";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function validatePckFeedback(fb, where, errors) {
	if (fb === null) return;
	if (!isObj(fb)) {
		errors.push(`${where}: pckFeedback must be object or null`);
		return;
	}
	for (const key of ["feedback_message", "feedback_type", "detected_skills", "missed_opportunities"]) {
		if (!(key in fb)) errors.push(`${where}: pckFeedback.${key} missing`);
	}
	// skills_assessment is absent in legacy (pre-1.2) records (A13); validate when present.
	if ("skills_assessment" in fb) {
		if (!Array.isArray(fb.skills_assessment)) errors.push(`${where}: skills_assessment must be array`);
		else
			fb.skills_assessment.forEach((s, i) => {
				if (!SKILL_IDS.includes(s.skill_id)) errors.push(`${where}: skills_assessment[${i}] unknown skill_id ${s.skill_id}`);
				if (typeof s.is_relevant !== "boolean") errors.push(`${where}: skills_assessment[${i}].is_relevant not boolean`);
				if (s.is_relevant && !SCORES.includes(s.score)) errors.push(`${where}: skills_assessment[${i}] score ${s.score} not in 0/1/2`);
			});
	}
}

export function validateConversationDoc(doc, { legacy = false } = {}) {
	const errors = [];
	if (!isObj(doc)) return ["document must be an object"];

	if (!isStr(doc.sessionId) || !SESSION_ID_RE.test(doc.sessionId)) errors.push("sessionId missing or malformed");
	if (!isStr(doc.userId)) errors.push("userId missing");
	if (!isStr(doc.systemVersion)) errors.push("systemVersion missing");
	if (!isStr(doc.startTime)) errors.push("startTime missing");
	if (!("endTime" in doc)) errors.push("endTime key missing (null allowed)");
	if (!isObj(doc.scenario) || !isStr(doc.scenario.text)) errors.push("scenario.text missing");
	if (!isObj(doc.stats)) errors.push("stats missing");
	if (!("summaryFeedback" in doc) || !(doc.summaryFeedback === null || isStr(doc.summaryFeedback)))
		errors.push("summaryFeedback must be string or null");

	if (legacy) {
		if (!Array.isArray(doc.students) && !Array.isArray(doc.studentRefs)) errors.push("legacy: students or studentRefs required");
	} else if (!Array.isArray(doc.studentRefs) || doc.studentRefs.some((r) => !PERSONA_REF_RE.test(r))) {
		errors.push("studentRefs missing or malformed (expected v<version>_<id>)");
	}

	if (!Array.isArray(doc.turns)) {
		errors.push("turns must be an array");
		return errors;
	}
	doc.turns.forEach((t, i) => {
		const where = `turns[${i}]`;
		if (t.turnNumber !== i + 1) errors.push(`${where}: turnNumber ${t.turnNumber} expected ${i + 1}`);
		if (!isObj(t.teacher) || !isStr(t.teacher.message)) errors.push(`${where}: teacher.message missing`);
		else if (!(t.teacher.image === null || t.teacher.image === undefined || isStr(t.teacher.image)))
			errors.push(`${where}: teacher.image must be base64 string or null`);
		else if (isStr(t.teacher.image) && t.teacher.image.startsWith("data:"))
			errors.push(`${where}: teacher.image must not carry a data-URL prefix`);
		if (!Array.isArray(t.students) || t.students.length === 0) errors.push(`${where}: students must be a non-empty array`);
		else
			t.students.forEach((s, j) => {
				if (!isStr(s.name) || !isStr(s.message)) errors.push(`${where}.students[${j}]: name/message missing`);
			});
		if (!("pckFeedback" in t)) errors.push(`${where}: pckFeedback key missing (null allowed)`);
		else validatePckFeedback(t.pckFeedback, where, errors);
	});
	return errors;
}
