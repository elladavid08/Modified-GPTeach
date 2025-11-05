export const Constants = {
	NUM_STUDENTS: 2,
	// Either 3, 3.5, or 4
	GPT_VERSION: 4,
	GPT_SET_SCENE:
		"The user is a TA, and you are playing multiple students going to office hours with questions or problems.",
	GPT_RESPONSE_INSTRUCTIONS:
		"The students are discreet and subtle about their personalities, but still act in character. The students interact to try to help each other, though sometimes are wrong. Typically BOTH students respond to the TA in each turn, each speaking separately. Always wrap each student's message in XML tags with their exact name. Never use generic tags like 'student'.",
	// In the code version, this is in addition to the prompt that is always shown
	GPT_CODE_ADDENDUM:
		"The students and TA have a single shared code editor. The contents are shown in <CODE_EDITOR></CODE_EDITOR> tags. They will send only code within the code editor, no additional dialogue inside. Please maintain the contents of the code editor, and only make modifications based on TA requests. When students show their code, they also always send a message outside of the code editor. Always wrap each student's message with their actual name tags. Here is an example:\n TA: hi how's it going? \n <Sheila> It's going well but I'm having some difficulties with my code. </Sheila> \n <CODE_EDITOR> print(num.isdigit()) </CODE_EDITOR>",

	// Enables some shortcuts for easier development
	IS_PRODUCTION: false,

	// These paths are relative to /src/config, and omit the .js extension
	STUDENT_FILE: "students/personas",
	LEARNING_GOAL_FILE: "learning_goals/example",
	SCENARIO_FILE: "scenarios/code_scenarios",

	// Number of scenarios in the sequence
	NUM_SCENARIOS: 3,
	DEFAULT_TA_NAME: "TA",

	//FIREBASE_TOP_LEVEL_COLLECTION: "GPTeach-v2",
	OPENAI_API_KEY: process.env.REACT_APP_OPENAI_API_KEY,
	GOOGLE_API_KEY: process.env.REACT_APP_GOOGLE_API_KEY,
	
	// AI Provider: "openai" or "google"
	PROVIDER: "google",
};

// TODO: some of these should be env vars, and some should be user-changeable
