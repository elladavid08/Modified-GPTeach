// Polyfill fetch API for Node.js 16 compatibility
import { fetch, Headers, Request, Response } from 'undici';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import { formatSkillsForPrompt, formatConversationHistory, getPCKSkillById } from './universal_pck_skills.js';
import { saveConversation, saveMessage, createUserProfile, getUserProfile, saveTestSubmission, checkTestSubmission, verifyAnnotator, verifyAdmin, getTestSubmissions, getTestSubmission, saveTestAnnotation, getTestAnnotation, getAllAnnotationsForSubmission } from './services/firebaseAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 image uploads

// Serve static files in production (React build)
if (NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '..', 'build');
  console.log('🌐 Serving static files from:', buildPath);
  app.use(express.static(buildPath));
}

console.log('🔧 Initializing Vertex AI with Service Account...');

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const ENABLE_CREDENTIAL_DEBUG = process.env.ENABLE_DEBUG_CREDENTIALS === 'true';

// Service Account Key Path (from environment variable or default location)
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                path.join(__dirname, 'service-account-key.json');

console.log('🔑 Using service account key from:', keyPath);

// Initialize Vertex AI with Service Account
const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION,
  googleAuthOptions: {
    keyFilename: keyPath
  }
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-flash-lite'
});

console.log('✅ Vertex AI initialized successfully with service account');

/**
 * Retries an async function on Vertex AI quota/rate-limit errors using
 * exponential backoff. Retries only on 429 / RESOURCE_EXHAUSTED signals;
 * all other errors are re-thrown immediately.
 *
 * @param {() => Promise<any>} fn - The async call to attempt
 * @param {number} maxRetries - Maximum number of extra attempts (default 3)
 * @param {number} baseDelayMs - Initial delay in ms; doubles each attempt (default 2000)
 */
async function withRetry(fn, maxRetries = 3, baseDelayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err.message?.includes('429') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('Too Many Requests') ||
        err.message?.includes('quota') ||
        err.status === 429;

      if (isRateLimit && attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 2 s, 4 s, 8 s
        console.warn(`⏳ Rate limit hit (attempt ${attempt}/${maxRetries + 1}). Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

const auth = new GoogleAuth({
  keyFilename: keyPath,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

async function fetchCredentialDetails() {
  try {
    const client = await auth.getClient();
    const [resolvedProjectId, accessToken] = await Promise.all([
      auth.getProjectId().catch(() => null),
      client.getAccessToken().catch(() => null)
    ]);

    const tokenValue = typeof accessToken === 'string' ? accessToken : accessToken?.token;
    const tokenExpiry = accessToken && typeof accessToken === 'object' ? accessToken.expiry_date ?? null : null;

    return {
      projectId: resolvedProjectId,
      credentialType: client.constructor?.name ?? 'UnknownCredential',
      clientEmail: client.email ?? client.subject ?? null,
      tokenAvailable: Boolean(tokenValue),
      tokenLength: tokenValue?.length ?? 0,
      tokenExpiry
    };
  } catch (error) {
    return {
      error: error.message
    };
  }
}

function formatScenarioContextForPrompt(scenario) {
  if (!scenario) {
    return 'No scenario context provided';
  }

  const lines = [];

  lines.push(`**Grade Level**: ${scenario.grade_level || 'Middle School'}`);
  lines.push(`**Topic**: ${scenario.ai_context_summary || scenario.text || 'Geometry lesson'}`);

  if (scenario.ai_prior_knowledge) {
    lines.push(`**Prior Knowledge**: ${scenario.ai_prior_knowledge}`);
  }

  if (scenario.misconception_focus) {
    lines.push(`**Likely Misconception**: ${scenario.misconception_focus}`);
  }

  if (scenario.ai_pedagogical_focus && scenario.ai_pedagogical_focus.length > 0) {
    lines.push('**Pedagogical Focus Areas**:');
    scenario.ai_pedagogical_focus.forEach((focus) => {
      lines.push(`- ${focus}`);
    });
  }

  lines.push('');
  lines.push('⚠️ Use this scenario context only as background for the lesson setting and likely misconception.');
  lines.push('⚠️ Evaluate the teacher based on the universal PCK taxonomy and the actual conversation evidence.');
  lines.push("⚠️ The pedagogical focus areas are not a script, and strong teaching may look different from the scenario's typical move.");

  return lines.join('\n');
}

(async () => {
  const details = await fetchCredentialDetails();
  if (details.error) {
    console.error('⚠️  Unable to load service account details:', details.error);
  } else {
    console.log('🔐 Service Account project ID:', details.projectId ?? '(unknown)');
    console.log('🔐 Credential type:', details.credentialType);
    console.log('🔐 Service account email:', details.clientEmail ?? '(not provided)');
    console.log('🔐 Access token available:', details.tokenAvailable);
    console.log('🔐 Access token length:', details.tokenLength);
    if (details.tokenExpiry) {
      console.log('🔐 Access token expiry (ms since epoch):', details.tokenExpiry);
    }
  }
})();

/**
 * Convert OpenAI message format to Google GenAI format
 * OpenAI: [{role: "system", content: "..."}, {role: "user", content: "..."}, {role: "assistant", content: "..."}]
 * Google: [{role: "user", parts: [{text: "..."}]}, {role: "model", parts: [{text: "..."}]}]
 * Supports multimodal content (text + images)
 */
function convertMessagesToGenAI(openAIMessages) {
  const contents = [];
  let systemPrompt = "";

  console.log('🔄 Converting', openAIMessages.length, 'messages to GenAI format');

  for (const message of openAIMessages) {
    if (message.role === "system") {
      systemPrompt = message.content;
      console.log('🎯 System prompt captured:', systemPrompt.substring(0, 100) + '...');
    } else if (message.role === "user") {
      // Check if content is multimodal (array with text and image)
      if (Array.isArray(message.content)) {
        // Multimodal message with image
        const parts = [];
        
        // Add system prompt to text if present
        const textPart = message.content.find(part => part.text);
        if (textPart) {
          const textContent = systemPrompt ? `${systemPrompt}\n\n${textPart.text}` : textPart.text;
          parts.push({ text: textContent });
          systemPrompt = ""; // Clear system prompt after using it
        }
        
        // Add image data
        const imagePart = message.content.find(part => part.inline_data);
        if (imagePart) {
          parts.push({
            inline_data: {
              mime_type: imagePart.inline_data.mime_type,
              data: imagePart.inline_data.data
            }
          });
          console.log('🖼️ Added user message with image');
        }
        
        contents.push({
          role: "user",
          parts: parts
        });
      } else {
        // Text-only message
        const content = systemPrompt ? `${systemPrompt}\n\n${message.content}` : message.content;
        contents.push({
          role: "user",
          parts: [{ text: content }]
        });
        systemPrompt = ""; // Clear system prompt after using it
        console.log('👤 Added user message');
      }
    } else if (message.role === "assistant") {
      contents.push({
        role: "model", 
        parts: [{ text: message.content }]
      });
      console.log('🤖 Added assistant/model message');
    }
  }

  // If we only have a system prompt and no messages yet (initial conversation),
  // create a user message to trigger the AI to start the conversation
  if (contents.length === 0 && systemPrompt) {
    console.log('🎬 Creating initial trigger message for student-initiated conversation');
    contents.push({
      role: "user",
      parts: [{ text: `${systemPrompt}\n\n[The tutoring session is starting. The students should greet and present their geometry question.]` }]
    });
  }

  console.log('✅ Converted to', contents.length, 'GenAI messages');
  return contents;
}

// API endpoint for chat completions (GPT 3.5/4 style)
app.post('/api/generate', async (req, res) => {
  try {
    console.log('🚀 Received chat completion request');
    console.log('📝 Request body keys:', Object.keys(req.body));
    
    const { messages, options = {} } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        success: false,
        error: 'Messages array is required' 
      });
    }

    const contents = convertMessagesToGenAI(messages);

    if (contents.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No valid messages to process' 
      });
    }

    const generationConfig = {
      maxOutputTokens: 512,
      temperature: 0.7,
      topP: 1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          responses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                student: {
                  type: "string",
                  description: "The exact name of the student speaking"
                },
                message: {
                  type: "string",
                  description: "The student's message"
                }
              },
              required: ["student", "message"]
            }
          }
        },
        required: ["responses"]
      }
    };

    if (options.stop && options.stop.length > 0) {
      generationConfig.stopSequences = options.stop;
      console.log('🛑 Stop sequences:', options.stop);
    }

    console.log('📤 Calling Vertex AI with config:', generationConfig);
    
    const result = await withRetry(() => model.generateContent({
      contents,
      generationConfig
    }));

    console.log('📦 Raw result structure:', JSON.stringify(result, null, 2));

    // Check if response exists
    if (!result || !result.response) {
      throw new Error('No response received from Vertex AI');
    }

    // Check if candidates exist
    if (!result.response.candidates || result.response.candidates.length === 0) {
      console.error('❌ No candidates in response. Full response:', JSON.stringify(result.response, null, 2));
      throw new Error('No candidates in response. The model may have blocked the content or encountered an error.');
    }

    // Extract text from response following the structure: result.response.candidates[0].content.parts[0].text
    const candidate = result.response.candidates[0];
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.error('❌ Invalid candidate structure:', JSON.stringify(candidate, null, 2));
      throw new Error('Invalid response structure from model');
    }

    const responseText = candidate.content.parts[0].text;
    console.log('✅ Response received, length:', responseText.length);
    console.log('✅ Response preview:', responseText.substring(0, 200) + '...');
    
    const responsePayload = { 
      success: true,
      text: responseText
    };
    console.log('📤 Sending response to frontend...');
    res.json(responsePayload);
    console.log('✅ Response sent successfully');
  } catch (error) {
    console.error('❌ Error in chat completion:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Full error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.name
    });
  }
});

// API endpoint for completions (GPT-3 style)
// NEW: Comprehensive PCK Feedback Analysis Endpoint
app.post('/api/pck-feedback', async (req, res) => {
  try {
    console.log('💡 Received comprehensive PCK feedback analysis request');
    
    const { teacherMessage, conversationHistory, scenario, feedbackHistory } = req.body;
    
    if (!teacherMessage) {
      return res.status(400).json({ 
        success: false,
        error: 'Teacher message is required' 
      });
    }

    // Build comprehensive PCK analysis prompt
    const conversationHistoryText = formatConversationHistory(conversationHistory || []);
    
    // Format universal PCK skills for prompt
    const universalSkillsText = formatSkillsForPrompt();

    const pckPrompt = `You are a PCK (Pedagogical Content Knowledge) expert analyzing a Hebrew geometry teacher's pedagogical moves in real-time.

## Lesson Context
${formatScenarioContextForPrompt(scenario)}

## Universal PCK Skills to Assess

${universalSkillsText}

## Conversation History (Hebrew)
${conversationHistoryText}

## Teacher's Latest Message to Analyze
"${teacherMessage}"

${feedbackHistory && feedbackHistory.length > 0 ? `
## 📊 Previous Feedback History (last ${feedbackHistory.length} turns)
${feedbackHistory.map((fb, idx) => {
  const skillsSummary = (fb.skills_assessment || [])
    .filter(s => s.is_relevant)
    .map(s => `    - ${s.skill_id}: score=${s.score}${s.score === 0 && s.what_could_be_better ? ` | suggestion: "${s.what_could_be_better}"` : ''}`)
    .join('\n');
  return `
**Turn ${feedbackHistory.length - idx} ago:**
- Pedagogical quality: ${fb.pedagogical_quality}
- Feedback given: "${fb.feedback_message_hebrew}"
- Understanding level: ${fb.predicted_student_state && fb.predicted_student_state.understanding_level}
${skillsSummary ? `- Skill scores that turn:\n${skillsSummary}` : '- No skill scores recorded'}`;
}).join('\n')}

⚠️ **Persistence Rules:**
If the same problem repeats without explicit correction, don't soften feedback from "problematic" to "neutral".
If 2+ consecutive problematic turns, set response_tone to "frustrated" or "challenging".

## 🔁 Feedback Continuity Rules (apply these BEFORE scoring in Phase 2)

**Rule 1 — No duplicate positive feedback for the same skill on the same error:**
Look at the skill scores from previous turns above. If a skill was already scored ≥ 1 (positive or partial) in a recent turn for the same active student error, do NOT give positive feedback for that skill again this turn. Instead, mark it \`is_relevant: false\` with reason "already positively assessed in a previous turn". Move on to the next skill in the chain that has not yet been demonstrated.
Exception: if the skill previously scored 0 (negative feedback was given) and the teacher now demonstrates it, DO give positive feedback — this shows the teacher has improved in response to the feedback.

**Rule 2 — Recognize when the teacher followed a suggestion:**
Look at the feedback given in the most recent prior turn. If that turn included a negative score (score=0) for a skill and a suggestion (what_could_be_better), and the teacher's CURRENT message does what that suggestion recommended, then:
- Score that skill as 2 (fully demonstrated) this turn
- Give positive feedback acknowledging the improvement: make clear the teacher acted on the previous feedback
- Do NOT continue giving a negative/different suggestion on the same skill
The teacher following feedback advice is progress and must be recognized as such.
` : ''}

---

## Your Task - TWO PARTS

### PART A: STUDENT IMPACT ASSESSMENT (ALWAYS REQUIRED)
Even if no teacher feedback is needed, assess how this move affects students:

**Guidelines:**
- "improved" = Explicit corrective move (formal definition, systematic checking, guided discovery)
- "same" = Correct content but only partial progress
- "confused"/"more_confused" = Incorrect, vague, or hard-to-follow teaching
- "misconception_reinforced" = The teacher explicitly validates a wrong idea. Students who held that idea tend to accept it with more confidence; students who did not hold it may respond with a cautious clarification question

Use student_reaction_hints to specify which students are most likely to respond next and what kind of reaction each one is likely to have.
- Choose students based on the recent conversation: who spoke, who showed confusion or misconception, and whose prior stance makes a response likely
- Keep each reason short and evidence-based
- reaction_type should be one of: "understanding_progress", "partial_understanding", "persistent_confusion", "reinforced_acceptance", "cautious_clarification", "misapplied_new_rule"

### PART B: TEACHER FEEDBACK (CONDITIONAL)

## 🚦 PHASE 1: Should Feedback Be Provided?

### GATE 0 — Check the teacher's CURRENT message first (before anything else)

**Read the teacher's latest message and classify it. If it falls into any category below, immediately set should_provide_feedback: false and skip Phase 2 entirely. Do not look at conversation history yet.**

❌ **Procedural / social message** — greeting, farewell, filler word, acknowledgement ("שלום", "אוקיי", "מעולה", "נכון", "המשיכו")
❌ **Lesson opening** — teacher introducing the topic or asking what students know with no prior student error
❌ **Lesson closing / ending** — any message signalling the lesson is over: farewell, wrap-up compliment to the class, dismissal, "see you next time", or any conclusive social statement. **Even if a student error occurred earlier in the conversation, a closing message is NOT a pedagogical response to that error and must never trigger feedback.**
❌ **Unprompted question** — teacher opens a new question or topic to the class *without* a student error having just occurred (e.g. starting a new task, asking what students know, posing a new challenge unrelated to a prior student mistake)
❌ **Content explanation with no prior student error** — teacher is explaining material but no student error has been shown yet

**⚠️ IMPORTANT — Questions as pedagogical moves:**
A teacher message that contains a question is NOT automatically excluded. If the teacher is using a question as their pedagogical response to a student's incorrect claim (e.g. redirecting the student to examine a definition, posing a counter-example question, asking "is this always true?"), that question IS a PCK move and must be evaluated in Gate 1. Gate 0 only excludes questions that are topic-openers with no preceding student error.

If the current message is any of the above ❌ categories → should_provide_feedback: false. Stop here.

---

### GATE 1 — Verify a student error exists and can be quoted

**MANDATORY FIRST STEP: Read ALL student messages from the most recent student turn (the group of student responses that immediately precede the teacher's current message — there may be 1, 2, or 3 students responding in the same turn). Go through each one and write down the exact quote of any mathematically incorrect claim. If you cannot write a specific incorrect quote from any of them, set should_provide_feedback: false immediately and stop.**

A student error means: the student stated something that is **mathematically wrong**. This includes incorrect claims, false generalizations, misapplied rules, and stated misconceptions. It does NOT include:
- A correct answer, even if phrased hesitantly or incompletely
- A question (questions contain no claim)
- Agreement with the teacher
- A correct claim about a topic where misconceptions are common
- A student saying "I'm not sure" without making a wrong claim

Only proceed if ALL of the following are true:
1. ✅ At least one student has already responded in the conversation
2. ✅ At least one student in the **most recent student turn** made a specific mathematically incorrect claim — you must be able to quote it word for word. It does not matter whether other students in the same turn said something correct; what matters is that at least one incorrect claim exists and can be identified.
3. ✅ The teacher's CURRENT message is a direct response to that specific incorrect claim (not to the correct claims from the same turn)

**Hard rules:**
- "Most recent student turn" means the student messages that appear **immediately before the teacher's current message in the conversation**, with no intervening teacher message between them and the current one. If the last thing before this teacher message was another teacher message (not students), condition 2 fails.
- An error from an earlier part of the conversation — even one that was never addressed — does NOT satisfy condition 2 if there have been any teacher messages since that error was expressed. Feedback can only be given at the turn where the teacher is directly responding to fresh student output.
- If ALL students in the most recent turn said something correct, condition 2 fails even if a misconception-adjacent topic was discussed.
- When you proceed to Phase 2, the feedback must address **only the specific incorrect claim you quoted**. Do not comment on correct statements other students made in the same turn — those require no PCK response.

If any condition is false → should_provide_feedback: false. Stop here.

---

### GATE 2 — Assess the teacher's response quality

**Taxonomy-first rule:**
- Analyze using the universal PCK taxonomy and actual interaction evidence
- Do NOT penalize a teacher for using a different valid move than the scenario's common pattern
- If the teacher responds effectively in another pedagogically sound way, score it positively

Assess if:
- ❌ Teacher gave incorrect information responding to the error
- ❌ Teacher didn't address the student's misconception appropriately
- ❌ Teacher used problematic approach (authoritative without explanation, epistemic abdication)
- ✅ Teacher demonstrated strong PCK skill in addressing the error (praise-worthy)
- 🔄 Teacher missed opportunity to address the error properly

**Clear Examples:**

❌ NO FEEDBACK - Teacher opening:
"שלום לכולם! היום נלמד על ריבועים. איזה תכונות של ריבוע אתם מכירים?"
→ should_provide_feedback: false
→ Reason: No student has responded yet. No error to address. Normal lesson opening.

❌ NO FEEDBACK - Teacher asking question:
"בואו נבדוק: מה ההגדרה של מלבן?"
→ should_provide_feedback: false  
→ Reason: Teacher asking question. No student error present. Normal teaching.

❌ NO FEEDBACK - Student correct, teacher confirms:
Student: "ריבוע יש לו 4 צלעות שוות ו-4 זוויות ישרות"
Teacher: "נכון מאוד! תשובה מעולה"
→ should_provide_feedback: false
→ Reason: Student's statement is mathematically correct. No error to identify. Confirming a correct answer is not a PCK skill application — not even error-identification.

❌ NO FEEDBACK - Student correct about misconception topic, teacher confirms:
Student: "אז לא כל מרובע עם אלכסונים מאונכים הוא מעוין, נכון?"
Teacher: "בדיוק! צריך גם שהצלעות יהיו שוות."
→ should_provide_feedback: false
→ Reason: Even though this exchange touches on a common misconception area, the student's claim is mathematically correct. The teacher confirming a correct understanding is not a PCK move. No PCK feedback applies.

❌ NO FEEDBACK - Mixed turn, teacher addresses only the correct student:
Student A: "אז אם האלכסונים מאונכים זה בטח מעוין" (WRONG)
Student B: "אבל זה לא מספיק, לא?" (CORRECT — asking a clarifying question)
Teacher: "נכון, שאלה טובה!"
→ should_provide_feedback: false
→ Reason: Teacher responded only to the correct student (B) and ignored the error made by student A. There is no feedback about the correct claim; however, there IS a missed opportunity on Student A's error — so this turn should produce: should_provide_feedback: true, feedback about the missed error-identification.

✅ YES FEEDBACK - Mixed turn, teacher responds to the error:
Student A: "אז אם האלכסונים מאונכים זה בטח מעוין" (WRONG)
Student B: "אני לא בטוח" (neutral — no claim)
Teacher: "בואו נבדוק — האם זה תמיד נכון? מה עם דלתון?"
→ should_provide_feedback: true
→ Reason: Student A made a specific incorrect claim. Teacher responded to it with a good PCK move. Feedback addresses student A's error only, not student B's neutral response.

✅ YES FEEDBACK - Student error, teacher addresses well:
Student: "אבל ריבוע זה לא מלבן"
Teacher: "בואו נבדוק - מה ההגדרה של מלבן?"
→ should_provide_feedback: true
→ feedback_trigger: "excellent_pck_use"
→ Reason: Student misconception + teacher using good PCK to address it

✅ YES FEEDBACK - Student error, teacher ignores:
Student: "ריבוע לא יכול להיות מלבן"
Teacher: "אוקיי, בואו נמשיך לנושא הבא"
→ should_provide_feedback: true
→ feedback_trigger: "student_misconception_not_addressed"
→ Reason: Student misconception present but teacher didn't address it

✅ YES FEEDBACK - Student error, teacher gives wrong info:
Student: "ריבוע זה לא מלבן, נכון?"
Teacher: "נכון, הם שתי צורות שונות לגמרי"
→ should_provide_feedback: true
→ feedback_trigger: "incorrect_content"
→ Reason: Teacher reinforced incorrect information

If should_provide_feedback = false → Set feedback_trigger = null, skills_assessment = [], feedback_message_hebrew = ""

## 🎯 PHASE 2: Score Relevant PCK Skills (ONLY if Phase 1 = true)

The 5 PCK skills form a **sequential pedagogical chain**. A teacher cannot meaningfully apply a later skill before the earlier ones have been addressed. Assess only the skills that are currently due — **maximum 1-3 skills per turn**.

### The Skill Chain (in order)
1. **error-identification** — Did the teacher notice there was an error at all?
2. **error-characterization** — Did the teacher identify *what kind* of error it is and *why* the student thinks that way?
3. **diagnostic-interpretation** — Did the teacher show understanding of the *root cause* of the student's thinking?
4. **adapted-pedagogical-response** — Did the teacher choose a response strategy *matched to this specific error type*?
5. **error-leveraging** — Did the teacher turn the error into a *learning opportunity* that deepens conceptual understanding?

---

### STEP 1: Determine the current lifecycle stage

Read the conversation history and answer:
- **Stage A — Error just appeared this turn**: A student expressed a misconception or error for the first time.
- **Stage B — Error identified**: The teacher has already acknowledged/named the error in a previous turn.
- **Stage C — Error characterized**: The teacher has already identified the error type and its source in a previous turn.
- **Stage D — Error being addressed**: The teacher has already delivered a pedagogical response and is deepening or closing the discussion.

---

### STEP 2: Select which skills are relevant for this stage

**The skills form a strict prerequisite chain: each skill depends on the one before it.**
A teacher cannot characterize an error they didn't identify. A teacher cannot respond pedagogically to an error they didn't characterize. Evaluate each skill in order, and stop as soon as the teacher fails one — all subsequent skills become irrelevant for this turn.

**Assessment algorithm — follow in order:**

1. Start with the skill that is due for the current lifecycle stage (Stage A → skill 1, Stage B → skill 2, etc.)
2. Score that skill (0, 1, or 2).
3. **If score = 0**: mark ALL remaining higher-numbered skills as \`is_relevant: false\` with reason "prerequisite skill [X] was not demonstrated this turn". **Stop here.**
4. **If score ≥ 1**: optionally assess the next skill in the chain (at most one step forward).
5. Never assess more than 2 skills as \`is_relevant: true\` in a single turn.

**Starting skill by stage:**

| Stage | Start with | May also assess |
|-------|-----------|-----------------|
| A — Error just appeared this turn | skill 1 (error-identification) | skill 2 only if skill 1 score ≥ 1 |
| B — Error already identified in prior turn | skill 2 (error-characterization) | skill 3 only if skill 2 score ≥ 1 |
| C — Error already characterized in prior turn | skill 3 (diagnostic-interpretation) | skill 4 only if skill 3 score ≥ 1 |
| D — Error being addressed / deepening | skill 4 (adapted-pedagogical-response) | skill 5 only if skill 4 score ≥ 1 |

**Hard rules:**
- Mark \`is_relevant: false\` for any skill outside the current window, with \`reason_not_relevant\` explaining why it's not yet due (or already passed).
- Never mark all 5 as \`is_relevant: true\` in a single turn. If you find yourself doing that, you have misread the stage.
- Skill 5 (error-leveraging) is only relevant when the error has been substantially addressed and the teacher has an opportunity to deepen the learning — not on the first or second response to an error.
- **If the teacher did not identify the error at all (skill 1 score = 0), give feedback on skill 1 only. Do not comment on skills 2-5.**

---

### STEP 3: Score each selected skill (Score 0, 1, or 2)
Use the rubrics from the Universal PCK Skills above:
- Score 2: Excellent use matching rubric criteria
- Score 1: Partial or indirect use
- Score 0: Should have been used but wasn't, or was done poorly

### STEP 4: Ground every evidence claim in the teacher's LAST message

**🚨 ANTI-HALLUCINATION RULE — MANDATORY:**
Before writing any \`evidence\` or \`what_could_be_better\` text, verify it against the teacher's latest message only.

- **Evidence MUST come from what the teacher literally wrote in their last message.** Quote or closely paraphrase their actual words.
- **Never attribute to the teacher something a student said.** If a student raised an analogy or idea, that is the student's move — not the teacher's, unless the teacher explicitly picked it up and built on it in their latest message.
- **Never credit the teacher for a move they made in an earlier turn.** Each turn is assessed independently. If the teacher used a good technique two turns ago but not in this turn, do not mention it here.
- **If you cannot point to a specific sentence or phrase the teacher actually wrote** that demonstrates a skill, do not score that skill as demonstrated (score 0 or irrelevant).
- **Doubt yourself**: if you're about to write evidence that references something not in the teacher's last message, stop and re-read the latest message. You are likely confusing a student's statement with a teacher's move, or confusing a past turn with the current one.

---

## Deriving demonstrated_skills and missed_opportunities

After filling in \`skills_assessment\`, derive these two fields:
- \`demonstrated_skills\`: copy every entry where \`is_relevant: true\` AND \`score >= 1\`. Include only \`skill_id\` and \`evidence\`.
- \`missed_opportunities\`: copy every entry where \`is_relevant: true\` AND \`score = 0\`. Include only \`skill_id\` and \`what_could_be_better\` (renamed to \`what_could_have_been_done\`).
- If no skills are relevant (no student error present), both arrays must be \`[]\`.
- **Maximum combined total: 2 entries across both arrays** (reflecting the max 2 relevant skills per turn rule above).

For \`addressed_misconception\`:
- Set \`true\` only if the teacher's message explicitly addressed a misconception a student expressed earlier in this conversation.
- Set \`false\` if: no misconception was present, or the teacher ignored/bypassed it.
- In \`how_addressed\`, briefly describe the move in Hebrew (e.g., "שאל שאלה שמחזירה לתלמיד להגדרה"), or leave as empty string \`""\` if false.

For \`misconception_risk\`:
- \`"high"\` if the teacher's move is likely to create or reinforce a misconception (e.g., validated wrong idea, gave ambiguous explanation)
- \`"low"\` if the teacher's move clearly prevents or corrects misconceptions
- \`"medium"\` otherwise

---

## Expected JSON Response

\`\`\`json
{
  "pedagogical_quality": "positive" | "neutral" | "problematic",
  "predicted_student_state": {
    "understanding_level": "improved" | "same" | "confused" | "more_confused" | "misconception_reinforced",
    "response_tone": "confident" | "hesitant" | "confused" | "frustrated" | "thoughtful",
    "student_reaction_hints": [
      {
        "student": "student name 1",
        "likelihood": "high" | "medium" | "low",
        "reaction_type": "understanding_progress" | "partial_understanding" | "persistent_confusion" | "reinforced_acceptance" | "cautious_clarification" | "misapplied_new_rule",
        "reason": "short explanation"
      }
    ]
  },
  
  "addressed_misconception": true/false, // true if teacher explicitly addressed an active student misconception this turn
  "how_addressed": "Hebrew: brief description of how teacher addressed it, or empty string if false",
  "misconception_risk": "high" | "medium" | "low", // how likely this move is to create/reinforce a misconception
  
  "demonstrated_skills": [
    // Skills where is_relevant=true AND score >= 1. Empty array [] if none.
    { "skill_id": "error-identification", "evidence": "Hebrew: what YOU did that shows this skill — address the teacher directly in second person (e.g. 'זיהית את...', 'שאלת...', 'הסברת...')" }
  ],
  "missed_opportunities": [
    // Skills where is_relevant=true AND score = 0. Empty array [] if none.
    { "skill_id": "error-leveraging", "what_could_have_been_done": "Hebrew: what you could have done — address the teacher in second person (e.g. 'יכולת לשאול...', 'היית יכול להפנות...')" }
  ],

  "should_provide_feedback": true/false,
  "feedback_trigger": "student_misconception_not_addressed" | "incorrect_content" | "epistemic_abdication" | "excellent_pck_use" | "missed_opportunity" | null,
  
  "skills_assessment": [
    // If should_provide_feedback = false, return empty array []
    // If should_provide_feedback = true, assess relevant skills:
    {
      "skill_id": "error-identification",
      "is_relevant": true,
      "score": 1,
      "evidence": "Hebrew: what you did — address teacher in second person (e.g. 'זיהית את...', 'שאלת...', 'הסברת...')",
      "what_could_be_better": "Hebrew: how to improve — address teacher in second person (e.g. 'יכולת לשאול...', 'היית יכול...')" // only if score < 2
    },
    {
      "skill_id": "error-characterization",
      "is_relevant": false,
      "reason_not_relevant": "No error present in this turn"
    }
  ],
  
  "feedback_message_hebrew": "..." // See rules below. ONLY if should_provide_feedback = true, otherwise empty string ""
}
\`\`\`

## Feedback Message Rules (MANDATORY — must follow these exactly)

**When to set should_provide_feedback:**
- pedagogical_quality = "positive" AND a student error was present → should_provide_feedback: true
- pedagogical_quality = "problematic" AND a student error was present → should_provide_feedback: true
- pedagogical_quality = "neutral" → should_provide_feedback: false, feedback_message_hebrew: ""
- No student error present (regardless of quality) → should_provide_feedback: false, feedback_message_hebrew: ""

Your \`feedback_message_hebrew\` MUST be consistent with your \`pedagogical_quality\` score.
NEVER write a critical message when pedagogical_quality = "positive".
NEVER write a positive/encouraging message when pedagogical_quality = "problematic".

**LANGUAGE RULE (MANDATORY): Always address the teacher directly in second person.**
Never write "המורה עשה/אמר/אישר" — always write "עשית/אמרת/אישרת".
Never write "המורה יכול היה" — always write "יכולת".
Never write "המורה היה צריך" — always write "היית צריך/ה".
Write as a personal advisor speaking directly to the teacher, not as an observer describing them.

**The feedback message MUST explicitly name the relevant PCK skill** using its Hebrew name.
The 5 skills and their Hebrew names are:
- error-identification → "זיהוי השגיאה"
- error-characterization → "אפיון סוג השגיאה"
- diagnostic-interpretation → "פרשנות אבחונית של חשיבת התלמיד"
- adapted-pedagogical-response → "תגובה פדגוגית מותאמת"
- error-leveraging → "מינוף השגיאה ללמידה"

To find which skill(s) to name: use the 1-2 most impactful skills from \`demonstrated_skills\` (for positive feedback) or \`missed_opportunities\` (for problematic feedback). **Never mention more than 2 skills in the feedback message** — choose the one(s) with the highest learning value for the teacher at this moment.

**Structure when should_provide_feedback = true:**

If pedagogical_quality = "positive":
→ Write 1-2 short sentences. Focus on the single most important skill demonstrated.
→ Format: "[skill name Hebrew]: [what you did, closely paraphrased]."
→ Example: "זיהוי השגיאה: זיהית שהתלמיד מבלבל בין תנאי הכרחי למספיק ושאלת שאלה שמחזירה אותו להגדרה — מצוין."

If pedagogical_quality = "problematic":
→ Write 2-3 sentences. Focus on the single most important missed skill.
→ Structure: (1) "הוחמצה הזדמנות ל[skill name Hebrew]:" (2) what the student's error was and what you did or failed to do. (3) One concrete alternative: "יכולת לשאול/לומר: '...'"
→ Example: "הוחמצה הזדמנות לתגובה פדגוגית מותאמת: התלמיד טען שריבוע אינו מלבן, אך אישרת את הטענה מבלי להפנות אותו להגדרה. יכולת לשאול: 'מה ההגדרה של מלבן? האם ריבוע מקיים אותה?'"

## Key Calibration Guidelines

**Epistemic Abdication (Always "problematic"):**
If teacher says: "לא צריך להיתקע על זה", "זה לא כל כך חשוב", "סתם תסמכו עליי", "אל תחשבו על זה יותר מדי" → These undermine mathematical thinking itself.

**Right Idea, Soft Execution:**
Don't mark "positive" if teacher says correct things but without formal definitions or systematic checking.
Use "neutral" for: "יש לו את התכונות של מלבן" (correct but not formal)
Use "positive" only for explicit moves: "מה ההגדרה של מלבן?"

**Understanding Level Rules:**
- If teacher gave good explanation with formal definitions/systematic checking → MUST be "improved"
- If correct content but no formal precision → "same" (not "improved")
- Never assume future correction when evaluating current turn

Return JSON only, no additional text:`;

    const contents = [{
      role: 'user',
      parts: [{ text: pckPrompt }]
    }];

    const generationConfig = {
      maxOutputTokens: 2000,
      temperature: 0.7,
      topP: 1
    };

    console.log('📤 Calling Vertex AI for comprehensive PCK analysis...');
    
    const result = await withRetry(() => model.generateContent({
      contents,
      generationConfig
    }));

    if (!result || !result.response) {
      throw new Error('No response received from Vertex AI');
    }

    if (!result.response.candidates || result.response.candidates.length === 0) {
      throw new Error('No candidates in response');
    }

    const candidate = result.response.candidates[0];
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('Invalid response structure from model');
    }

    let responseText = candidate.content.parts[0].text.trim();
    console.log('✅ Raw PCK analysis received:', responseText.substring(0, 200) + '...');
    
    // Extract JSON from markdown code blocks if present
    if (responseText.includes('```json')) {
      const match = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        responseText = match[1].trim();
      }
    } else if (responseText.includes('```')) {
      const match = responseText.match(/```\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        responseText = match[1].trim();
      }
    }
    
    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(responseText);
      console.log('✅ PCK analysis parsed successfully');
    } catch (parseError) {
      console.error('❌ Failed to parse JSON response:', parseError);
      console.error('Response text:', responseText);
      throw new Error('Failed to parse AI response as JSON');
    }
    
    // Validate and fill defaults for new structure
    if (!analysis.pedagogical_quality || !analysis.predicted_student_state) {
      console.warn('⚠️ Incomplete analysis structure, filling in defaults');
      analysis.pedagogical_quality = analysis.pedagogical_quality || 'neutral';
      analysis.predicted_student_state = analysis.predicted_student_state || {
        understanding_level: 'same',
        response_tone: 'thoughtful',
        student_reaction_hints: []
      };
    }

    if (!analysis.predicted_student_state.response_tone) {
      analysis.predicted_student_state.response_tone = 'thoughtful';
    }

    if (!Array.isArray(analysis.predicted_student_state.student_reaction_hints)) {
      analysis.predicted_student_state.student_reaction_hints = [];
    }
    
    // Ensure new fields have defaults
    if (analysis.should_provide_feedback === undefined) {
      analysis.should_provide_feedback = false;
    }
    
    if (!analysis.skills_assessment) {
      analysis.skills_assessment = [];
    }

    // Defaults for new fields
    if (analysis.addressed_misconception === undefined) {
      analysis.addressed_misconception = false;
    }
    if (!analysis.how_addressed) {
      analysis.how_addressed = '';
    }
    if (!analysis.misconception_risk) {
      analysis.misconception_risk = 'medium';
    }
    if (!Array.isArray(analysis.demonstrated_skills)) {
      // Derive from skills_assessment as fallback
      analysis.demonstrated_skills = analysis.skills_assessment
        .filter(s => s.is_relevant && s.score >= 1)
        .map(s => ({ skill_id: s.skill_id, evidence: s.evidence || '' }));
    }
    if (!Array.isArray(analysis.missed_opportunities)) {
      // Derive from skills_assessment as fallback
      analysis.missed_opportunities = analysis.skills_assessment
        .filter(s => s.is_relevant && s.score === 0)
        .map(s => ({ skill_id: s.skill_id, what_could_have_been_done: s.what_could_be_better || '' }));
    }
    
    // Set feedback message based on should_provide_feedback
    if (analysis.should_provide_feedback) {
      if (!analysis.feedback_message_hebrew) {
        analysis.feedback_message_hebrew = 'המורה התקדם בשיעור';
      }
    } else {
      // If no feedback should be provided, ensure message is empty
      analysis.feedback_message_hebrew = '';
    }
    
    res.json({ 
      success: true,
      analysis: analysis
    });
  } catch (error) {
    console.error('❌ Error in PCK feedback:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// New endpoint for comprehensive PCK summary feedback
app.post('/api/pck-summary', async (req, res) => {
  try {
    console.log('📊 Received PCK summary analysis request');
    
    const { conversationLog } = req.body;
    
    if (!conversationLog || !conversationLog.turns || conversationLog.turns.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Conversation log with turns is required' 
      });
    }

    // Build conversation text
    const conversationText = conversationLog.turns.map((turn) => {
      let turnText = `\n--- Turn ${turn.turnNumber} ---\n`;
      turnText += `Teacher: ${turn.teacher.message}\n`;
      turnText += turn.students.map(s => `${s.name}: ${s.message}`).join('\n');
      return turnText;
    }).join('\n');

    // Extract PCK feedback moments with skill assessments
    const pckMoments = conversationLog.turns
      .filter(turn => turn.pckFeedback && turn.pckFeedback.should_provide_feedback)
      .map(turn => ({
        turnNumber: turn.turnNumber,
        teacherMessage: turn.teacher.message,
        skills_assessment: turn.pckFeedback.skills_assessment || [],
        feedback_message: turn.pckFeedback.feedback_message_hebrew || turn.pckFeedback.feedback_message
      }));
    
    console.log(`📊 Found ${pckMoments.length} PCK moments with feedback in ${conversationLog.turns.length} turns`);
    
    // Build PCK moments summary
    let pckMomentsText = "";
    if (pckMoments.length > 0) {
      pckMomentsText = `\n## PCK Moments Identified in Real-Time\n\nThere were ${pckMoments.length} moments where PCK skills were assessed:\n\n`;
      pckMoments.forEach(moment => {
        pckMomentsText += `**Turn ${moment.turnNumber}:**\n`;
        pckMomentsText += `Teacher said: "${moment.teacherMessage.substring(0, 100)}..."\n`;
        
        const relevantSkills = moment.skills_assessment.filter(s => s.is_relevant);
        if (relevantSkills.length > 0) {
          relevantSkills.forEach(skill => {
            const scoreLabel = skill.score === 2 ? '✅ Excellent' : skill.score === 1 ? '⚠️ Partial' : '❌ Missed';
            const skillDef = getPCKSkillById(skill.skill_id);
            const hebrewName = skillDef ? skillDef.skill_name.he : skill.skill_id;
            pckMomentsText += `  - ${hebrewName} (${skill.skill_id}): ${scoreLabel}\n`;
            pckMomentsText += `    Evidence: ${skill.evidence}\n`;
            if (skill.what_could_be_better) {
              pckMomentsText += `    Could improve: ${skill.what_could_be_better}\n`;
            }
          });
        }
        pckMomentsText += `\n`;
      });
    } else {
      pckMomentsText = "\nNo significant PCK moments were identified (likely a very short conversation or test).\n";
    }
    
    // Comprehensive PCK summary prompt
    const summaryPrompt = `You are a PCK (Pedagogical Content Knowledge) expert analyzing a Hebrew geometry teacher's performance. Provide a qualitative, adaptive-length summary IN HEBREW.

## Lesson Context
${formatScenarioContextForPrompt(conversationLog.scenario)}

## Full Conversation (${conversationLog.turns.length} turns)
${conversationText}

${pckMomentsText}

## Statistics
- Teacher messages: ${conversationLog.stats.totalTeacherMessages}
- Student messages: ${conversationLog.stats.totalStudentMessages}

---

## PCK Skills Reference (use these Hebrew names when naming skills)
- זיהוי השגיאה (error-identification): recognizing that a student's statement contains an error
- אפיון סוג השגיאה (error-characterization): identifying the type of logical/conceptual flaw
- פרשנות אבחונית של חשיבת התלמיד (diagnostic-interpretation): understanding the source of the student's incorrect thinking
- תגובה פדגוגית מותאמת (adapted-pedagogical-response): choosing the right pedagogical strategy for the specific error
- מינוף השגיאה ללמידה (error-leveraging): using the error as a resource for deeper conceptual understanding

---

## Your Task: Create an ADAPTIVE-LENGTH summary in Hebrew

**Core requirement: Ground the summary in the PCK skills above and in the real-time feedbacks given during the conversation.**
- Every point you make must connect to one of the 5 named PCK skills.
- Use the real-time feedback moments (listed above) as your primary evidence — do not invent new assessments that contradict them.
- Name each skill explicitly using its Hebrew name when discussing it (positive or negative).

**Length Guidelines (PROPORTIONAL to content):**

### If 0-2 PCK moments (short conversation/test):
- 2-3 sentences ONLY
- Mention which skill(s) appeared (or didn't appear) and why
- DO NOT write a long summary if there's nothing to discuss!

### If 3-5 PCK moments (medium conversation):
- One paragraph (4-6 lines) + 2-3 focused tips
- Each tip must name the relevant PCK skill

### If 6+ PCK moments (full conversation):
- 2 paragraphs (each 5-7 lines) + 3-5 tips
- Deeper analysis of patterns across skills
- But NO MORE than one page!

---

## Summary Structure (adapt length)

**If short conversation (0-2 moments):**
"בשיחה קצרה זו [what happened with which skill]. [one point for improvement or reinforcement, naming the skill]."

**If medium or long conversation:**

### סיכום כללי
[1-2 paragraphs adapted to conversation length, in Hebrew]

When discussing skills, use these patterns:

**Score 2 (Excellent) — name the skill positively:**
- "[שם המיומנות]: הצלחת [what you did specifically]."
- "גישה מצוינת ב[שם המיומנות] — [specific evidence from conversation]."

**Score 1 (Partial) — name the skill, acknowledge partial use, explain what was missing:**
- "[שם המיומנות]: התחלת טוב בכך ש-[what you did], אבל [how to complete it]."
- "ניסית [שם המיומנות] אבל הייתה הזדמנות להעמיק — [what could have been done]."

**Score 0 (Missed) — use "הוחמצה הזדמנות ל[שם המיומנות]":**
- "הוחמצה הזדמנות ל[שם המיומנות]: [what student said/did] אבל [what teacher did instead]. כדאי היה [concrete alternative]."

### טיפים לשיפור (if relevant)
- [Tip 1 — must name the PCK skill it relates to]
- [Tip 2]
- [Tip 3 — if needed]

---

## Critical Rules

1. **Every point must connect to a named PCK skill:**
   - Do not write general pedagogical comments that don't reference one of the 5 skills
   - If a skill wasn't relevant in this conversation, don't discuss it

2. **Ground in real-time feedbacks:**
   - Use the PCK moments listed above as your primary evidence
   - Do not contradict the scores already given in real-time
   - You may add context or nuance, but the skill assessments are fixed

3. **Adapt length to content:**
   - 2-3 turn conversation → 2-3 sentences
   - Long conversation with many PCK moments → up to one page
   
4. **Do not fabricate content:**
   - If there weren't many PCK moments - don't write a long summary
   - Don't repeat the same thing in different phrasings to fill space

5. **Be specific:**
   - Quote or paraphrase examples from the conversation
   - Reference specific turns when relevant
   - Avoid vague generalizations
   
6. **Real balance:**
   - If everything was good - say so
   - If there were problems - focus on them
   - Don't force a "50% positive 50% negative" structure
   
7. **Natural Hebrew language:**
   - Don't write separate "מה עשית טוב" and "מה לשפר" sections
   - Integrate everything in natural paragraphs
   - Tips can be a list but keep concise

Write the summary now IN HEBREW:`;

    const contents = [{
      role: 'user',
      parts: [{ text: summaryPrompt }]
    }];

    const generationConfig = {
      maxOutputTokens: 2048, // Longer output for comprehensive feedback
      temperature: 0.7,
      topP: 0.95
    };

    console.log('📤 Calling Vertex AI for comprehensive PCK analysis...');
    console.log(`   Analyzing ${conversationLog.turns.length} conversation turns`);
    
    const result = await withRetry(() => model.generateContent({
      contents,
      generationConfig
    }));

    if (!result || !result.response) {
      throw new Error('No response received from Vertex AI');
    }

    if (!result.response.candidates || result.response.candidates.length === 0) {
      throw new Error('No candidates in response');
    }

    const candidate = result.response.candidates[0];
    
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      throw new Error('Invalid response structure from model');
    }

    const summaryText = candidate.content.parts[0].text;
    console.log('✅ PCK Summary generated (length:', summaryText.length, 'chars)');
    console.log(`📊 PCK moments in conversation: ${pckMoments.length}`);
    console.log(`📊 Conversation length classification: ${pckMoments.length <= 2 ? 'short' : pckMoments.length <= 5 ? 'medium' : 'long'}`);
    
    res.json({ 
      success: true,
      summary: summaryText.trim(),  // Return as string, not object
      analyzed_turns: conversationLog.turns.length,
      session_id: conversationLog.sessionId
    });
  } catch (error) {
    console.error('❌ Error in PCK summary generation:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/completion', async (req, res) => {
  try {
    console.log('🚀 Received completion request');
    
    const { prompt, options = {} } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Prompt string is required' 
      });
    }

    console.log('📝 Prompt length:', prompt.length);
    console.log('📝 Prompt preview:', prompt.substring(0, 200) + '...');

    const contents = [{
      role: "user",
      parts: [{ text: prompt }]
    }];

    const generationConfig = {
      maxOutputTokens: options.max_tokens || 256,
      temperature: options.temperature || 0.7,
      topP: options.top_p || 1,
    };

    if (options.stop && options.stop.length > 0) {
      generationConfig.stopSequences = options.stop;
      console.log('🛑 Stop sequences:', options.stop);
    }

    console.log('📤 Calling Vertex AI completion with config:', generationConfig);
    
    const result = await withRetry(() => model.generateContent({
      contents,
      generationConfig
    }));

    // Check if response and candidates exist
    if (!result || !result.response || !result.response.candidates || result.response.candidates.length === 0) {
      console.error('❌ Invalid completion response:', JSON.stringify(result, null, 2));
      throw new Error('No valid response from model');
    }

    // Extract text from response following the structure: result.response.candidates[0].content.parts[0].text
    const responseText = result.response.candidates[0].content.parts[0].text;
    console.log('✅ Completion response received, length:', responseText.length);
    console.log('✅ Completion response preview:', responseText.substring(0, 200) + '...');
    
    res.json({ 
      success: true,
      text: responseText
    });
  } catch (error) {
    console.error('❌ Error in completion:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.name
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
	console.log('🏥 Health check requested');

  // Check that Google credentials are still valid and the API is reachable.
  // We only refresh the token — no model call — to keep this lightweight.
  let aiStatus = 'ok';
  let aiError = null;
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token || (!token.token && typeof token !== 'string')) {
      aiStatus = 'error';
      aiError = 'Could not obtain access token';
    }
  } catch (err) {
    aiStatus = 'error';
    aiError = err.message;
    console.error('🏥 Health check — AI credential error:', err.message);
  }

	res.status(aiStatus === 'ok' ? 200 : 503).json({
		status: aiStatus === 'ok' ? 'OK' : 'DEGRADED',
		service: 'Teaching Simulator Backend',
    timestamp: new Date().toISOString(),
    project: PROJECT_ID,
    location: LOCATION,
    model: 'gemini-2.5-flash-lite',
    ai: aiStatus,
    ...(aiError ? { ai_error: aiError } : {})
  });
});

// Test endpoint for debugging
app.get('/api/test', async (req, res) => {
  try {
    console.log('🧪 Test endpoint called');
    
		const result = await withRetry(() => model.generateContent({
			contents: [{
				role: "user",
				parts: [{ text: "Say hello from Teaching Simulator backend!" }]
      }],
      generationConfig: {
        maxOutputTokens: 50,
        temperature: 0.5
      }
    }));

    // Check if response and candidates exist
    if (!result || !result.response || !result.response.candidates || result.response.candidates.length === 0) {
      console.error('❌ Invalid test response:', JSON.stringify(result, null, 2));
      throw new Error('No valid response from model in test endpoint');
    }

    // Extract text from response following the structure: result.response.candidates[0].content.parts[0].text
    const responseText = result.response.candidates[0].content.parts[0].text;
    console.log('✅ Test response:', responseText);
    
    res.json({ 
      success: true,
      message: 'Backend is working!',
      test_response: responseText
    });
  } catch (error) {
    console.error('❌ Test error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

if (ENABLE_CREDENTIAL_DEBUG) {
  console.log('🛡️  Credential debug route enabled via ENABLE_DEBUG_CREDENTIALS=true');

  app.get('/api/debug/credentials', async (req, res) => {
    const details = await fetchCredentialDetails();
    if (details.error) {
      console.error('❌ Credential debug error:', details.error);
      return res.status(500).json({
        success: false,
        error: details.error
      });
    }

    res.json({
      success: true,
      projectId: details.projectId,
      credentialType: details.credentialType,
      clientEmail: details.clientEmail,
      tokenAvailable: details.tokenAvailable,
      tokenLength: details.tokenLength,
      tokenExpiry: details.tokenExpiry
    });
  });
} else {
  console.log('🛡️  Credential debug route disabled (set ENABLE_DEBUG_CREDENTIALS=true to enable)');
}

// ==========================================
// FIREBASE / FIRESTORE ENDPOINTS
// ==========================================

// Save a complete conversation to Firestore
app.post('/api/conversations', async (req, res) => {
  try {
    console.log('💾 Saving conversation to Firestore');
    const conversationData = req.body;
    
    if (!conversationData.userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }
    
    const { conversationId, error } = await saveConversation(conversationData);
    
    if (error) {
      return res.status(500).json({
        success: false,
        error: error
      });
    }
    
    res.json({
      success: true,
      conversationId
    });
  } catch (error) {
    console.error('❌ Error saving conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add a message to an existing conversation
app.post('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const messageData = req.body;
    
    console.log(`💾 Adding message to conversation ${id}`);
    
    const { error } = await saveMessage(id, messageData);
    
    if (error) {
      return res.status(500).json({
        success: false,
        error: error
      });
    }
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('❌ Error adding message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create or update user profile
app.post('/api/users/:id/profile', async (req, res) => {
  try {
    const { id } = req.params;
    const profileData = req.body;
    
    console.log(`👤 Creating/updating profile for user ${id}`);
    
    const { error } = await createUserProfile(id, profileData);
    
    if (error) {
      return res.status(500).json({
        success: false,
        error: error
      });
    }
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('❌ Error creating/updating profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user profile
app.get('/api/users/:id/profile', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`👤 Getting profile for user ${id}`);
    
    const { profile, error } = await getUserProfile(id);
    
    if (error) {
      return res.status(404).json({
        success: false,
        error: error
      });
    }
    
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('❌ Error getting profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ── PCK Test Submissions ─────────────────────────────────────────────────────

// GET /api/test-submissions/check?userId=...&testType=pre|post
app.get('/api/test-submissions/check', async (req, res) => {
  try {
    const { userId, testType } = req.query;
    if (!userId || !testType) {
      return res.status(400).json({ success: false, error: 'userId and testType are required' });
    }
    const { submitted, error } = await checkTestSubmission(userId, testType);
    if (error) {
      return res.status(500).json({ success: false, error });
    }
    res.json({ success: true, submitted });
  } catch (error) {
    console.error('❌ Error checking test submission:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/test-submissions
app.post('/api/test-submissions', async (req, res) => {
  try {
    const { userId, testType, answers } = req.body;
    if (!userId || !testType || !answers) {
      return res.status(400).json({ success: false, error: 'userId, testType, and answers are required' });
    }
    if (!['pre', 'post'].includes(testType)) {
      return res.status(400).json({ success: false, error: 'testType must be "pre" or "post"' });
    }

    console.log(`📝 Saving ${testType}-test submission for user ${userId}`);
    const { submissionId, error } = await saveTestSubmission({ userId, testType, answers });

    if (error === 'already_submitted') {
      return res.status(409).json({ success: false, error: 'already_submitted' });
    }
    if (error) {
      return res.status(500).json({ success: false, error });
    }
    res.status(201).json({ success: true, submissionId });
  } catch (error) {
    console.error('❌ Error saving test submission:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Annotation endpoints (annotator-only) ────────────────────────────────────

// Helper: verify the caller is an annotator; returns 403 and false if not.
async function requireAnnotator(req, res) {
  const annotatorId = req.query.annotatorId || (req.body && req.body.annotatorId);
  if (!annotatorId) {
    res.status(400).json({ success: false, error: 'annotatorId is required' });
    return false;
  }
  const { isAnnotator, error } = await verifyAnnotator(annotatorId);
  if (error || !isAnnotator) {
    res.status(403).json({ success: false, error: 'access_denied' });
    return false;
  }
  return true;
}

// GET /api/test-submissions?annotatorId=...&testType=pre|post&status=pending|completed
app.get('/api/test-submissions', async (req, res) => {
  try {
    if (!await requireAnnotator(req, res)) return;
    const { testType, status, annotatorId } = req.query;
    const { submissions, error } = await getTestSubmissions({ testType, status, annotatorId });
    if (error) return res.status(500).json({ success: false, error });
    res.json({ success: true, submissions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/test-submissions/:id?annotatorId=...
app.get('/api/test-submissions/:id', async (req, res) => {
  try {
    if (!await requireAnnotator(req, res)) return;
    const { submission, error } = await getTestSubmission(req.params.id);
    if (error === 'not_found') return res.status(404).json({ success: false, error });
    if (error) return res.status(500).json({ success: false, error });
    res.json({ success: true, submission });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/test-annotations/:submissionId?annotatorId=...
// Returns THIS annotator's own annotation only.
app.get('/api/test-annotations/:submissionId', async (req, res) => {
  try {
    if (!await requireAnnotator(req, res)) return;
    const annotatorId = req.query.annotatorId;
    const { annotation, error } = await getTestAnnotation(req.params.submissionId, annotatorId);
    if (error) return res.status(500).json({ success: false, error });
    if (!annotation) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, annotation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/test-annotations/:submissionId/all?adminId=...
// Returns ALL annotators' annotations for a submission (admin only).
app.get('/api/test-annotations/:submissionId/all', async (req, res) => {
  try {
    const adminId = req.query.adminId;
    if (!adminId) return res.status(400).json({ success: false, error: 'adminId is required' });
    const { isAdmin, error: adminErr } = await verifyAdmin(adminId);
    if (adminErr || !isAdmin) return res.status(403).json({ success: false, error: 'access_denied' });

    const { annotations, error } = await getAllAnnotationsForSubmission(req.params.submissionId);
    if (error) return res.status(500).json({ success: false, error });
    res.json({ success: true, annotations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/test-annotations
app.post('/api/test-annotations', async (req, res) => {
  try {
    if (!await requireAnnotator(req, res)) return;
    const { submissionId, userId, testType, annotatorId, scores } = req.body;
    if (!submissionId || !userId || !testType || !annotatorId || !scores) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const { annotationId, error } = await saveTestAnnotation({ submissionId, userId, testType, annotatorId, scores });
    if (error) return res.status(500).json({ success: false, error });
    res.status(201).json({ success: true, annotationId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler - but serve index.html for non-API routes in production (React Router)
app.use((req, res) => {
  if (NODE_ENV === 'production' && !req.path.startsWith('/api')) {
    // Send React app for client-side routing
    res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
  } else {
    console.log('❓ 404 - Route not found:', req.path);
    res.status(404).json({
      success: false,
      error: 'Route not found',
      path: req.path
    });
  }
});

app.listen(PORT, () => {
	console.log(`🚀 Teaching Simulator backend running on http://localhost:${PORT}`);
  console.log('🔐 Using Service Account Authentication');
  console.log('🔑 Key file:', keyPath);
  console.log('🎯 Project:', PROJECT_ID);
  console.log('🌍 Location:', LOCATION);
  console.log('🤖 Model: gemini-2.5-flash-lite');
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /api/health - Health check');
  console.log('  GET  /api/test   - Test AI connection');
  if (ENABLE_CREDENTIAL_DEBUG) {
    console.log('  GET  /api/debug/credentials - Inspect service account identity');
  }
  console.log('  POST /api/generate - Chat completions');
  console.log('  POST /api/completion - Text completions');
  console.log('  POST /api/pck-feedback - PCK feedback analysis');
  console.log('  POST /api/pck-summary - PCK comprehensive summary');
  console.log('');
  console.log('Firebase/Firestore endpoints:');
  console.log('  POST /api/conversations - Save conversation');
  console.log('  POST /api/conversations/:id/messages - Add message');
  console.log('  POST /api/users/:id/profile - Create/update profile');
  console.log('  GET  /api/users/:id/profile - Get user profile');
});


