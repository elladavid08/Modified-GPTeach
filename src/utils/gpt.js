import ChatMessage from "../objects/ChatMessage";
import { Constants } from "../config/constants";
import { toTitleCase } from "./primitiveManipulation";
import { generateWithGenAI, generateWithGenAICompletion } from "../services/genai";

const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
	apiKey: process.env.REACT_APP_OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Description of models: (https://platform.openai.com/docs/models/overview)
// text-davinci-003: Can do any language task with better quality, longer output, and consistent instruction-following than the curie, babbage, or ada models.
// gpt-3.5-turbo: Most capable GPT-3.5 model and optimized for chat at 1/10th the cost of text-davinci-003. Will be updated with our latest model iteration.
// gpt-4: More capable than any GPT-3.5 model, able to do more complex tasks, and optimized for chat. Will be updated with our latest model iteration.

/** GPT 3 and 3.5/4 use slightly different APIs, but we wrap it into a single function */
export default async function callGPT(
	history,
	students,
	scenario,
	addendum = "",
	onResponse
) {
	const verNum = Constants.GPT_VERSION;
	if (verNum === 3) {
		callGPT3(history, students, scenario, onResponse);
	} else if (verNum === 3.5) {
		callNewGPT(
			"gpt-3.5-turbo",
			history,
			students,
			scenario,
			addendum,
			onResponse
		);
	} else {
		// Default to 4
		callNewGPT("gpt-4", history, students, scenario, addendum, onResponse);
	}
}

async function callGPT3(history, students, scenario, addendum, onResponse) {
	const myPrompt =
		makeProsePrompt(students, scenario, addendum) +
		makeHTMLTags(students) +
		"\n\n" +
		history.toString();
	console.log("Calling GPT-3... \n\n" + myPrompt);

	if (Constants.PROVIDER === "google") {
		// Use Google's Vertex AI GenAI for completion-style prompts
		try {
			const response = await generateWithGenAICompletion(myPrompt, {
				temperature: 0.7,
				max_tokens: 256,
				top_p: 1,
				stop: ["Tutor: "],
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
		// Use OpenAI (default behavior)
		await openai
			.createCompletion({
				model: "text-davinci-003",
				prompt: myPrompt,
				temperature: 0.7,
				max_tokens: 256,
				top_p: 1,
				frequency_penalty: 0,
				presence_penalty: 0,
				// TODO: use the user-specified name ?
				stop: ["Tutor: "],
			})
			.then((response) => {
				if (response.data.choices[0].text) {
					onResponse(convertResponseToMessages(response.data.choices[0].text, null, students));
				} else {
					console.log("didn't get a response....");
					onResponse(new ChatMessage("", "... I don't understand?"));
				}
			});
	}
}

/** GPT 3.5 and 4 use the same API, just a different model name */
async function callNewGPT(
	model,
	history,
	students,
	scenario,
	addendum,
	onResponse
) {
	const myPrompt = [
		{
			// TODO: move the code instructions somewhere else
			content: makeProsePrompt(students, scenario, addendum),
			role: "system",
		},
		...history.toGPTformat(),
	];

	console.log(`Calling ${model} with ${myPrompt.length} messages in history`);
	
	// Calculate approximate token count (rough estimate: 1 token ≈ 4 chars)
	const totalChars = myPrompt.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
	console.log(`📏 Estimated prompt size: ${totalChars} chars (~${Math.ceil(totalChars / 4)} tokens)`);
	
	if (!Constants.IS_PRODUCTION) {
		console.log(
			`Full prompt:\n` +
				myPrompt
					.map((m) => {
						const preview = m.content ? m.content.substring(0, 200) : '';
						return `${m.role}: ${preview}...`;
					})
					.join("\n")
		);
	}

	try {
		if (Constants.PROVIDER === "google") {
			// Use Google's Vertex AI GenAI
			const msg = await generateWithGenAI(myPrompt, { stop: ["Tutor:"] });
			
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
			// Use OpenAI (default behavior)
			await openai
				.createChatCompletion({
					model: model,
					messages: myPrompt,
					stop: ["Tutor:"],
				})
				.then((response) => {
					const msg = response.data.choices[0].message.content;
					if (!Constants.IS_PRODUCTION) {
						console.log(`GPT Response: \n${msg}`);
					}

					// Parse out any code (NOTE: Editor functionality currently disabled - AI not instructed to use this)
					if (msg.includes("<CODE_EDITOR>")) {
						const {messages, codePieces} = parseCodeVersion(msg, students);
						onResponse(messages, codePieces);
					} else {
						onResponse(convertResponseToMessages(msg), null, students);
						console.log("hi what's up with this boyo?")
					}
				});
		}
	} catch (err) {
		console.log(`Error from ${Constants.PROVIDER === "google" ? "GenAI" : "GPT"}: ${err}`);
		return
	}
}

//* ########################### Helper Functions ########################## */

/** Convert GPT's JSON response to Message object(s) */
function convertResponseToMessages(gptResponse, fromCode, students) {
	let newMessages = [];

	console.log("📥 convertResponseToMessages called (JSON mode)");
	console.log("  gptResponse:", gptResponse ? `${gptResponse.length} chars` : "null/undefined");
	console.log("  fromCode:", fromCode);
	console.log("  students:", students ? students.length : "null/undefined");

	if(!gptResponse || gptResponse.trim().length === 0){
		console.log("⚠️ Empty or null gptResponse");
		if(fromCode){
			console.log("  fromCode is truthy, returning default message");
			const studentName = students && students[0] ? students[0].name : 'Student';
			newMessages.push(new ChatMessage(studentName, "Here it!", "assistant"))
			return newMessages;
		}
		console.log("  fromCode is falsy, returning empty array instead of null");
		return [];  // Return empty array instead of null to avoid issues
	}

	try {
		// Parse JSON response
		const jsonData = JSON.parse(gptResponse);
		const responseCount = (jsonData.responses && jsonData.responses.length) || 0;
		console.log(`📊 Parsed JSON with ${responseCount} responses`);
		
		if (!jsonData.responses || !Array.isArray(jsonData.responses)) {
			throw new Error("Invalid JSON structure: missing 'responses' array");
		}
		
		// Create ChatMessage objects from each response
		for (const response of jsonData.responses) {
			if (!response.student || !response.message) {
				console.warn("⚠️ Skipping invalid response entry:", response);
				continue;
			}
			
			const studentName = toTitleCase(response.student);
			const message = response.message.trim();
			
			newMessages.push(new ChatMessage(studentName, message, "assistant"));
			console.log(`✅ Added message from ${studentName}`);
		}
		
		console.log(`📤 Returning ${newMessages.length} message(s) from convertResponseToMessages`);
		return newMessages;
		
	} catch (error) {
		console.error("❌ Error parsing JSON response:", error);
		console.error("Raw response:", gptResponse);
		
		// Fallback: create error message
		const studentName = students && students[0] ? students[0].name : 'Student';
		newMessages.push(new ChatMessage(studentName, "I'm having trouble understanding. Could you repeat that?", "assistant"));
		return newMessages;
	}
}

/** Turn the information into a paragraph */
function makeProsePrompt(students, scenario, addendum) {
	let retStr = "";
	
	// START WITH FORMATTING REQUIREMENTS - MOST CRITICAL
	const studentNames = students.map(s => s.name).join(" and ");
	retStr += `\n\n========================================`;
	retStr += `\n🚨 MANDATORY JSON FORMAT - NO EXCEPTIONS 🚨`;
	retStr += `\n========================================`;
	retStr += `\nThe students in this conversation are: ${studentNames}.`;
	retStr += `\nYou MUST respond with valid JSON in this exact format.`;
	retStr += `\nFORMAT REQUIREMENTS (YOU WILL BE PENALIZED FOR VIOLATIONS):`;
	retStr += `\n1. BOTH ${studentNames} MUST respond in EVERY turn`;
	retStr += `\n2. Each student MUST have their OWN separate object in the responses array`;
	retStr += `\n3. NEVER write text outside the JSON structure`;
	retStr += `\n4. NEVER combine students under one response object`;
	retStr += `\n5. Use exact student names as shown in the descriptions`;
	
	// Provide clear examples
	if (students.length > 1) {
		retStr += `\n\n✅ CORRECT format (YOU MUST USE THIS):`;
		retStr += `\n{`;
		retStr += `\n  "responses": [`;
		retStr += `\n    {"student": "${students[0].name}", "message": "I think the answer is 28 because we double both dimensions."},`;
		retStr += `\n    {"student": "${students[1].name}", "message": "Yes, that makes sense! The perimeter doubled too."}`;
		retStr += `\n  ]`;
		retStr += `\n}`;
		retStr += `\n\n❌ WRONG format (NEVER DO THIS):`;
		retStr += `\n"Okay, so if we double both... The new perimeter is 28..."`;
		retStr += `\n(This is not JSON - ALWAYS USE THE JSON FORMAT ABOVE!)`;
		retStr += `\n\n========================================\n\n`;
	}
	
	// Now add the scene setting
	retStr += Constants.GPT_SET_SCENE;
	retStr += "\n\n" + scenario["text"] + "\n";

	// Students is an array of student objects, each with a 'name' property
	students.forEach((student) => {
		retStr += "\n" + student.description;
	});

	retStr +=
		"\n\n" + Constants.GPT_RESPONSE_INSTRUCTIONS + "\n" + addendum;
	
	// END WITH FORMATTING REMINDER
	retStr += `\n\n🚨 REMINDER: Respond ONLY with valid JSON matching this structure: {"responses": [{"student": "${students[0].name}", "message": "..."}, {"student": "${students[1].name}", "message": "..."}]} 🚨\n\n`;

	return retStr;
}

/** Create the HTML-esque tags that recap the conversation for GPT 3 */
function makeHTMLTags(students) {
	let retStr = `<span context="middle-school-geometry"`;

	// Students is an array of student objects
	students.forEach((student) => {
		retStr += ` action="${student.name}-goes-to-tutoring-session"`;
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
function parseCodeVersion(gptResponse, students) {
	// See https://regex101.com/r/YYx6pP/4
	console.log("🔧 parseCodeVersion called");
	console.log("Input length:", gptResponse.length);
	
	let matches = gptResponse.match(/<CODE_EDITOR>([^<]*)<\/CODE_EDITOR>/gm);
	let codePieces = [];
	let fromCode = "yes"

	if (matches) {
		console.log(`Found ${matches.length} CODE_EDITOR block(s)`);
		matches.forEach((match) => {
			// Pull out the code
			const codeContent = match.replace("<CODE_EDITOR>", "").replace("</CODE_EDITOR>", "").trim();
			codePieces.push(codeContent);
			console.log(`Code piece length: ${codeContent.length}`);
			// Remove the match from the gptResponse, so it is as if it was the plain chat version
			gptResponse = gptResponse.replace(match, "");
		});
	}

	console.log("Text remaining after removing CODE_EDITOR:", gptResponse.trim().length, "chars");
	console.log("Text preview:", gptResponse.trim().substring(0, 200));

	let messages = convertResponseToMessages(gptResponse, fromCode, students);
	
	console.log(`✅ parseCodeVersion returning ${messages ? messages.length : 0} message(s) and ${codePieces.length} code piece(s)`);

	return { messages, codePieces };
}
