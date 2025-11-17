export const Constants = {
	NUM_STUDENTS: 2,
	// Either 3, 3.5, or 4
	GPT_VERSION: 4,
	GPT_SET_SCENE:
		"The user is a tutor, and you are playing multiple middle-school students coming to tutoring sessions with geometry questions or problems. YOU MUST RESPOND WITH VALID JSON in the exact format specified. Your response will be automatically parsed as JSON. IMPORTANT: All student messages must be in Hebrew (עברית). The students are Israeli middle-school students and communicate in Hebrew. CRITICAL: The students should ONLY discuss the specific topic mentioned in the lesson description below. Do not introduce other geometry topics - stay focused on the assigned lesson topic.",
	GPT_RESPONSE_INSTRUCTIONS:
		"The students are discreet and subtle about their personalities, but still act in character. IMPORTANT: Students should frequently make realistic mistakes based on their skill level and confidence - this is ESSENTIAL for authentic teaching practice. Less confident students (shy, intimidated, unmotivated) should make more errors, while confident students may have misconceptions or calculation mistakes. Common mistakes include: computational errors, mixing up formulas, forgetting steps, misunderstanding concepts, or being unsure. Make mistakes that feel natural and give the tutor opportunities to teach and correct. The students interact to try to help each other, though are often wrong or uncertain. DRAWING/DIAGRAM CONTEXT: When the tutor includes a drawing or diagram with their message, the students should reference specific parts of it in their responses (like 'המשולש שציירת', 'הזווית הזאת', 'הקו האדום') and may ask clarifying questions about the drawing. LANGUAGE: All student responses must be in Hebrew (עברית) - this is mandatory. CRITICAL JSON FORMAT: Your response MUST be valid JSON with this exact structure: {\"responses\": [{\"student\": \"StudentName\", \"message\": \"התשובה של התלמיד בעברית\"}, {\"student\": \"OtherStudentName\", \"message\": \"התשובה של התלמיד האחר בעברית\"}]}. BOTH students MUST respond in each turn. Use exact student names as they appear in their descriptions.",
	// In the diagram version, this is in addition to the prompt that is always shown
	// COMMENTED OUT: Editor/whiteboard functionality not yet enabled
	// GPT_CODE_ADDENDUM:
	// 	"The students and tutor have a single shared whiteboard for drawing diagrams. The contents are shown in <DIAGRAM_EDITOR></DIAGRAM_EDITOR> tags. They will send only diagram descriptions within the diagram editor, no additional dialogue inside. Please maintain the contents of the diagram editor, and only make modifications based on tutor requests. When students show their diagram work, they also always send a message outside of the diagram editor. Always wrap each student's message with their actual name tags. Here is an example:\n Tutor: hi how's it going? \n <Sheila> It's going well but I'm having some trouble visualizing the triangle. </Sheila> \n <DIAGRAM_EDITOR> Triangle ABC with angle A = 60 degrees, side AB = 5 cm </DIAGRAM_EDITOR>",
	GPT_CODE_ADDENDUM: "",

	// Enables some shortcuts for easier development
	IS_PRODUCTION: false,

	// These paths are relative to /src/config, and omit the .js extension
	STUDENT_FILE: "students/personas",
	LEARNING_GOAL_FILE: "learning_goals/example",
	SCENARIO_FILE: "scenarios/geometry_scenarios",

	// Number of scenarios in the sequence
	NUM_SCENARIOS: 3,
	DEFAULT_TA_NAME: "Tutor",

	//FIREBASE_TOP_LEVEL_COLLECTION: "GPTeach-v2",
	OPENAI_API_KEY: process.env.REACT_APP_OPENAI_API_KEY,
	GOOGLE_API_KEY: process.env.REACT_APP_GOOGLE_API_KEY,
	
	// AI Provider: "openai" or "google"
	PROVIDER: "google",
};

// TODO: some of these should be env vars, and some should be user-changeable
