// Polyfill fetch API for Node.js 16 compatibility
import { fetch, Headers, Request, Response } from 'undici';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import { formatTaxonomyForPrompt, getPCKSkillById, formatConversationHistory } from './pck_taxonomy.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 image uploads

// Serve static frontend files in production
const buildPath = path.join(__dirname, '..', 'build');
console.log('📁 Serving static files from:', buildPath);
app.use(express.static(buildPath));

console.log('🔧 Initializing Vertex AI with Application Default Credentials...');

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const ENABLE_CREDENTIAL_DEBUG = process.env.ENABLE_DEBUG_CREDENTIALS === 'true';

// Initialize Vertex AI with Application Default Credentials
const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-flash-lite'
});

console.log('✅ Vertex AI initialized successfully');

const auth = new GoogleAuth({
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
    console.error('⚠️  Unable to load ADC details:', details.error);
  } else {
    console.log('🔐 ADC project ID:', details.projectId ?? '(unknown)');
    console.log('🔐 Credential type:', details.credentialType);
    console.log('🔐 Client email:', details.clientEmail ?? '(not provided)');
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
    
    // Format target PCK skills if available
    let targetSkillsText = "";
    if (scenario && scenario.target_pck_skills && Array.isArray(scenario.target_pck_skills)) {
      targetSkillsText = "\n## מיומנויות PCK שהתרחיש בודק:\n";
      scenario.target_pck_skills.forEach(skillId => {
        const skill = getPCKSkillById(skillId);
        if (skill) {
          targetSkillsText += `\n**${skill.skill_name.he}**\n`;
          targetSkillsText += `תיאור: ${skill.description.he}\n`;
          targetSkillsText += `מה לחפש:\n`;
          skill.indicators.forEach(ind => {
            targetSkillsText += `- ${ind}\n`;
          });
          
          if (skill.examples && skill.examples.positive) {
            targetSkillsText += `דוגמאות חיוביות:\n`;
            skill.examples.positive.forEach(ex => {
              targetSkillsText += `- "${ex.text}" (${ex.why})\n`;
            });
          }
          
          if (skill.examples && skill.examples.negative) {
            targetSkillsText += `דוגמאות שליליות:\n`;
            skill.examples.negative.forEach(ex => {
              targetSkillsText += `- "${ex.text}" (${ex.why})\n`;
            });
          }
          
          if (skill.common_teacher_mistakes) {
            targetSkillsText += `טעויות נפוצות של מורים:\n`;
            skill.common_teacher_mistakes.forEach(mistake => {
              targetSkillsText += `- ${mistake.mistake}: "${mistake.example}"\n`;
            });
          }
          targetSkillsText += "\n";
        }
      });
    }

    const pckPrompt = `אתה מומחה PCK (Pedagogical Content Knowledge) שמנתח מהלך הוראתי של מורה לגאומטריה.

## הקשר התרחיש
${scenario ? `
**רמת כיתה**: ${scenario.grade_level || 'חטיבת ביניים'}
**נושא**: ${scenario.name || 'גאומטריה'}
**מטרות השיעור**: ${scenario.lesson_goals || 'לא צוין'}
**תפיסה שגויה ממוקדת**: ${scenario.misconception_focus || 'לא צוין'}
` : 'אין הקשר תרחיש'}
${targetSkillsText}
${scenario && scenario.optimal_response_pattern ? `
## דפוסי תגובה אופטימליים של מורה:
${scenario.optimal_response_pattern}
` : ''}
${scenario && scenario.common_teacher_mistakes ? `
## טעויות נפוצות של מורים שיש להימנע מהן:
${scenario.common_teacher_mistakes}
` : ''}

## היסטוריית השיחה:
${conversationHistoryText}

## ההודעה האחרונה של המורה שיש לנתח:
"${teacherMessage}"

${feedbackHistory && feedbackHistory.length > 0 ? `
## 📊 היסטוריית משוב קודמת (${feedbackHistory.length} תורות אחרונים):
${feedbackHistory.map((fb, idx) => `
**תור ${feedbackHistory.length - idx} לפני כעת:**
- איכות פדגוגית: ${fb.pedagogical_quality}
- הודעת משוב: "${fb.feedback_message_hebrew}"
- רמת הבנה חזויה: ${fb.predicted_student_state && fb.predicted_student_state.understanding_level}
`).join('\n')}

⚠️ **כללי התמדה (Persistence Rules):**
- אם אותה בעיה מתודולוגית חוזרת על עצמה ללא תיקון מפורש מהמורה, אסור שהמשוב ישתפר מ"problematic" ל"neutral" או "positive"
- משוב צריך להתרכך רק אחרי מהלך תיקון מפורש (כגון: חזרה להגדרה פורמלית, בדיקה שיטתית)
- אם היו 2+ משובים שליליים/בעייתיים רצופים, תן ל-predicted_student_state אינדיקציה להגברת הביטוי (frustrated/challenge_logic)
` : ''}

---

## המשימה שלך:
נתח את ההודעה האחרונה של המורה וספק תגובה JSON מפורטת עם המבנה הבא:

\`\`\`json
{
  "pedagogical_quality": "positive" | "neutral" | "problematic",
  "addressed_misconception": true/false,
  "how_addressed": "בעברית: הסבר קצר איך המורה התייחס/לא התייחס לתפיסה המוטעית",
  "misconception_risk": "low" | "medium" | "high",
  "demonstrated_skills": [
    {"skill_id": "...", "evidence": "ציטוט או תיאור"}
  ],
  "missed_opportunities": [
    {"skill_id": "...", "what_could_have_been_done": "בעברית: מה היה כדאי לעשות"}
  ],
  "predicted_student_state": {
    "understanding_level": "improved" | "same" | "confused" | "more_confused",
    "likely_reactions": ["תגובה אפשרית 1", "תגובה אפשרית 2"],
    "who_should_respond": ["שם תלמיד 1", "שם תלמיד 2"],
    "response_tone": "confident" | "hesitant" | "confused" | "frustrated"
  },
  "feedback_message_hebrew": "משוב קצר למורה בעברית (2-3 משפטים)",
  "scenario_alignment": {
    "moving_toward_goals": true/false,
    "alignment_score": 0-100
  }
}
\`\`\`

## 🎯 כללי כיול משוב - CRITICAL CALIBRATION RULES:

### 1️⃣ זיהוי "רעיון נכון אבל ביצוע רך" (Right Idea, Soft Execution):
**אל תסמן כ-"positive" אם:**
- המורה אומר דברים נכונים אבל לא משתמש בהגדרות פורמליות
- המורה מכוון בכיוון הנכון אבל לא מבקש בדיקה לוגית שיטתית
- המורה נותן הסבר חלקי ללא השלמה מדויקת

**בדוגמאות אלו, השתמש ב-"neutral" ולא "positive":**
- "יש לו את התכונות של מלבן" (נכון, אבל לא התייחס להגדרה)
- "נראה שזה מתאים" (אינטואיציה, לא בדיקה שיטתית)
- "נכון, יש פה משהו דומה" (כיוון נכון, אבל לא מדויק)

**השתמש ב-"positive" רק אחרי מהלך תיקון מפורש:**
- המורה חזר להגדרה הפורמלית: "מה ההגדרה של מלבן?"
- המורה ביקש בדיקה שיטתית: "בואו נבדוק האם מקיים כל תנאי ההגדרה"
- המורה הנחה את התלמיד לגלות לוגית: "איזה תנאים חייבים להתקיים?"

### 2️⃣ זיהוי והענשה של "נטישה אפיסטמית" (Epistemic Abdication):
**ביטויים שחייבים לגרום ל-"problematic" באופן מהימן:**
- "לא צריך להיתקע על זה" (הקלה על דיוק)
- "זה רק רעיון כללי" (החלפת הגדרה לוגית באינטואיציה)
- "זה לא כל כך חשוב" (התייחסות לנכונות כאופציונלית)
- "סתם תסמכו עליי" (סמכותיות במקום הסבר)
- "זה יותר תחושה" (יחסותיות במתמטיקה)
- "אל תחשבו על זה יותר מדי" (דיכוי חשיבה ביקורתית)
- "זה סבבה גם ככה" (התייחסות לדיוק כרצוי ולא הכרחי)

**אלו אינן סתם טעויות - הן סותרות את טבע המתמטיקה!**
כאשר מורה משתמש בשפה כזו:
- pedagogical_quality: "problematic"
- feedback_message חייב להתייחס לבעיה זו במפורש
- missed_opportunities צריך לכלול את המיומנות הרלוונטית

### 3️⃣ הסלמת תגובות תלמידים אחרי משוב שלילי מתמשך:
אם feedbackHistory מראה 2+ תורות רצופות עם pedagogical_quality: "problematic":
- הוסף ל-predicted_student_state.response_tone: "frustrated" או "challenging"
- הוסף ל-predicted_student_state.likely_reactions ביטויים כמו:
  • "אני לא בטוח שהבנתי את מה שאמרת"
  • "זה לא ממש עונה על השאלה שלי"
  • "רגע, איך זה קשור למה ששאלתי?"
  
**חשוב:** אל תשנה את כללי בחירת התלמידים או את הפרסונות - רק הגבר את עוצמת הביטוי.

## 🚨 הנחיות קריטיות לזיהוי מיומנויות PCK:

**כללי יסוד:**
1. **לא כל תגובה טובה = מיומנות PCK ספציפית!** רוב התגובות של המורה הן המשך שיחה רגיל.
2. **demonstrated_skills צריך להיות ריק [] ברוב המקרים!**
3. זהה מיומנות רק אם **כל התנאים הבאים מתקיימים**:

**תנאים לזיהוי מיומנות (חייבים להתקיים ביחד):**

א. **התלמיד הציג טעות או תפיסה שגויה** בתור הנוכחי או הקודם
   - אם התלמיד לא הציג טעות - אין מיומנות לזהות!
   - המשך שיחה רגיל אינו מזדמנות לזיהוי מיומנות

ב. **התגובה של המורה מכוונת ספציפית לטיפול בטעות זו**
   - לא רק "המשיך הלאה"
   - לא רק "אמר משהו טוב"
   - אלא: התייחס ישירות לתפיסה השגויה

ג. **המורה הפגין לפחות אחד מה"אינדיקטורים" המפורטים למעלה**
   - בדוק את רשימת האינדיקטורים של המיומנות
   - האם המורה עשה בדיוק מה שרשום שם?
   - אם לא - אין זיהוי מיומנות

**דוגמאות לזיהוי נכון:**

✅ **כן - יש לזהות מיומנות:**
- תלמיד: "אבל זה ריבוע, לא מלבן"
- מורה: "בואו נבדוק - מה ההגדרה של מלבן?"
- ← זיהוי מיומנות! המורה שואל על ההגדרה (אינדיקטור) בתגובה לטעות

✅ **כן - יש לזהות מיומנות:**
- תלמיד: "זה חייב להיות מעויין כי האלכסונים מאונכים"
- מורה: "נכון שבמעויין האלכסונים מאונכים. אבל האם זו הצורה היחידה?"
- ← זיהוי מיומנות! המורה מזהה את החלק הנכון ומערער (אינדיקטור)

❌ **לא - אין לזהות מיומנות:**
- מורה: "היום נדבר על מלבנים וריבועים"
- ← אין טעות של תלמיד, אין זיהוי מיומנות

❌ **לא - אין לזהות מיומנות:**
- תלמיד: "אוקיי, הבנתי"
- מורה: "מעולה, בואו נמשיך"
- ← אין טעות, רק המשך שיחה

❌ **לא - אין לזהות מיומנות:**
- תלמיד: "למה ריבוע נחשב מלבן?"
- מורה: "כי יש לו את כל התכונות של מלבן"
- ← תשובה טובה אבל לא מפגינה אינדיקטור ספציפי (לא שואל על הגדרה, לא מכוון לבדיקה לוגית)

**תדירות צפויה:**
- בשיחה רגילה: demonstrated_skills יהיה ריק [] ב-70-80% מהמקרים
- רק כאשר יש **אירוע ספציפי** של טיפול בתפיסה שגויה - זהה מיומנות

**missed_opportunities:**
- זהה רק כאשר התלמיד הציג טעות והמורה **לא טיפל בה בכלל** או טיפל בצורה בעייתית
- אם המורה פשוט מדבר על נושא אחר - אין missed opportunity

**predicted_student_state - CRITICAL FOR CONVERSATION FLOW:**

ה-understanding_level חייב לשקף באופן מדויק את איכות ההוראה **בתור הנוכחי**:

- **"improved"** - השתמש כאשר המורה ביצע מהלך תיקון מפורש:
  • המורה חזר להגדרה פורמלית במפורש
  • המורה ביקש בדיקה שיטתית של תנאים
  • המורה כיוון לגלות לוגית באמצעות שאלות מכוונות
  • ההסבר מתאים לגיל, מדויק, ועונה על השאלה
  
- **"same"** - השתמש כאשר:
  • המורה אומר דברים נכונים אבל ללא שימוש בהגדרות פורמליות
  • המורה מכוון בכיוון הנכון אבל לא מבקש בדיקה שיטתית
  • המורה נותן הסבר חלקי ("רעיון נכון, ביצוע רך")
  • המורה ממשיך הלאה בלי לטפל ישירות בשאלה
  
- **"confused" / "more_confused"** - השתמש כאשר:
  • המורה הפגין "נטישה אפיסטמית" (ראה סעיף 2 למעלה)
  • המורה נתן הסבר מבלבל או סתמי
  • המורה השתמש בשפה לא מותאמת
  • המורה תיקן בצורה סמכותית בלי הסבר
  • המורה ממשיך בבעיה מתודולוגית מתור קודם

⚠️ **עקרונות מאזן:**
- אם המורה הסביר טוב עם שימוש בהגדרות/בדיקה שיטתית → חובה "improved" (מניעת לולאות)
- אם המורה אמר דברים נכונים אבל ללא דיוק פורמלי → "same" (לא "improved")
- אל תניח תיקון עתידי בעת הערכת התור הנוכחי

**הנחיות נוספות:**
- השתמש ב-skill_id בדיוק כפי שמופיע למעלה
- ב-evidence: צטט בדיוק מה המורה אמר שמתאים לאינדיקטור
- התמקד ב-feedback_message_hebrew - זה מה שהמורה יראה!
- היה שמרן ומדויק בזיהוי מיומנויות
- **אבל היה נדיב ב-understanding_level כאשר המורה מלמד טוב באמת!**
- **אל תחליש משוב חיובי כאשר ההוראה חזקה באמת**
- **אל תניח תיקון עתידי - הערך רק את התור הנוכחי**
- **אם יש התמדה של אותה בעיה - אל תרכך את המשוב**

תשובה JSON בלבד, ללא טקסט נוסף:`;

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
    
    // Validate the structure
    if (!analysis.pedagogical_quality || !analysis.predicted_student_state) {
      console.warn('⚠️ Incomplete analysis structure, filling in defaults');
      analysis = {
        pedagogical_quality: analysis.pedagogical_quality || 'neutral',
        addressed_misconception: analysis.addressed_misconception || false,
        how_addressed: analysis.how_addressed || 'לא ניתן לקבוע',
        misconception_risk: analysis.misconception_risk || 'medium',
        demonstrated_skills: analysis.demonstrated_skills || [],
        missed_opportunities: analysis.missed_opportunities || [],
        predicted_student_state: analysis.predicted_student_state || {
          understanding_level: 'same',
          likely_reactions: [],
          who_should_respond: [],
          response_tone: 'neutral'
        },
        feedback_message_hebrew: analysis.feedback_message_hebrew || 'המורה התקדם בשיעור',
        scenario_alignment: analysis.scenario_alignment || {
          moving_toward_goals: true,
          alignment_score: 50
        }
      };
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

    // Build comprehensive conversation summary for analysis
    const conversationText = conversationLog.turns.map((turn, index) => {
      let turnText = `\n--- תור ${turn.turnNumber} ---\n`;
      turnText += `מורה: ${turn.teacher.message}\n`;
      turnText += turn.students.map(s => `${s.name}: ${s.message}`).join('\n');
      if (turn.pckFeedback) {
        turnText += `\n[משוב מיידי: ${turn.pckFeedback.feedback_message}]`;
      }
      return turnText;
    }).join('\n');

    // Get target PCK skills for this scenario
    let targetPCKSkillsText = "";
    if (conversationLog.scenario.target_pck_skills && conversationLog.scenario.target_pck_skills.length > 0) {
      targetPCKSkillsText = "\n## מיומנות PCK מרכזית לתרחיש זה:\n";
      conversationLog.scenario.target_pck_skills.forEach(skillId => {
        const skill = getPCKSkillById(skillId);
        if (skill) {
          targetPCKSkillsText += `\n**${skill.skill_name.he}**\n`;
          targetPCKSkillsText += `תיאור: ${skill.description.he}\n`;
          targetPCKSkillsText += `מה מצפים מהמורה:\n`;
          skill.indicators.forEach(ind => {
            targetPCKSkillsText += `- ${ind}\n`;
          });
        }
      });
    }
    
    // Comprehensive PCK analysis prompt
    const summaryPrompt = `אתה מומחה בידע תוכן פדגוגי (PCK) בגיאומטריה. תפקידך לספק ניתוח מקיף אך תמציתי של ביצועי המורה בשיחה זו.

**הקשר השיעור:**
${conversationLog.scenario.text}

**מטרות השיעור:**
${conversationLog.scenario.lesson_goals || 'לא צוין'}

**תפיסה שגויה שהשיעור התמקד בה:**
${conversationLog.scenario.misconception_focus || 'לא צוין'}

${targetPCKSkillsText}

**השיחה המלאה (${conversationLog.turns.length} תגובות):**
${conversationText}

**סטטיסטיקה:**
- תגובות מורה: ${conversationLog.stats.totalTeacherMessages}
- תגובות תלמידים: ${conversationLog.stats.totalStudentMessages}
- משך זמן: ${conversationLog.stats.durationMinutes || 'לא צוין'} דקות

---

**הנחיות לניתוח:**

1. **התמקד בעיקר במיומנות ה-PCK המרכזית** שהוגדרה למעלה - האם המורה הפגין אותה?
2. **אך אל תהיה מוגבל רק לזה** - אתה יכול לדבר גם על היבטים כלליים של ההוראה
3. **התאם את הניתוח לשיחה הספציפית** - אל תכפה מבנה נוקשה
4. **אם המורה הפגין את המיומנות - תן קרדיט. אם לא - הסבר מה חסר**
5. **היה אמיתי** - לא כל שיחה צריכה 2 דברים טובים ו-2 רעים
6. **דוגמאות ספציפיות** מהשיחה - ציטוטים, התנהגויות
7. **טיפים קצרים וממוקדים** - לא לחזור על אותו דבר

---

**פורמט הניתוח (בעברית):**

## 📊 ניתוח כללי

[פסקה ראשונה: סיכום כללי של מה ראית בשיחה - איך המורה התמודד עם התלמידים, מה היה טוב, מה פחות. התמקד במיומנות ה-PCK המרכזית אם רלוונטי]

[פסקה שנייה: הערכה מעמיקה יותר - האם המורה הצליח להגיע למטרות השיעור? איך טיפל בתפיסה השגויה? מה בלט בגישה שלו?]

## 💡 טיפים לשיפור

- [טיפ קצר וממוקד 1]
- [טיפ קצר וממוקד 2]
- [טיפ קצר וממוקד 3]
- [אם יש עוד משהו חשוב - טיפ 4]

---

**חשוב**: 
- אל תכתוב "מה עשית טוב" ו"מה ניתן לשפר" כשני חלקים נפרדים - שלב הכל בפסקאות
- הטיפים צריכים להיות פרקטיים וישימים, לא רק חזרה על מה שכתבת בפסקאות
- היה תמציתי - 2 פסקאות + 3-4 נקודות טיפים
- אם המיומנות המרכזית לא התבטאה - חשוב להדגיש את זה ולהסביר למה זה היה חשוב כאן`;

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
      summary: summaryText.trim(),
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

// Catch-all route: serve index.html for any non-API routes (React Router support)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(buildPath, 'index.html'));
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

// 404 handler
app.use((req, res) => {
  console.log('❓ 404 - Route not found:', req.path);
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// app.listen(PORT, () => {
// 	console.log(`🚀 Teaching Simulator backend running on http://localhost:${PORT}`);
//   console.log('🔐 Using Application Default Credentials from gcloud');
//   console.log('🎯 Project:', PROJECT_ID);
//   console.log('🌍 Location:', LOCATION);
//   console.log('🤖 Model: gemini-2.5-flash-lite');
//   console.log('');
//   console.log('Available endpoints:');
//   console.log('  GET  /api/health - Health check');
//   console.log('  GET  /api/test   - Test AI connection');
//   if (ENABLE_CREDENTIAL_DEBUG) {
//     console.log('  GET  /api/debug/credentials - Inspect ADC identity');
//   }
//   console.log('  POST /api/generate - Chat completions');
//   console.log('  POST /api/completion - Text completions');
//   console.log('  POST /api/pck-feedback - PCK feedback analysis');
//   console.log('  POST /api/pck-summary - PCK comprehensive summary');
// });


// Check if SSL certificates exist (production) or use HTTP (development)
const sslKeyPath = path.join(__dirname, 'server.key');
const sslCertPath = path.join(__dirname, 'server.cert');

if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
  // Production: HTTPS
  const httpsOptions = {
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath)
  };

  https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`🚀 Teaching Simulator running on https://localhost:${PORT}`);
    console.log('🔐 Using HTTPS with SSL certificate');
    console.log('🔐 Using Application Default Credentials from gcloud');
    console.log('🎯 Project:', PROJECT_ID);
    console.log('🌍 Location:', LOCATION);
    console.log('🤖 Model: gemini-2.5-flash-lite');
    console.log('📁 Serving frontend from:', buildPath);
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET  / - Frontend application');
    console.log('  GET  /api/health - Health check');
    console.log('  GET  /api/test   - Test AI connection');
    if (ENABLE_CREDENTIAL_DEBUG) {
      console.log('  GET  /api/debug/credentials - Inspect ADC identity');
    }
    console.log('  POST /api/generate - Chat completions');
    console.log('  POST /api/completion - Text completions');
    console.log('  POST /api/pck-feedback - PCK feedback analysis');
    console.log('  POST /api/pck-summary - PCK comprehensive summary');
  });
} else {
  // Development: HTTP (fallback if no certificates)
  app.listen(PORT, () => {
    console.log(`🚀 Teaching Simulator backend running on http://localhost:${PORT}`);
    console.log('⚠️  No SSL certificates found - running in HTTP mode');
    console.log('⚠️  Generate certificates with: openssl req -nodes -new -x509 -keyout server.key -out server.cert');
    console.log('🔐 Using Application Default Credentials from gcloud');
    console.log('🎯 Project:', PROJECT_ID);
    console.log('🌍 Location:', LOCATION);
    console.log('🤖 Model: gemini-2.5-flash-lite');
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET  /api/health - Health check');
    console.log('  GET  /api/test   - Test AI connection');
    if (ENABLE_CREDENTIAL_DEBUG) {
      console.log('  GET  /api/debug/credentials - Inspect ADC identity');
    }
    console.log('  POST /api/generate - Chat completions');
    console.log('  POST /api/completion - Text completions');
    console.log('  POST /api/pck-feedback - PCK feedback analysis');
    console.log('  POST /api/pck-summary - PCK comprehensive summary');
  });
}