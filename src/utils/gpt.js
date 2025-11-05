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
				stop: ["TA: "],
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
				stop: ["TA: "],
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
			const msg = await generateWithGenAI(myPrompt, { stop: ["TA:"] });
			
			if (!Constants.IS_PRODUCTION) {
				console.log(`GenAI Response: \n${msg}`);
			}

			// Log the full raw response for debugging
			console.log("📝 Raw AI Response:");
			console.log(msg);
			console.log("📝 End of raw response");
			
			// Check if AI used generic "student" tag instead of actual names
			if (msg.match(/<student>/i)) {
				console.warn("⚠️ AI used generic '<student>' tag instead of actual student names!");
			}
			
			// Count how many student message tags are in the response
			const studentTags = msg.match(/<[^>]+>.*?<\/[^>]+>/gs);
			console.log(`🏷️ Found ${studentTags ? studentTags.length : 0} message tag(s) in raw response`);
			if (studentTags) {
				studentTags.forEach((tag, idx) => {
					const tagMatch = tag.match(/<([^>]+)>/);
					const tagName = tagMatch ? tagMatch[1] : 'unknown';
					console.log(`  Tag ${idx + 1}: <${tagName}>`);
				});
			}

			// Parse out any code
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
					stop: ["TA:"],
				})
				.then((response) => {
					const msg = response.data.choices[0].message.content;
					if (!Constants.IS_PRODUCTION) {
						console.log(`GPT Response: \n${msg}`);
					}

					// Parse out any code
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

/** Convert GPT's prose to Message object(s) */
function convertResponseToMessages(gptResponse, fromCode, students) {
	let newMessages = [];

	console.log("📥 convertResponseToMessages called");
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

	// Regex using colons and EOM - allow spaces and other characters in tag names
	const matches = Array.from(gptResponse.matchAll(/<([^>]+)>(.*?)<\/\1>/gms));
	console.log(`📊 Found ${matches.length} tagged message(s) in response`);
	
	// ONLY split if there's exactly 1 message and it seems combined
	// If there are 2+ messages, the AI already separated them correctly
	const shouldConsiderSplitting = matches.length === 1 && students && students.length > 1;
	
	for (const message of matches) {
		console.log(message)
		let agent = toTitleCase(message[1]);
		console.log("Agent:", agent)
		let content = message[2].trim();
		console.log("Content length:", content.length, "Preview:", content.substring(0, 100));
		
		// Only try to split if we have exactly 1 message tag AND it uses a generic tag
		// (With improved prompts, we shouldn't need to split by length anymore)
		if (shouldConsiderSplitting) {
			const isGenericStudent = agent.toLowerCase() === "student" || agent.toLowerCase() === "student name";
			
			if (isGenericStudent) {
				console.warn("⚠️ Detected generic 'student' tag - this should be rare now. Splitting as fallback.");
				
				// Split roughly in half between the two students as last resort
				const sentences = content.split(/\.\s+/);
				const midpoint = Math.floor(sentences.length / 2);
				const firstHalf = sentences.slice(0, midpoint).join('. ') + (sentences[0] ? '.' : '');
				const secondHalf = sentences.slice(midpoint).join('. ') + (sentences[midpoint] ? '.' : '');
				
				newMessages.push(new ChatMessage(students[0].name, firstHalf.trim(), "assistant"));
				newMessages.push(new ChatMessage(students[1].name, secondHalf.trim(), "assistant"));
				console.log(`✂️ Split generic tag message between ${students[0].name} and ${students[1].name}`);
				continue; // Skip the normal push below since we already added both
			}
		}
		
		// Note that the timestamp of the message is creation time -- not when user sees the message
		newMessages.push(new ChatMessage(agent, content, "assistant"));
	}

	// If no tagged messages were found, but we have text content, create a message from the first student
	if (newMessages.length === 0 && gptResponse.trim().length > 0) {
		console.log("⚠️ No tagged messages found, creating message from unwrapped text");
		console.log("Unwrapped text length:", gptResponse.trim().length);
		console.log("Unwrapped text preview:", gptResponse.trim().substring(0, 200));
		const studentName = students && students[0] ? students[0].name : 'Student';
		console.log("Assigning to student:", studentName);
		newMessages.push(new ChatMessage(studentName, gptResponse.trim(), "assistant"));
	}

	console.log(`📤 Returning ${newMessages.length} message(s) from convertResponseToMessages`);
	return newMessages;
}

/** Turn the information into a paragraph */
function makeProsePrompt(students, scenario, addendum) {
	let retStr = Constants.GPT_SET_SCENE;

	retStr += scenario["text"] + "\n";

	// Students is an array of student objects, each with a 'name' property
	students.forEach((student) => {
		retStr += "\n" + student.description;
	});

	// Add explicit instruction about which student names to use in tags
	const studentNames = students.map(s => s.name).join(" and ");
	retStr += `\n\nThe students in this conversation are: ${studentNames}.`;
	retStr += `\nIMPORTANT: Both students typically participate in each response. If the TA addresses a specific student by name, that student should respond first, but the other student may also chime in.`;
	retStr += `\nFormat: Each student speaks separately using their own name tags.`;
	
	// Provide simple examples with actual student names
	if (students.length > 1) {
		retStr += `\n\nExample response format:`;
		retStr += `\n<${students[0].name}> ${students[0].name}'s response here </${students[0].name}>`;
		retStr += `\n<${students[1].name}> ${students[1].name}'s response here </${students[1].name}>`;
	}

	retStr +=
		"\n\n" + Constants.GPT_RESPONSE_INSTRUCTIONS + "\n" + addendum + "\n\n";

	return retStr;
}

/** Create the HTML-esque tags that recap the conversation for GPT 3 */
function makeHTMLTags(students) {
	let retStr = `<span context="intro-cs-class-python"`;

	// Students is an array of student objects
	students.forEach((student) => {
		retStr += ` action="${student.name}-goes-to-office-hours"`;
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

/** Separate code and chat */
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
