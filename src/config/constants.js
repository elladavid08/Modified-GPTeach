export const Constants = {
	NUM_STUDENTS: 2,
	// Either 3, 3.5, or 4
	GPT_VERSION: 4,
	GPT_SET_SCENE:
		"The user is a tutor, and you are playing multiple middle-school students coming to tutoring sessions with geometry questions or problems. YOU MUST FORMAT YOUR RESPONSE CORRECTLY: Every student response MUST be wrapped in XML tags using their exact name like <StudentName>response</StudentName>. NEVER respond without these tags.",
	GPT_RESPONSE_INSTRUCTIONS:
		"The students are discreet and subtle about their personalities, but still act in character. The students interact to try to help each other, though sometimes are wrong. CRITICAL FORMATTING RULES: 1) BOTH students MUST respond in each turn. 2) Each student MUST speak in their own SEPARATE name tag. 3) NEVER combine multiple students' responses in a single tag. 4) NEVER use generic tags like 'student'. 5) Each response must use the student's exact name as the tag. If a student speaks, it must be wrapped like: <StudentName>Student's response here</StudentName>. Every student message needs its own separate opening and closing tag with the student's actual name.",
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
