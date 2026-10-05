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
