/**
 * System Version Configuration
 * 
 * Update this version number when making significant changes to the system:
 * - Major changes to AI prompts (student behavior, PCK analysis)
 * - UI/UX changes that affect user interaction
 * - New features or functionality
 * - Bug fixes that change behavior
 * 
 * Version Format: X.Y.Z
 * - X: Major version (breaking changes, major new features)
 * - Y: Minor version (new features, significant improvements)
 * - Z: Patch version (bug fixes, minor improvements)
 */

export const SYSTEM_VERSION = "1.3.0";

/**
 * Version History:
 * 
 * 1.3.0 (2026-05-20):
 * - PCK feedback accuracy: restructured Phase 1 into three sequential gates so
 *   closing/procedural messages are rejected before history is checked
 * - PCK Gate 0: pedagogical questions (e.g. "האם זה בהכרח נכון?") now correctly
 *   pass through as PCK moves instead of being blocked as "pure questions"
 * - PCK Gate 1: mandatory quoting step — model must cite the exact incorrect
 *   student claim before feedback can be given; correct student answers never
 *   trigger error-identification even on misconception-adjacent topics
 * - PCK Gate 1: feedback restricted to the most recent student turn only;
 *   past unaddressed errors cannot trigger retroactive feedback on later turns
 * - PCK Gate 1: multi-student turns handled correctly — an error by one student
 *   triggers feedback even if another student in the same turn was correct
 * - PCK continuity: skills_assessment now stored in feedback history; no duplicate
 *   positive praise for a skill already demonstrated on the same error; teacher
 *   following a prior suggestion is recognized and scored positively
 * - PCK anti-hallucination: evidence must come from the teacher's last message only;
 *   student ideas may not be attributed to the teacher
 * - Student deduplication: students may not repeat the same response as the previous
 *   turn; at least one student must respond per teacher message
 * 
 * 1.2.0 (2026-04-27):
 * - Student greeting behavior: students now respond only with social greetings when
 *   teacher opens with small-talk, and do not mention lesson content until teacher introduces it
 * - Student closing behavior: students now react appropriately to lesson-ending messages
 *   (brief warm farewell) instead of continuing the academic discussion
 * - PCK feedback visualization: replaced continuous colored text box with per-skill
 *   colored bullet points (green=well used, yellow=partial, purple=missing), each
 *   carrying the skill name and its evidence/suggestion text inline
 * - PCK feedback language: all feedback text now addresses the teacher directly in
 *   second person (e.g. "זיהית", "יכולת לשאול") instead of third person ("המורה")
 * - PCK feedback focus: feedback now follows the sequential skill chain (identification →
 *   characterization → diagnostic interpretation → pedagogical response → leveraging);
 *   at most 1-2 skills assessed per turn based on lifecycle stage, with strict prerequisite
 *   gating (if teacher missed skill N, skills N+1..5 are not evaluated that turn)
 * 
 * 1.1.0 (2026-03-10):
 * - Universal PCK Skills Framework (5 skills from education team)
 * - Filtered real-time feedback (only when pedagogically relevant)
 * - Adaptive summary feedback (length proportional to content)
 * - Skill-based scoring (0-1-2 rubrics) with relevance detection
 * - Bilingual AI prompts (English reasoning + Hebrew patterns)
 * - RAG-ready structure for future improvements
 * 
 * 1.0.0 (2026-03-03):
 * - Initial production version with Firebase authentication
 * - User profile collection (Hebrew fields)
 * - Automatic conversation logging to Firestore
 * - Improved student agent behavior:
 *   - Better detection of incomplete teacher messages
 *   - Multi-part instruction compliance (persona-based initial, full on second request)
 *   - Consistent knowledge tracking throughout conversation
 *   - Better handling of teacher refocus
 * - Two-agent architecture (PCK feedback agent + student agent)
 * - Protected routes requiring authentication
 */
