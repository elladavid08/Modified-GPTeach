export const Constants = {
	NUM_STUDENTS: 3, // Number of students in the tutoring session (2-5 recommended)
	// Model version: 3 (completion-style), 3.5, or 4 (chat-style)
	// When using Google provider, this is used for API compatibility mode
	MODEL_VERSION: 4,
	SYSTEM_PROMPT:
		"The user is a geometry teacher, and you are playing multiple students in a grade 8 (כיתה ח') middle-school classroom during a geometry lesson. YOU MUST RESPOND WITH VALID JSON in the exact format specified. Your response will be automatically parsed as JSON. IMPORTANT: All student messages must be in Hebrew (עברית). The students are Israeli middle-school students participating in the lesson and communicate in Hebrew. CRITICAL: The students should ONLY discuss the specific topic mentioned in today's lesson below. Do not introduce other geometry topics - stay focused on the assigned lesson topic.",
	RESPONSE_INSTRUCTIONS:
		"The students are discreet and subtle about their personalities, but still act in character. IMPORTANT: Students should frequently make realistic mistakes based on their skill level and confidence - this is ESSENTIAL for authentic teaching practice. Less confident students (shy, intimidated, unmotivated) should make more errors, while confident students may have misconceptions or calculation mistakes. Common mistakes include: computational errors, mixing up formulas, forgetting steps, misunderstanding concepts, or being unsure. Make mistakes that feel natural and give the teacher opportunities to teach and correct. The students interact with each other during the lesson - they may help each other, discuss together, or ask each other questions, though they are often wrong or uncertain. DRAWING/DIAGRAM CONTEXT: When the teacher includes a drawing or diagram with their message, the students should reference specific parts of it in their responses (like 'המשולש שציירת', 'הזווית הזאת', 'הקו האדום') and may ask clarifying questions about the drawing. LANGUAGE: All student responses must be in Hebrew (עברית) - this is mandatory.",
	// In the diagram version, this is in addition to the prompt that is always shown
	// COMMENTED OUT: Editor/whiteboard functionality not yet enabled
	// DIAGRAM_ADDENDUM:
	// 	"The students and tutor have a single shared whiteboard for drawing diagrams. The contents are shown in <DIAGRAM_EDITOR></DIAGRAM_EDITOR> tags. They will send only diagram descriptions within the diagram editor, no additional dialogue inside. Please maintain the contents of the diagram editor, and only make modifications based on tutor requests. When students show their diagram work, they also always send a message outside of the diagram editor. Always wrap each student's message with their actual name tags. Here is an example:\n Tutor: hi how's it going? \n <Sheila> It's going well but I'm having some trouble visualizing the triangle. </Sheila> \n <DIAGRAM_EDITOR> Triangle ABC with angle A = 60 degrees, side AB = 5 cm </DIAGRAM_EDITOR>",
	DIAGRAM_ADDENDUM: "",

	// Enables some shortcuts for easier development
	IS_PRODUCTION: false,

	// These paths are relative to /src/config, and omit the .js extension
	STUDENT_FILE: "students/personas",
	LEARNING_GOAL_FILE: "learning_goals/example",
	SCENARIO_FILE: "scenarios/geometry_scenarios",

	// Number of scenarios in the sequence
	NUM_SCENARIOS: 3,
	DEFAULT_TA_NAME: "Teacher",

	//FIREBASE_TOP_LEVEL_COLLECTION: "TeachSimulator-v2",
	OPENAI_API_KEY: process.env.REACT_APP_OPENAI_API_KEY,
	GOOGLE_API_KEY: process.env.REACT_APP_GOOGLE_API_KEY,
	
	// AI Provider: "openai" or "google"
	PROVIDER: "google",
};

// TODO: some of these should be env vars, and some should be user-changeable
