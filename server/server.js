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
import { formatTaxonomyForPrompt, getPCKSkillById, formatConversationHistory } from './pck_taxonomy.js';
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
    
    const result = await model.generateContent({
      contents,
      generationConfig
    });

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
    
    // Import universal PCK skills
    const { formatSkillsForPrompt } = require('./universal_pck_skills');
    const universalSkillsText = formatSkillsForPrompt();

    const pckPrompt = `You are a PCK (Pedagogical Content Knowledge) expert analyzing a Hebrew geometry teacher's pedagogical moves in real-time.

## Lesson Context
${scenario ? `
**Grade Level**: ${scenario.grade_level || 'Middle School'}
**Topic**: ${scenario.name || 'Geometry'}
**Lesson Goals**: ${scenario.lesson_goals || 'Not specified'}
**Target Misconception**: ${scenario.misconception_focus || 'Not specified'}
` : 'No scenario context provided'}

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
- "same" = Correct content but no formal precision, or partial explanation
- "confused"/"more_confused" = Incorrect info, confusing explanation, or authoritative correction without explanation

### PART B: TEACHER FEEDBACK (CONDITIONAL)

## 🚦 PHASE 1: Should Feedback Be Provided?

Provide feedback ONLY if one or more conditions is true:
1. ❌ Teacher gave factually incorrect information
2. ❌ Student showed clear misconception and teacher didn't respond appropriately
3. ❌ Teacher used problematic approach (authoritative correction, "don't think about it", epistemic abdication)
4. ✅ Teacher demonstrated exceptionally strong PCK skill use (worth praising)
5. 🔄 Clear opportunity to use a PCK skill was missed

**Examples of NO FEEDBACK needed:**
- "שלום, היום נדבר על משולשים" (procedural talk)
- "אוקיי, בואו נמשיך" (normal flow)
- Student correct + teacher acknowledges

**Examples of FEEDBACK needed:**
- Student: "ריבוע זה לא מלבן" + Teacher: "נכון" (incorrect content!)
- Student shows misconception + Teacher ignores it
- Teacher: "אל תחשבו על זה יותר מדי" (epistemic abdication)

## 🎯 PHASE 2: Score Relevant PCK Skills (only if Phase 1 = true)

**CRITICAL: RELEVANCE vs. PERFORMANCE**

For EACH of the 5 skills:

**STEP 1: Is this skill RELEVANT in this turn?**
- Is there a situation calling for this skill?
- Could the teacher have used it here?

If NO → Mark is_relevant: false, provide reason_not_relevant
If YES → Continue to STEP 2

**STEP 2: Score performance (0, 1, or 2)**
- Score 2: Excellent use matching rubric
- Score 1: Partial or indirect use
- Score 0: Should have used but didn't, or used poorly

**Examples:**
❌ WRONG: "Teacher said 'Hello' → error-identification: score 0"
✅ RIGHT: "Teacher said 'Hello' → error-identification: is_relevant=false (no error present)"

✅ CORRECT: "Student made error, teacher ignored → error-identification: is_relevant=true, score=0"
✅ CORRECT: "Student made error, teacher identified well → error-identification: is_relevant=true, score=2"

**Important:** Most turns have 0-2 relevant skills, not all 5!

---

## Expected JSON Response

\`\`\`json
{
  "pedagogical_quality": "positive" | "neutral" | "problematic",
  "predicted_student_state": {
    "understanding_level": "improved" | "same" | "confused" | "more_confused",
    "likely_reactions": ["reaction 1 in Hebrew", "reaction 2"],
    "who_should_respond": ["student name 1", "student name 2"],
    "response_tone": "confident" | "hesitant" | "confused" | "frustrated" | "thoughtful"
  },
  
  "should_provide_feedback": true/false,
  "feedback_trigger": "student_misconception_not_addressed" | "incorrect_content" | "epistemic_abdication" | "excellent_pck_use" | "missed_opportunity" | null,
  
  "skills_assessment": [
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
  
  "feedback_message_hebrew": "Feedback in Hebrew (2-3 sentences)" // only if should_provide_feedback = true
}
\`\`\`

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
    
    const result = await model.generateContent({
      contents,
      generationConfig
    });

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
        likely_reactions: [],
        who_should_respond: [],
        response_tone: 'neutral'
      };
    }
    
    // Ensure new fields have defaults
    if (analysis.should_provide_feedback === undefined) {
      analysis.should_provide_feedback = false;
    }
    
    if (!analysis.skills_assessment) {
      analysis.skills_assessment = [];
    }
    
    if (!analysis.feedback_message_hebrew && analysis.should_provide_feedback) {
      analysis.feedback_message_hebrew = 'המורה התקדם בשיעור';
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
            pckMomentsText += `  - ${skill.skill_id}: ${scoreLabel}\n`;
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
${conversationLog.scenario.text || 'Geometry lesson'}

**Lesson Goals:** ${conversationLog.scenario.lesson_goals || 'Not specified'}
**Target Misconception:** ${conversationLog.scenario.misconception_focus || 'Not specified'}

## Full Conversation (${conversationLog.turns.length} turns)
${conversationText}

${pckMomentsText}

## Statistics
- Teacher messages: ${conversationLog.stats.totalTeacherMessages}
- Student messages: ${conversationLog.stats.totalStudentMessages}

---

## Your Task: Create an ADAPTIVE-LENGTH summary in Hebrew

**Length Guidelines (PROPORTIONAL to content):**

### If 0-2 PCK moments (short conversation/test):
- 2-3 sentences ONLY
- "בשיחה קצרה זו [what happened]. [one sentence about what was good/could improve]"
- DO NOT write a long summary if there's nothing to discuss!

### If 3-5 PCK moments (medium conversation):
- One paragraph (4-6 lines) + 2-3 focused tips
- Focus on main moments

### If 6+ PCK moments (full conversation):
- 2 paragraphs (each 5-7 lines) + 3-5 tips
- Deeper analysis of patterns
- But NO MORE than one page!

---

## Summary Structure (adapt length)

**If short conversation (0-2 moments):**
"בשיחה קצרה זו [what happened]. [one point for improvement or reinforcement]."

**If medium or long conversation:**

### סיכום כללי
[1-2 paragraphs adapted to conversation length, in Hebrew]

Naturally integrate:

**Score 2 (Excellent):**
- "בתור X זיהית מצוין..."
- "הצלחת לזהות..."
- "גישה טובה כאשר..."

**Score 1 (Partial - acknowledge but explain how to improve):**
- "בתור Y התחלת טוב בכך ש-[what you did], אבל [how to complete]"
- "ניסית ל-[X] אבל הייתה הזדמנות ל-[Y]"

**Score 0 (Missed - explain what's missing):**
- "בתור Z התלמיד [what happened] אבל לא התייחסת. היה חשוב לזהות ש-[what should have been done]"
- "הוחמצה הזדמנות כאשר [situation] - כדאי היה [action]"

### טיפים לשיפור (if relevant)
- [Focused tip 1 - only if there's something to say]
- [Focused tip 2]
- [Focused tip 3 - if needed]

---

## Critical Rules

1. **Adapt length to content:**
   - 2-3 turn conversation → 2-3 sentences
   - Long conversation with many PCK moments → up to one page
   
2. **Do not fabricate content:**
   - If there weren't many PCK moments - don't write a long summary
   - Don't repeat the same thing in different phrasings to fill space
   
3. **Focus on what's relevant:**
   - Only discuss moments where skills were relevant
   - Don't discuss skills that weren't relevant at all
   
4. **Be specific:**
   - Quote examples from the conversation
   - Reference specific turns when relevant
   - Avoid vague generalizations
   
5. **Real balance:**
   - If everything was good - say so
   - If there were problems - focus on them
   - Don't force a "50% positive 50% negative" structure
   
6. **Natural Hebrew language:**
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
    
    const result = await model.generateContent({
      contents,
      generationConfig
    });

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
    
    res.json({ 
      success: true,
      summary: {
        summary_text: summaryText.trim(),
        metadata: {
          conversation_length: pckMoments.length <= 2 ? 'short' : pckMoments.length <= 5 ? 'medium' : 'long',
          pck_moments_count: pckMoments.length,
          total_turns: conversationLog.turns.length
        }
      },
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
    
    const result = await model.generateContent({
      contents,
      generationConfig
    });

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
app.get('/api/health', (req, res) => {
	console.log('🏥 Health check requested');
	res.json({
		status: 'OK',
		service: 'Teaching Simulator Backend',
    timestamp: new Date().toISOString(),
    project: PROJECT_ID,
    location: LOCATION,
    model: 'gemini-2.5-flash-lite'
  });
});

// Test endpoint for debugging
app.get('/api/test', async (req, res) => {
  try {
    console.log('🧪 Test endpoint called');
    
		const result = await model.generateContent({
			contents: [{
				role: "user",
				parts: [{ text: "Say hello from Teaching Simulator backend!" }]
      }],
      generationConfig: {
        maxOutputTokens: 50,
        temperature: 0.5
      }
    });

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


