import ChatMessage from "../objects/ChatMessage";
import { Constants } from "../config/constants";
import { toTitleCase } from "./primitiveManipulation";
import { generateWithGenAI, generateWithGenAICompletion } from "../services/genai";
import { formatTaxonomyForPrompt } from "../config/pck/pck_taxonomy.js";

// ==================== OpenAI Configuration (COMMENTED OUT - Currently using Google Vertex AI) ====================
// Kept for potential future use if switching back to OpenAI
// const { Configuration, OpenAIApi } = require("openai");
// 
// const configuration = new Configuration({
// 	apiKey: process.env.REACT_APP_OPENAI_API_KEY,
// });
// const openai = new OpenAIApi(configuration);
// ==================== End OpenAI Configuration ====================

// ==================== AI Model Information ====================
// Currently using: Google Vertex AI (Gemini 2.5 Flash Lite)
// This module supports multiple AI providers through a unified interface
// OpenAI models (GPT-3, GPT-3.5, GPT-4) are commented out but preserved for future use
// ==================== End AI Model Information ====================

/** Main AI call function - routes to appropriate model based on configuration */
export default async function callAI(
	history,
	students,
	scenario,
	addendum = "",
	impact_analysis = null,
	onResponse
) {
	const verNum = Constants.MODEL_VERSION;
	if (verNum === 3) {
		callCompletionModel(history, students, scenario, addendum, impact_analysis, onResponse);
	} else if (verNum === 3.5) {
		callChatModel(
			"gpt-3.5-turbo",
			history,
			students,
			scenario,
			addendum,
			impact_analysis,
			onResponse
		);
	} else {
		// Default to 4 (or Gemini equivalent when using Google provider)
		callChatModel("gpt-4", history, students, scenario, addendum, impact_analysis, onResponse);
	}
}

async function callCompletionModel(history, students, scenario, addendum, impact_analysis, onResponse) {
	const myPrompt =
		makeProsePrompt(students, scenario, addendum, impact_analysis) +
		makeHTMLTags(students) +
		"\n\n" +
		history.toString();
	console.log("Calling Completion Model... \n\n" + myPrompt);

	if (Constants.PROVIDER === "google") {
		// Use Google's Vertex AI GenAI for completion-style prompts
		try {
			const response = await generateWithGenAICompletion(myPrompt, {
				temperature: 0.7,
				max_tokens: 256,
				top_p: 1,
				stop: ["Teacher: "],
			});
			
			if (response) {
				onResponse(convertResponseToMessages(response, null, students));
			} else {
				console.log("didn't get a response....");
				onResponse(new ChatMessage("", "... I don't understand?"));
			}
		} catch (err) {
			console.log(`Error from GenAI completion: ${err}`);
			onResponse(new ChatMessage("", "... I don't understand?"));
		}
	} else {
		// ==================== OpenAI Completion API (COMMENTED OUT - Currently using Google Vertex AI) ====================
		// Kept for potential future use if switching back to OpenAI
		// await openai
		// 	.createCompletion({
		// 		model: "text-davinci-003",
		// 		prompt: myPrompt,
		// 		temperature: 0.7,
		// 		max_tokens: 256,
		// 		top_p: 1,
		// 		frequency_penalty: 0,
		// 		presence_penalty: 0,
		// 		stop: ["Tutor: "],
		// 	})
		// 	.then((response) => {
		// 		if (response.data.choices[0].text) {
		// 			onResponse(convertResponseToMessages(response.data.choices[0].text, null, students));
		// 		} else {
		// 			console.log("didn't get a response....");
		// 			onResponse(new ChatMessage("", "... I don't understand?"));
		// 		}
		// 	});
		// ==================== End OpenAI Completion API ====================
		console.error("OpenAI provider is currently disabled. Please use 'google' provider.");
		onResponse(new ChatMessage("", "... I don't understand?"));
	}
}

/** Chat-style models (GPT 3.5/4 or Gemini) use the same API pattern, just different model names */
async function callChatModel(
	model,
	history,
	students,
	scenario,
	addendum,
	impact_analysis,
	onResponse
) {
	const myPrompt = [
		{
			// TODO: move the code instructions somewhere else
			content: makeProsePrompt(students, scenario, addendum, impact_analysis),
			role: "system",
		},
		...history.toAIformat(),
	];

	console.log(`🤖 Calling AI model (${Constants.PROVIDER}) with ${myPrompt.length} messages in history`);
	
	// Calculate approximate token count (rough estimate: 1 token ≈ 4 chars)
	const totalChars = myPrompt.reduce((sum, m) => {
		if (!m.content) return sum;
		if (typeof m.content === 'string') return sum + m.content.length;
		// For array content, sum up text parts only
		if (Array.isArray(m.content)) {
			const textLength = m.content
				.filter(p => p.text)
				.reduce((len, p) => len + p.text.length, 0);
			return sum + textLength;
		}
		return sum;
	}, 0);
	console.log(`📏 Estimated prompt size: ${totalChars} chars (~${Math.ceil(totalChars / 4)} tokens)`);
	
	if (!Constants.IS_PRODUCTION) {
		console.log(
			`Full prompt:\n` +
				myPrompt
					.map((m) => {
						let preview = '';
						if (m.content) {
							// Handle both string and array content (multimodal)
							if (typeof m.content === 'string') {
								preview = m.content.substring(0, 200);
							} else if (Array.isArray(m.content)) {
								// For array content, show text parts and indicate if image is present
								const textParts = m.content.filter(p => p.text).map(p => p.text).join(' ');
								const hasImage = m.content.some(p => p.inline_data);
								preview = textParts.substring(0, 200) + (hasImage ? ' [+image]' : '');
							}
						}
						return `${m.role}: ${preview}...`;
					})
					.join("\n")
		);
	}

	try {
		if (Constants.PROVIDER === "google") {
			// Use Google's Vertex AI GenAI
			const msg = await generateWithGenAI(myPrompt, { stop: ["Teacher:"] });
			
			if (!Constants.IS_PRODUCTION) {
				console.log(`GenAI Response: \n${msg}`);
			}

		// Log the full raw response for debugging
		console.log("📝 Raw AI Response (JSON):");
		console.log(msg);
		console.log("📝 End of raw response");
		
		// Validate JSON structure
		try {
			const jsonCheck = JSON.parse(msg);
			if (jsonCheck.responses && Array.isArray(jsonCheck.responses)) {
				console.log(`✅ Valid JSON with ${jsonCheck.responses.length} response(s)`);
				jsonCheck.responses.forEach((resp, idx) => {
					console.log(`  Response ${idx + 1}: ${resp.student}`);
				});
			} else {
				console.warn("⚠️ JSON is valid but missing 'responses' array!");
			}
		} catch (e) {
			console.error("⚠️ Response is not valid JSON:", e.message);
		}

			// Parse out any code (NOTE: Editor functionality currently disabled - AI not instructed to use this)
			if (msg.includes("<CODE_EDITOR>")) {
				const {messages, codePieces} = parseCodeVersion(msg, students);
				const msgCount = messages ? messages.length : 0;
				const codeCount = codePieces ? codePieces.length : 0;
				console.log(`✅ Parsed ${msgCount} message(s) and ${codeCount} code piece(s)`);
				onResponse(messages, codePieces);
			} else {
				const parsedMessages = convertResponseToMessages(msg, null, students);
				const msgCount = parsedMessages ? parsedMessages.length : 0;
				console.log(`✅ Parsed ${msgCount} message(s) from response`);
				onResponse(parsedMessages, null, students);
			}
		} else {
			// ==================== OpenAI Chat API (COMMENTED OUT - Currently using Google Vertex AI) ====================
			// Kept for potential future use if switching back to OpenAI
			// await openai
			// 	.createChatCompletion({
			// 		model: model,
			// 		messages: myPrompt,
			// 		stop: ["Tutor:"],
			// 	})
			// 	.then((response) => {
			// 		const msg = response.data.choices[0].message.content;
			// 		if (!Constants.IS_PRODUCTION) {
			// 			console.log(`GPT Response: \n${msg}`);
			// 		}
			//
			// 		// Parse out any code (NOTE: Editor functionality currently disabled - AI not instructed to use this)
			// 		if (msg.includes("<CODE_EDITOR>")) {
			// 			const {messages, codePieces} = parseCodeVersion(msg, students);
			// 			onResponse(messages, codePieces);
			// 		} else {
			// 			onResponse(convertResponseToMessages(msg), null, students);
			// 		}
			// 	});
			// ==================== End OpenAI Chat API ====================
			console.error("OpenAI provider is currently disabled. Please use 'google' provider.");
		}
	} catch (err) {
		console.error(`❌ Error from ${Constants.PROVIDER === "google" ? "GenAI" : "AI"}:`, err);
		// Call onResponse with empty array to unblock the UI
		onResponse([], null);
		return;
	}
}

/// Helper Functions

function convertResponseToMessages(aiResponse, fromCode, students) {
	let newMessages = [];

	console.log("convertResponseToMessages called (JSON mode with Chain-of-Thought)");
	console.log("  aiResponse:", aiResponse ? aiResponse.length + " chars" : "null/undefined");
	console.log("  fromCode:", fromCode);
	console.log("  students:", students ? students.length : "null/undefined");

	if (!aiResponse || aiResponse.trim().length === 0) {
		console.log("Empty or null aiResponse");
		if (fromCode) {
			console.log("  fromCode is truthy, returning default message");
			const studentName = students && students[0] ? students[0].name : 'Student';
			newMessages.push(new ChatMessage(studentName, "Here it!", "assistant"))
			return newMessages;
		}
		console.log("  fromCode is falsy, returning empty array instead of null");
		return [];
	}

	try {
		const jsonData = JSON.parse(aiResponse);
		
		// Log the entire JSON structure for debugging
		console.log("🔍 FULL AI RESPONSE STRUCTURE:", JSON.stringify(jsonData, null, 2));
		
		if (jsonData.thinking) {
			console.log("Agent Chain-of-Thought Reasoning:");
			console.log("  Teacher message:", jsonData.thinking.teacher_message_summary || "N/A");
			console.log("  Context analysis:", jsonData.thinking.context_analysis || "N/A");
			
			if (jsonData.thinking.who_should_respond && Array.isArray(jsonData.thinking.who_should_respond)) {
				console.log("  Decision breakdown:");
				jsonData.thinking.who_should_respond.forEach(decision => {
					const emoji = decision.should_respond ? "YES" : "NO";
					const confEmoji = decision.confidence === "high" ? "HIGH" : decision.confidence === "medium" ? "MED" : "LOW";
					console.log("    " + emoji + " " + confEmoji + " " + decision.student + ": " + decision.reason + " [" + decision.confidence + "]");
				});
			}
			
			if (jsonData.thinking.pck_analysis) {
				console.log("  PCK analysis:", jsonData.thinking.pck_analysis);
			}
		} else {
			console.warn("No 'thinking' field in response - Chain-of-Thought may not be working");
		}
		
		// NOTE: PCK feedback is now generated BEFORE student responses in a separate API call
		// Students react based on the impact_analysis provided in the prompt
		// No need to extract PCK feedback from student agent response
		
		if (!jsonData.responses || !Array.isArray(jsonData.responses)) {
			throw new Error("Invalid JSON structure: missing 'responses' array");
		}
		
		const responseCount = jsonData.responses.length;
		console.log("Number of student responses: " + responseCount);
		
		if (responseCount === 0) {
			console.log("No student responses this turn (silence is natural - students thinking)");
			return [];
		}
		
		if (responseCount > students.length) {
			console.warn("Too many responses: " + responseCount + " for " + students.length + " students");
		}
		
		for (const response of jsonData.responses) {
			if (!response.student || !response.message) {
				console.warn("Skipping invalid response entry:", response);
				continue;
			}
			
			const studentName = toTitleCase(response.student);
			const message = response.message.trim();
			
			newMessages.push(new ChatMessage(studentName, message, "assistant"));
			console.log("Student responded: " + studentName);
		}
		
		console.log("Returning " + newMessages.length + " message(s) from convertResponseToMessages");
		return newMessages;
		
	} catch (error) {
		console.error("Error parsing JSON response:", error);
		console.error("Raw response:", aiResponse);
		
		const randomStudent = students[Math.floor(Math.random() * students.length)];
		newMessages.push(new ChatMessage(
			randomStudent.name, 
			"אני צריך רגע לחשוב על זה...", 
			"assistant"
		));
		return newMessages;
	}
}

/** Turn the information into a paragraph */
function makeProsePrompt(students, scenario, addendum, impact_analysis = null) {
	let retStr = "";
	
	// START WITH FORMATTING REQUIREMENTS - MOST CRITICAL
	const studentNames = students.map(s => s.name).join(", ");
	const studentList = students.map((s, idx) => `${idx + 1}. ${s.name}`).join('\n');
	
	retStr += `\n\n========================================`;
	retStr += `\n🚨 MANDATORY JSON FORMAT - NO EXCEPTIONS 🚨`;
	retStr += `\n========================================`;
	retStr += `\nThe students in this conversation are:\n${studentList}`;
	retStr += `\n\nYou MUST respond with valid JSON in this exact format.`;
	retStr += `\nFORMAT REQUIREMENTS (YOU WILL BE PENALIZED FOR VIOLATIONS):`;
	retStr += `\n1. Each student MUST have their OWN separate object in the responses array`;
	retStr += `\n2. NEVER write text outside the JSON structure`;
	retStr += `\n3. NEVER combine students under one response object`;
	retStr += `\n4. Use exact student names as shown in the descriptions`;
	retStr += `\n5. INCLUDE the "thinking" field with your analysis`;
	retStr += `\n6. INCLUDE the "pck_feedback" field with pedagogical analysis`;
	
	// PCK ANALYSIS INSTRUCTIONS
	retStr += `\n\n📚 PCK ANALYSIS REQUIREMENTS:`;
	retStr += `\nYou are also a PCK (Pedagogical Content Knowledge) expert analyzing the teacher's response.`;
	retStr += `\nFor EVERY teacher message, you MUST analyze:`;
	retStr += `\n1. Which PCK skills were demonstrated (if any)`;
	retStr += `\n2. Which opportunities were missed (if any)`;
	retStr += `\n3. Provide brief, encouraging Hebrew feedback`;
	
	// Simplified PCK guidance (taxonomy temporarily removed to reduce prompt length)
	retStr += `\n\n### PCK Analysis Guidelines:\n`;
	retStr += `\nAnalyze the teacher's message and provide brief Hebrew feedback about their pedagogical approach.`;
	retStr += `\nFocus on: question quality, misconception handling, explanation clarity.`;
	console.log("📚 PCK Guidance added (simplified version)");
	// const taxonomyText = formatTaxonomyForPrompt();
	// console.log("📚 PCK Taxonomy loaded for prompt:", taxonomyText.length, "characters");
	// retStr += taxonomyText;
	
	// Simplified scenario context
	retStr += `\n### Current Lesson Focus:`;
	if (scenario.misconception_focus) {
		retStr += `\nMisconception to watch for: ${scenario.misconception_focus}`;
	}
	
	// Natural conversation flow instructions
	retStr += `\n\n🎭 NATURAL CONVERSATION FLOW (CRITICAL):`;
	retStr += `\n- NOT ALL students must respond to every teacher message`;
	retStr += `\n- Students respond when:`;
	retStr += `\n  • They are directly addressed by the teacher`;
	retStr += `\n  • They have a question or confusion`;
	retStr += `\n  • They want to build on what was said`;
	retStr += `\n  • They disagree or have different thinking`;
	retStr += `\n- Students DON'T respond when:`;
	retStr += `\n  • They have nothing new to add`;
	retStr += `\n  • The teacher is clearly talking to another student`;
	retStr += `\n  • They're still thinking/processing`;
	retStr += `\n- Number of responses can be: 0, 1, 2, or more students`;
	retStr += `\n- Responses should feel natural, not forced`;
	
	// Chain-of-Thought instructions
	retStr += `\n\n🧠 DECISION PROCESS (MUST INCLUDE IN OUTPUT):`;
	retStr += `\nBefore generating responses, analyze:`;
	retStr += `\nSTEP 1: Summarize teacher's LATEST message briefly`;
	retStr += `\nSTEP 2: Analyze context - What question or topic is the teacher addressing? Did the teacher answer a previous student question?`;
	retStr += `\nSTEP 3: For EACH student (${studentNames}), decide:`;
	retStr += `\n  - Should they respond? (true/false)`;
	retStr += `\n  - Why or why not? (be specific)`;
	retStr += `\n  - If they asked a question before, did the teacher answer it? If YES, they should acknowledge the answer, NOT repeat the question!`;
	retStr += `\n  - Confidence level (high/medium/low)`;
	retStr += `\nSTEP 4: Generate responses ONLY for students who should respond (high/medium confidence)`;
	
	// NOTE: Impact analysis is now injected earlier in the prompt (lines 571-628)
	// The PCK expert's analysis guides student reactions through the impact_analysis parameter
	
	retStr += `\n\n⚠️ CRITICAL CONVERSATION RULES - RESPONDING TO TEACHER'S EXPLANATIONS:`;
	retStr += `\n- Students MUST react to the teacher's explanation - they cannot ignore it or repeat the same question`;
	retStr += `\n- The response should be AUTHENTIC based on the quality of the teacher's explanation:`;
	retStr += `\n`;
	retStr += `\n  📗 If the explanation WAS GOOD and the student understood:`;
	retStr += `\n     - Show understanding: "אה עכשיו הבנתי!", "אוקיי זה הגיוני", "נכון, אז..."`;
	retStr += `\n     - Demonstrate understanding by applying it: "אז זה אומר שגם מלבן הוא...", "רגע אז אם..."`;
	retStr += `\n     - Ask a DIFFERENT, DEEPER follow-up question that builds on the answer`;
	retStr += `\n`;
	retStr += `\n  📘 If the explanation was UNCLEAR or the student is STILL CONFUSED:`;
	retStr += `\n     - Be honest: "רגע, אני עדיין לא מבין", "אני לא בטוח שהבנתי", "זה עדיין לא ברור לי"`;
	retStr += `\n     - Ask for clarification on a SPECIFIC PART: "מה זה אומר ש...?", "למה דווקא...?"`;
	retStr += `\n     - Show what PART they didn't understand, not the whole question again`;
	retStr += `\n`;
	retStr += `\n  📙 If the student THINKS they understood but actually DIDN'T (misconception):`;
	retStr += `\n     - Show confident but WRONG understanding: "אה, אז כל מרובע עם אלכסונים מאונכים זה מעויין!"`;
	retStr += `\n     - Apply the concept incorrectly to show the misunderstanding`;
	retStr += `\n     - This gives the teacher opportunity to identify and correct the misconception`;
	retStr += `\n`;
	retStr += `\n- NEVER repeat the exact same question - always show you're engaging with what the teacher said`;
	retStr += `\n- Show natural conversation progression: question → answer → reaction (understood/confused/misunderstood) → next step`;
	retStr += `\n- React to what the teacher JUST SAID, not what was said 2-3 turns ago`;
	
	// Provide clear examples
	retStr += `\n\n✅ CORRECT EXAMPLES - Different authentic responses:`;
	retStr += `\n`;
	retStr += `\nEXAMPLE 1 - Student understood the explanation:`;
	retStr += `\n{`;
	retStr += `\n  "thinking": {`;
	retStr += `\n    "teacher_message_summary": "המורה הסביר שריבוע הוא מקרה מיוחד של מלבן",`;
	retStr += `\n    "context_analysis": "${students[0].name} שאלה האם ריבוע זה מלבן, המורה נתן הסבר טוב",`;
	retStr += `\n    "who_should_respond": [{"student": "${students[0].name}", "should_respond": true, "reason": "קיבלה הסבר טוב, צריכה להראות הבנה", "confidence": "high"}]`;
	retStr += `\n  },`;
	retStr += `\n  "responses": [{"student": "${students[0].name}", "message": "אה עכשיו הבנתי! אז כל ריבוע הוא גם מלבן כי יש לו 4 זוויות ישרות?"}],`;
	retStr += `\n  "teacher_feedback": "כל הכבוד! הסבר מצוין"`;
	retStr += `\n}`;
	retStr += `\n`;
	retStr += `\nEXAMPLE 2 - Student still confused after explanation:`;
	retStr += `\n{`;
	retStr += `\n  "thinking": {`;
	retStr += `\n    "teacher_message_summary": "המורה הסביר על אלכסונים מאונכים במעויין",`;
	retStr += `\n    "context_analysis": "${students[1].name} שאל למה אלכסונים מאונכים, ההסבר היה מורכב ולא ברור לו",`;
	retStr += `\n    "who_should_respond": [{"student": "${students[1].name}", "should_respond": true, "reason": "עדיין מבולבל אחרי ההסבר", "confidence": "high"}]`;
	retStr += `\n  },`;
	retStr += `\n  "responses": [{"student": "${students[1].name}", "message": "רגע, אני עדיין לא מבין למה דווקא במעויין האלכסונים מאונכים. מה המיוחד במעויין?"}],`;
	retStr += `\n  "teacher_feedback": "התלמיד עדיין מבולבל - כדאי להבהיר"`;
	retStr += `\n}`;
	retStr += `\n`;
	retStr += `\nEXAMPLE 3 - Student THINKS understood but has misconception:`;
	retStr += `\n{`;
	retStr += `\n  "thinking": {`;
	retStr += `\n    "teacher_message_summary": "המורה הסביר שבמעויין האלכסונים מאונכים",`;
	retStr += `\n    "context_analysis": "${students[2].name} הקשיב, אבל הוא יכול לטעות ולחשוב שזה עובד גם בכיוון ההפוך",`;
	retStr += `\n    "who_should_respond": [{"student": "${students[2].name}", "should_respond": true, "reason": "יכול להראות תפיסה שגויה", "confidence": "medium"}]`;
	retStr += `\n  },`;
	retStr += `\n  "responses": [{"student": "${students[2].name}", "message": "אוקיי, אז אם אני רואה מרובע שהאלכסונים שלו מאונכים, אני יודע שזה מעויין, נכון?"}],`;
	retStr += `\n  "teacher_feedback": "שים לב - תפיסה שגויה! הזדמנות לטיפול"`;
	retStr += `\n}`;
	retStr += `\n`;
	retStr += `\n❌ WRONG - Repeating question without acknowledging answer:`;
	retStr += `\n{`;
	retStr += `\n  "responses": [{"student": "${students[0].name}", "message": "אבל ריבוע זה מלבן?"}],`;
	retStr += `\n  "teacher_feedback": "המשך כך!"`;
	retStr += `\n}`;
	retStr += `\n(Student already asked this! Teacher answered! Must acknowledge the answer, not repeat question!)`;
	
	retStr += `\n\n❌ WRONG - Not using JSON format:`;
	retStr += `\n"אוקיי, אז אם אנחנו מכפילים את שניהם... ההיקף החדש הוא 28..."`;
	retStr += `\n(This is not JSON - ALWAYS USE THE JSON FORMAT ABOVE!)`;
	retStr += `\n\n========================================\n\n`;
	
	// Now add the scene setting
	retStr += Constants.SYSTEM_PROMPT;
	retStr += "\n\n📚 THIS WEEK'S LESSON TOPIC (MANDATORY - students must stay on this topic):\n";
	retStr += scenario["text"] + "\n";
	
	// Add conversation initiation context
	if (scenario.initiated_by) {
		if (scenario.initiated_by === "teacher") {
			retStr += "\n\n🎓 LESSON CONTEXT:\n";
			retStr += "The TEACHER is leading this lesson. The teacher has started the conversation.\n";
			retStr += "Students should respond naturally to what the teacher says or asks.\n";
			retStr += "Students are in 'receiving mode' - answering questions, asking for clarification, or engaging with the teacher's topic.\n";
			if (scenario.lesson_goals) {
				// Handle both array and string formats
				const goalsText = Array.isArray(scenario.lesson_goals) 
					? scenario.lesson_goals.join("; ") 
					: scenario.lesson_goals;
				retStr += `\nThe teacher's goals for this lesson are:\n${goalsText}\n`;
			}
		} else if (scenario.initiated_by === "students") {
			retStr += "\n\n🎓 LESSON CONTEXT:\n";
			retStr += "The STUDENTS are initiating this conversation. Students have questions or confusion about today's topic.\n";
			retStr += "When this conversation starts, ONE or TWO students should present their question or problem to the teacher.\n";
			retStr += "The third student can join after the teacher responds. Don't have all students speak at once.\n";
			if (scenario.initial_prompt) {
				retStr += `Context: ${scenario.initial_prompt}\n`;
			}
		}
	}
	
	// Add misconception focus if specified
	if (scenario.misconception_focus) {
		retStr += "\n\n🎯 TARGETED MISCONCEPTION FOR THIS LESSON:\n";
		retStr += scenario.misconception_focus + "\n";
		retStr += "\n⚠️ MISCONCEPTION LIFECYCLE (IMPORTANT):\n";
		retStr += "**Phase 1 - Initial Expression**: ONE or TWO students should naturally express this misconception early in the conversation\n";
		retStr += "  - Choose student(s) based on their cognitive profile and the type of misconception\n";
		retStr += "  - Present it authentically as genuine thinking, not as deliberate error\n";
		retStr += "  - The student should seem confident or uncertain based on their personality\n\n";
		retStr += "**Phase 2 - Resolution**: Once the teacher addresses the misconception well:\n";
		retStr += "  - If teacher's explanation is clear and addresses the core issue → student should show UNDERSTANDING\n";
		retStr += "  - If teacher's explanation is vague or incomplete → student may remain confused\n";
		retStr += "  - If teacher uses counterexample or checks definition → student should engage with that\n";
		retStr += "  - DO NOT keep repeating the same misconception after teacher addressed it properly!\n\n";
		retStr += "**Natural Progression**: misconception expressed → teacher addresses → student reaction (understood/still confused/new question) → conversation moves forward\n";
	}
	
	// Add target PCK skills if specified (for AI context awareness)
	if (scenario.target_pck_skills && scenario.target_pck_skills.length > 0) {
		retStr += "\n\n📋 PCK SKILLS BEING ASSESSED IN THIS SCENARIO:\n";
		retStr += `This scenario is designed to elicit teacher responses related to: ${scenario.target_pck_skills.join(", ")}\n`;
		retStr += "The students' misconceptions and questions should create opportunities for the teacher to demonstrate these skills.\n";
	}
	
	// Add PCK impact analysis if available (NEW: from PCK expert agent)
	if (impact_analysis) {
		retStr += "\n\n" + "=".repeat(80) + "\n";
		retStr += "🎯🎯🎯 CRITICAL: PCK EXPERT ANALYSIS - THIS OVERRIDES ALL OTHER INSTRUCTIONS 🎯🎯🎯\n";
		retStr += "=".repeat(80) + "\n";
		retStr += "A PCK expert has analyzed the teacher's last instructional move.\n";
		retStr += "⚠️ THE FOLLOWING ANALYSIS TAKES PRIORITY OVER SCENARIO MISCONCEPTION INSTRUCTIONS!\n";
		retStr += "⚠️ Student reactions MUST reflect the pedagogical quality determined by the expert!\n\n";
		
		retStr += `**Overall Pedagogical Quality**: ${impact_analysis.pedagogical_quality}\n`;
		
		if (impact_analysis.addressed_misconception !== undefined) {
			retStr += `**Misconception ${impact_analysis.addressed_misconception ? 'WAS' : 'WAS NOT'} Addressed**: ${impact_analysis.how_addressed || ''}\n`;
		}
		
		retStr += `**Misconception Risk Level**: ${impact_analysis.misconception_risk || 'medium'}\n\n`;
		
		if (impact_analysis.demonstrated_skills && impact_analysis.demonstrated_skills.length > 0) {
			retStr += "**PCK Skills Demonstrated**:\n";
			impact_analysis.demonstrated_skills.forEach(skill => {
				retStr += `- ${skill.skill_id}: ${skill.evidence}\n`;
			});
			retStr += "\n";
		}
		
		if (impact_analysis.missed_opportunities && impact_analysis.missed_opportunities.length > 0) {
			retStr += "**Missed Opportunities**:\n";
			impact_analysis.missed_opportunities.forEach(opp => {
				retStr += `- ${opp.skill_id}: ${opp.what_could_have_been_done}\n`;
			});
			retStr += "\n";
		}
		
		if (impact_analysis.predicted_student_state) {
			retStr += "**🚨 PREDICTED STUDENT STATE - FOLLOW THESE INSTRUCTIONS 🚨**:\n";
			const state = impact_analysis.predicted_student_state;
			
			retStr += `- Understanding level: ${state.understanding_level}\n`;
			
			if (state.who_should_respond && state.who_should_respond.length > 0) {
				retStr += `- Who should respond: ${state.who_should_respond.join(", ")}\n`;
			}
			
			retStr += `- Response tone: ${state.response_tone}\n`;
			
			if (state.likely_reactions && state.likely_reactions.length > 0) {
				retStr += `- Likely reactions:\n`;
				state.likely_reactions.forEach(reaction => {
					retStr += `  • ${reaction}\n`;
				});
			}
			retStr += "\n";
		}
		
		retStr += "⚠️ **MANDATORY ALIGNMENT RULES** (NON-NEGOTIABLE):\n\n";
		retStr += "**If pedagogical_quality = 'positive':**\n";
		retStr += "  → Students MUST show understanding progress\n";
		retStr += "  → Use expressions like: 'אה עכשיו הבנתי!', 'אז זה אומר ש...', 'נכון, אז...'\n";
		retStr += "  → Students should be able to apply or demonstrate what they learned\n";
		retStr += "  → DO NOT keep asking the same question - show you understood the answer!\n";
		retStr += "  → Conversation should move forward to next topic or deeper question\n\n";
		retStr += "**If pedagogical_quality = 'problematic':**\n";
		retStr += "  → Students should show confusion or persist in misconception\n";
		retStr += "  → Use expressions like: 'אני עדיין לא מבין', 'רגע, אז...', 'למה?'\n\n";
		retStr += "**If pedagogical_quality = 'neutral':**\n";
		retStr += "  → Students make modest progress or stay similar\n";
		retStr += "  → Partial understanding with follow-up questions\n\n";
		retStr += "**Additional Rules:**\n";
		retStr += "- Follow the 'who_should_respond' guidance from the PCK expert\n";
		retStr += "- Match the 'response_tone' predicted by the PCK expert\n";
		retStr += "- Use the 'likely_reactions' as guidance for what students might say\n";
		retStr += "- If understanding_level = 'improved' → MUST show improvement, not repeat confusion\n";
		retStr += "- If understanding_level = 'more_confused' → MUST show confusion\n";
		retStr += "- If addressed_misconception = true → student should acknowledge the clarification\n\n";
	}
	
	// Add conversation flow instructions
	retStr += "\n\n💬 CONVERSATION BUILDING GUIDELINES:\n";
	retStr += "- Students can build on each other's comments (using: 'נכון', 'וגם', 'אז', 'רגע')\n";
	retStr += "- Students can introduce independent points when relevant\n";
	retStr += "- Create natural discussion flow - not everyone needs to speak every turn\n";
	retStr += "- ALWAYS address the teacher directly in second person (אתה/את, אמרת, שאלת)\n";
	retStr += "- NEVER refer to the teacher in third person (המורה, המורה אמרה)\n";
	retStr += "- Use SIMPLE, NATURAL Hebrew like real 13-14 year old Israelis\n";
	retStr += "- Keep sentences SHORT and CASUAL - avoid formal academic language\n";
	retStr += "- Use everyday expressions: 'רגע', 'אז', 'אבל', 'אה', 'טוב', 'אוקיי', 'למה'\n\n";
	retStr += "🚫 AVOID CONVERSATION LOOPS:\n";
	retStr += "- DO NOT repeat the same question after teacher answered it clearly\n";
	retStr += "- DO NOT stay stuck on the same confusion if teacher explained well\n";
	retStr += "- If you asked something and teacher explained → show you engaged with the explanation\n";
	retStr += "- Conversation should progress: question → explanation → reaction → new topic/deeper question\n";
	retStr += "- Real students don't endlessly repeat the same confusion after good teaching!\n";

	// Students is an array of student objects, each with a 'name' property
	retStr += `\n\n👥 STUDENT PERSONAS:\n`;
	retStr += `Each student has structured behavioral fields. Use these to inform responses:\n`;
	students.forEach((student) => {
		retStr += "\n" + student.description;
		
		// Add structured fields if available
		if (student.participation) {
			retStr += `\n  • Participation: baseline=${student.participation.baseline}`;
			retStr += `, speaks_when=[${student.participation.speaks_when.join(", ")}]`;
			retStr += `, avoids_when=[${student.participation.avoids_when.join(", ")}]`;
		}
		if (student.reasoning_style) {
			retStr += `\n  • Reasoning style: [${student.reasoning_style.join(", ")}]`;
		}
		if (student.misconception_tendencies) {
			retStr += `\n  • Misconception tendencies: [${student.misconception_tendencies.join(", ")}]`;
		}
		if (student.update_response) {
			retStr += `\n  • Update response: after_good_scaffold="${student.update_response.after_good_scaffold}"`;
			retStr += `, after_counterexample="${student.update_response.after_counterexample}"`;
		}
		if (student.escalation_if_confused) {
			retStr += `\n  • Escalation if confused: ${student.escalation_if_confused}`;
		}
		retStr += `\n`;
	});
	
	retStr += `\n\n💡 USING PERSONA FIELDS WITH PCK ANALYSIS:`;
	retStr += `\n- Match student's update_response to the impact_analysis understanding_level`;
	retStr += `\n- If understanding_level = "improved" → use student's "after_good_scaffold" behavior`;
	retStr += `\n- If understanding_level = "more_confused" → use student's "escalation_if_confused" behavior`;
	retStr += `\n- If misconception_risk is "high" → choose student with matching misconception_tendencies`;
	retStr += `\n- Respect each student's participation baseline and speaks_when/avoids_when conditions`;
	retStr += `\n- Follow the PCK expert's "who_should_respond" guidance strictly\n`;

	retStr +=
		"\n\n" + Constants.RESPONSE_INSTRUCTIONS + "\n" + addendum;
	
	// NOTE: Teacher feedback is now generated by a separate PCK expert agent BEFORE student responses
	// Students simply respond based on the impact_analysis provided above
	// No need for students to generate their own PCK feedback

	return retStr;
}

/** Create the HTML-esque tags that recap the conversation for completion-style models */
function makeHTMLTags(students) {
	let retStr = `<span context="middle-school-geometry"`;

	// Students is an array of student objects
	students.forEach((student) => {
		retStr += ` action="${student.name}-participates-in-lesson"`;
	});

	students.forEach((student) => {
		let tmp = "";
		student.keywords.forEach((keyword) => {
			tmp += keyword + "-";
		});
		retStr += ` personality="${student.name}-${tmp.slice(0, -1)}"`;
	});

	return retStr + ">";
}

/** Separate code and chat 
 * NOTE: Editor functionality currently disabled - AI not instructed to use CODE_EDITOR tags
 */
function parseCodeVersion(aiResponse, students) {
	// See https://regex101.com/r/YYx6pP/4
	console.log("🔧 parseCodeVersion called");
	console.log("Input length:", aiResponse.length);
	
	let matches = aiResponse.match(/<CODE_EDITOR>([^<]*)<\/CODE_EDITOR>/gm);
	let codePieces = [];
	let fromCode = "yes"

	if (matches) {
		console.log(`Found ${matches.length} CODE_EDITOR block(s)`);
		matches.forEach((match) => {
			// Pull out the code
			const codeContent = match.replace("<CODE_EDITOR>", "").replace("</CODE_EDITOR>", "").trim();
			codePieces.push(codeContent);
			console.log(`Code piece length: ${codeContent.length}`);
			// Remove the match from the aiResponse, so it is as if it was the plain chat version
			aiResponse = aiResponse.replace(match, "");
		});
	}

	console.log("Text remaining after removing CODE_EDITOR:", aiResponse.trim().length, "chars");
	console.log("Text preview:", aiResponse.trim().substring(0, 200));

	let messages = convertResponseToMessages(aiResponse, fromCode, students);
	
	console.log(`✅ parseCodeVersion returning ${messages ? messages.length : 0} message(s) and ${codePieces.length} code piece(s)`);

	return { messages, codePieces };
}

