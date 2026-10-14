// Synthetic conversation documents (no participant data). Shapes mirror real exported
// records: current (v1.3.0) and legacy (v1.0/1.1: embedded students/userProfile, pckFeedback
// without skills_assessment, free-text skill ids in missed_opportunities).

const TINY_PNG_B64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function currentFormatConversation() {
	return {
		sessionId: "session_1700000000000_abc123xyz",
		userId: "test-user",
		userSnapshot: { fullName: "Test Teacher", role: "teacher" },
		systemVersion: "1.3.0",
		startTime: "2026-01-01T10:00:00.000Z",
		endTime: "2026-01-01T10:20:00.000Z",
		scenario: {
			text: "יחסי הכלה בין ריבוע למלבן",
			grade_level: 7,
			misconception_focus: "ריבוע אינו מלבן",
			target_pck_skills: ["kcs-square-rectangle-inclusion-7th"],
			initiated_by: "teacher",
		},
		studentRefs: ["v1.0_noa", "v1.0_tamar", "v2.0_roee"],
		stats: { totalTeacherMessages: 2, totalStudentMessages: 3, totalPCKFeedbacks: 1, durationMinutes: 20 },
		summaryFeedback: "### סיכום כללי\nTEST-SUMMARY-BODY\n\n### טיפים לשיפור\n- TEST-TIP",
		turns: [
			{
				turnNumber: 1,
				timestamp: "2026-01-01T10:01:00.000Z",
				teacher: { message: "TEST-TEACHER-1 מה ההגדרה של מלבן?", image: null, timestamp: "2026-01-01T10:01:00.000Z" },
				students: [{ name: "נועה", message: "TEST-STUDENT-1 ריבוע זה לא מלבן", timestamp: "2026-01-01T10:01:05.000Z" }],
				pckFeedback: null,
			},
			{
				turnNumber: 2,
				timestamp: "2026-01-01T10:02:00.000Z",
				teacher: { message: "TEST-TEACHER-2 בואו נבדוק", image: TINY_PNG_B64, timestamp: "2026-01-01T10:02:00.000Z" },
				students: [
					{ name: "תמר", message: "TEST-STUDENT-2", timestamp: "2026-01-01T10:02:05.000Z" },
					{ name: "רועי", message: "TEST-STUDENT-3", timestamp: "2026-01-01T10:02:06.000Z" },
				],
				pckFeedback: {
					feedback_message: "TEST-FEEDBACK-MESSAGE",
					feedback_type: "positive",
					skills_assessment: [
						{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "TEST-EVIDENCE-2" },
						{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 0, what_could_be_better: "TEST-SUGGESTION-0" },
						{ skill_id: "error-leveraging", is_relevant: false, reason_not_relevant: "מוקדם" },
					],
					detected_skills: [{ skill_id: "error-identification", evidence: "TEST-EVIDENCE-2" }],
					missed_opportunities: [],
					timestamp: "2026-01-01T10:02:01.000Z",
				},
			},
		],
	};
}

export function legacyFormatConversation() {
	return {
		sessionId: "session_1690000000000_legacy001",
		userId: "test-user",
		userProfile: { fullName: "Legacy Teacher" },
		systemVersion: "1.0.0",
		startTime: "2025-03-04T11:00:00.000Z",
		endTime: null,
		scenario: { text: "הגדרת המלבן וזיהוי מלבנים" },
		students: [{ id: "hila", name: "הילה" }],
		stats: { totalTeacherMessages: 1, totalStudentMessages: 1, totalPCKFeedbacks: 1 },
		summaryFeedback: null,
		turns: [
			{
				turnNumber: 1,
				timestamp: "2025-03-04T11:18:45.683Z",
				teacher: { message: "LEGACY-TEACHER", timestamp: "2025-03-04T11:18:45.683Z" },
				students: [{ name: "הילה", message: "LEGACY-STUDENT", timestamp: "2025-03-04T11:18:45.683Z" }],
				pckFeedback: {
					feedback_message: "LEGACY-FEEDBACK",
					feedback_type: "neutral",
					detected_skills: [],
					missed_opportunities: [
						{ skill_id: "זיהוי תפיסה חזותית שגויה - מלבן", what_could_have_been_done: "LEGACY-MISSED" },
					],
					timestamp: "2025-03-04T11:18:45.683Z",
				},
			},
		],
	};
}

// One synthetic conversation exercising every row case of the PCK display contract (B28), shared by the
// cross-view consistency test (sidebar / conversation-log viewer / admin viewer + CSV / Excel export).
// Current-format turns use 1.4.x shapes (3.1 often leaves `evidence` empty and puts it in detected_skills).
export function pckDisplayContractConversation() {
	const turn = (turnNumber, pckFeedback) => ({
		turnNumber,
		timestamp: `2026-01-02T10:0${turnNumber}:00.000Z`,
		teacher: { message: `PCKX-TEACHER-${turnNumber}`, image: null, timestamp: `2026-01-02T10:0${turnNumber}:00.000Z` },
		students: [{ name: "נועה", message: `PCKX-STUDENT-${turnNumber}`, timestamp: `2026-01-02T10:0${turnNumber}:05.000Z` }],
		pckFeedback,
	});
	const feedback = (n, fields) => ({
		feedback_message: `T${n}-MESSAGE`,
		feedback_type: "neutral",
		missed_opportunities: [],
		timestamp: `2026-01-02T10:0${n}:01.000Z`,
		...fields,
	});
	return {
		sessionId: "session_1700000000000_pckx01",
		userId: "test-user",
		userSnapshot: { fullName: "Test Teacher", role: "teacher" },
		systemVersion: "1.4.3",
		startTime: "2026-01-02T10:00:00.000Z",
		endTime: "2026-01-02T10:20:00.000Z",
		scenario: { text: "יחסי הכלה בין ריבוע למלבן", misconception_focus: "ריבוע אינו מלבן" },
		studentRefs: ["v1.0_noa"],
		stats: { totalTeacherMessages: 6, totalStudentMessages: 6, totalPCKFeedbacks: 5 },
		summaryFeedback: null,
		turns: [
			// T1: score 2 own evidence (recommendation not shown), score 2 via demonstrated_skills, score 1 both parts,
			// score 1 improvement only, score 0 (demonstrated_skills not used).
			turn(1, feedback(1, {
				skills_assessment: [
					{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "T1-EI-OWN", what_could_be_better: "T1-EI-REC" },
					{ skill_id: "error-characterization", is_relevant: true, score: 2, evidence: "", what_could_be_better: "" },
					{ skill_id: "diagnostic-interpretation", is_relevant: true, score: 1, evidence: "T1-DI-POS", what_could_be_better: "T1-DI-IMP" },
					{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 1, evidence: "", what_could_be_better: "T1-APR-IMP" },
					{ skill_id: "error-leveraging", is_relevant: true, score: 0, evidence: "", what_could_be_better: "T1-EL-IMP" },
				],
				detected_skills: [
					{ skill_id: "error-characterization", evidence: "T1-EC-DEMO" },
					{ skill_id: "error-leveraging", evidence: "T1-EL-NOT-SHOWN" },
				],
			})),
			// T2: rows without any usable text; ambiguous and malformed demonstrated_skills are never used.
			turn(2, feedback(2, {
				skills_assessment: [
					{ skill_id: "error-identification", is_relevant: true, score: 2, evidence: "", what_could_be_better: "T2-EI-MISPLACED" },
					{ skill_id: "error-characterization", is_relevant: true, score: 2, evidence: "  " },
					{ skill_id: "diagnostic-interpretation", is_relevant: true, score: 1, evidence: "", what_could_be_better: "" },
					{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 2 },
					{ skill_id: "error-leveraging", is_relevant: false, reason_not_relevant: "T2-NOT-RELEVANT" },
				],
				detected_skills: [
					{ skill_id: "error-identification", evidence: "T2-AMBIG-A" },
					{ skill_id: "error-identification", evidence: "T2-AMBIG-B" },
					{ skill_id: "error-characterization", evidence: { "מה קיים": "T2-OBJECT" } },
					{ skill_id: "Diagnostic-Interpretation", evidence: "T2-WRONG-CASE" },
					null,
					"T2-STRING",
					{ evidence: "T2-NO-ID" },
				],
			})),
			// T3: score 1 whose positive part comes from demonstrated_skills; a relevant row without a score.
			turn(3, feedback(3, {
				skills_assessment: [
					{ skill_id: "adapted-pedagogical-response", is_relevant: true, score: 1, evidence: "", what_could_be_better: "T3-APR-IMP" },
					{ skill_id: "error-identification", is_relevant: true, what_could_be_better: "T3-EI-NOSCORE" },
				],
				detected_skills: [{ skill_id: "adapted-pedagogical-response", evidence: "T3-APR-DEMO" }],
			})),
			// T4: legacy (v1.0) feedback: no skills_assessment, free-text skill id.
			turn(4, {
				feedback_message: "T4-MESSAGE",
				feedback_type: "neutral",
				detected_skills: [{ skill_id: "error-identification", evidence: "T4-LEGACY-EV" }],
				missed_opportunities: [{ skill_id: "זיהוי תפיסה חזותית שגויה - מלבן", what_could_have_been_done: "T4-LEGACY-MISSED" }],
				timestamp: "2026-01-02T10:04:01.000Z",
			}),
			// T5: no PCK feedback stored for the turn.
			turn(5, null),
			// T6: feedback whose skills are all irrelevant: no rows anywhere.
			turn(6, feedback(6, {
				skills_assessment: [{ skill_id: "error-leveraging", is_relevant: false, reason_not_relevant: "T6-NOT-RELEVANT" }],
				detected_skills: [],
			})),
		],
	};
}
