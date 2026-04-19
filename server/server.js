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
import { saveConversation, saveMessage, createUserProfile, getUserProfile } from './services/firebaseAdmin.js';

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
${feedbackHistory.map((fb, idx) => `
**Turn ${feedbackHistory.length - idx} ago:**
- Pedagogical quality: ${fb.pedagogical_quality}
- Feedback: "${fb.feedback_message_hebrew}"
- Understanding level: ${fb.predicted_student_state && fb.predicted_student_state.understanding_level}
`).join('\n')}

⚠️ **Persistence Rules:**
If the same problem repeats without explicit correction, don't soften feedback from "problematic" to "neutral".
If 2+ consecutive problematic turns, set response_tone to "frustrated" or "challenging".
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

**🚨 CRITICAL RULE: NO FEEDBACK unless a STUDENT has made an ERROR/MISCONCEPTION**

The 5 PCK skills are about handling student errors. Without a student error, there's nothing to assess.

**Taxonomy-first rule:**
- Analyze the teacher using the universal PCK taxonomy and the actual interaction evidence
- Do NOT expect one exact teacher sentence or one exact pedagogical move
- Do NOT penalize a teacher just because they used a different valid move than the scenario's common pattern
- Use the scenario context only to understand the lesson setting and the likely misconception
- If the teacher responds effectively in another pedagogically sound way, score that positively based on evidence

**Required conditions for providing feedback (ALL must be true):**
1. ✅ At least one STUDENT has already responded in the conversation
2. ✅ That student showed an error, misconception, or incorrect reasoning
3. ✅ The teacher's response is being analyzed for how they handled (or didn't handle) that error

**Then assess if:**
- ❌ Teacher gave incorrect information responding to the error
- ❌ Teacher didn't address the student's misconception appropriately  
- ❌ Teacher used problematic approach (authoritative without explanation, epistemic abdication)
- ✅ Teacher demonstrated strong PCK skill in addressing the error (praise-worthy)
- 🔄 Teacher missed opportunity to address the error properly

**❌ NEVER provide feedback when:**
- Teacher is opening the lesson → No student errors yet
- Teacher is asking a question → Waiting for student response
- Teacher is explaining content → No error to address
- Student answered CORRECTLY → No pedagogical issue
- General procedural talk: "שלום", "בואו נתחיל", "אוקיי", "מעולה"
- Teacher asking students what they know → This is normal teaching, not error handling

**✅ ONLY provide feedback when:**
- Student made an error/showed misconception → Teacher responded (assess how)
- Student showed confusion about concept → Teacher addressed it (assess quality)
- Student used incorrect logic → Teacher handled it (assess approach)

**Clear Examples:**

❌ NO FEEDBACK - Teacher opening:
"שלום לכולם! היום נלמד על ריבועים. איזה תכונות של ריבוע אתם מכירים?"
→ should_provide_feedback: false
→ Reason: No student has responded yet. No error to address. Normal lesson opening.

❌ NO FEEDBACK - Teacher asking question:
"בואו נבדוק: מה ההגדרה של מלבן?"
→ should_provide_feedback: false  
→ Reason: Teacher asking question. No student error present. Normal teaching.

❌ NO FEEDBACK - Student correct:
Student: "ריבוע יש לו 4 צלעות שוות ו-4 זוויות ישרות"
Teacher: "נכון מאוד! תשובה מעולה"
→ should_provide_feedback: false
→ Reason: Student correct, no pedagogical issue to assess.

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

**CRITICAL: RELEVANCE vs. PERFORMANCE**

For EACH of the 5 skills, determine:

**STEP 1: Is this skill RELEVANT in this specific turn?**

All 5 skills are about handling student errors. Ask:
- Did a student make an error/show misconception in this conversation?
- Is the teacher's response addressing that error?
- Does this particular skill apply to how they're handling it?

If NO → Mark is_relevant: false, provide reason_not_relevant
If YES → Continue to STEP 2

**STEP 2: How well did teacher perform? (Score 0, 1, or 2)**
Use the rubrics from the Universal PCK Skills above:
- Score 2: Excellent use matching rubric criteria
- Score 1: Partial or indirect use  
- Score 0: Should have used but didn't, or used poorly

**Remember:** In most turns, ALL 5 skills will be is_relevant: false because there's no student error!

---

## Deriving demonstrated_skills and missed_opportunities

After filling in \`skills_assessment\`, derive these two fields:
- \`demonstrated_skills\`: copy every entry where \`is_relevant: true\` AND \`score >= 1\`. Include only \`skill_id\` and \`evidence\`.
- \`missed_opportunities\`: copy every entry where \`is_relevant: true\` AND \`score = 0\`. Include only \`skill_id\` and \`what_could_be_better\` (renamed to \`what_could_have_been_done\`).
- If no skills are relevant (no student error present), both arrays must be \`[]\`.

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
    { "skill_id": "error-identification", "evidence": "Hebrew: what the teacher did that shows this skill" }
  ],
  "missed_opportunities": [
    // Skills where is_relevant=true AND score = 0. Empty array [] if none.
    { "skill_id": "error-leveraging", "what_could_have_been_done": "Hebrew: what the teacher could have done" }
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
      "evidence": "Teacher response in Hebrew showing what they did",
      "what_could_be_better": "Hebrew: how to improve" // only if score < 2
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

**The feedback message MUST explicitly name the relevant PCK skill** using its Hebrew name.
The 5 skills and their Hebrew names are:
- error-identification → "זיהוי השגיאה"
- error-characterization → "אפיון סוג השגיאה"
- diagnostic-interpretation → "פרשנות אבחונית של חשיבת התלמיד"
- adapted-pedagogical-response → "תגובה פדגוגית מותאמת"
- error-leveraging → "מינוף השגיאה ללמידה"

To find which skill(s) to name: use the skill(s) from \`demonstrated_skills\` (for positive feedback) or \`missed_opportunities\` (for problematic feedback). If multiple skills apply, name the most prominent one.

**Structure when should_provide_feedback = true:**

If pedagogical_quality = "positive":
→ Write 1-2 validating sentences.
→ Sentence 1: Name the skill demonstrated and what the teacher specifically did.
→ Format: "[skill name Hebrew]: [what the teacher did, closely paraphrased]."
→ Example: "זיהוי השגיאה: זיהית שהתלמיד מבלבל בין תנאי הכרחי למספיק ושאלת שאלה שמחזירה אותו להגדרה — מצוין."

If pedagogical_quality = "problematic":
→ Write 2-3 sentences structured as:
   (1) Open with: "הוחמצה הזדמנות ל[skill name Hebrew]:" — this prefix makes the critical tone immediately clear.
   (2) State what the student's error was and what the teacher did or failed to do.
   (3) Give one concrete alternative move: "במקום זאת, אפשר היה לשאול/לומר: '...'"
→ Example: "הוחמצה הזדמנות לתגובה פדגוגית מותאמת: התלמיד טען שריבוע אינו מלבן, אך המורה אישר את הטענה מבלי להפנות אותו להגדרה. במקום זאת, אפשר היה לשאול: 'מה ההגדרה של מלבן? האם ריבוע מקיים אותה?'"

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


