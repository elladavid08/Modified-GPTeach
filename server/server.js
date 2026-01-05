// Polyfill fetch API for Node.js 16 compatibility
import { fetch, Headers, Request, Response } from 'undici';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

import express from 'express';
import cors from 'cors';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import { formatTaxonomyForPrompt } from './pck_taxonomy.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 image uploads

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
// NEW: PCK Feedback Analysis Endpoint
app.post('/api/pck-feedback', async (req, res) => {
  try {
    console.log('💡 Received PCK feedback analysis request');
    
    const { teacherMessage, conversationHistory, scenario } = req.body;
    
    if (!teacherMessage) {
      return res.status(400).json({ 
        success: false,
        error: 'Teacher message is required' 
      });
    }

    // Simple PCK analysis prompt
    const pckPrompt = `You are a PCK (Pedagogical Content Knowledge) expert analyzing a geometry teacher's message.

Teacher's message: "${teacherMessage}"

Provide brief Hebrew feedback (1-2 sentences) about the teacher's pedagogical approach.
Focus on: question quality, misconception handling, explanation clarity.

${scenario && scenario.misconception_focus ? `Watch for this misconception: ${scenario.misconception_focus}` : ''}

Respond with ONLY a short Hebrew sentence of feedback.`;

    const contents = [{
      role: 'user',
      parts: [{ text: pckPrompt }]
    }];

    const generationConfig = {
      maxOutputTokens: 100,
      temperature: 0.7,
      topP: 1
    };

    console.log('📤 Calling Vertex AI for PCK analysis...');
    
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

    const feedbackText = candidate.content.parts[0].text;
    console.log('✅ PCK Feedback received:', feedbackText);
    
    res.json({ 
      success: true,
      feedback: feedbackText.trim()
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

    // Get the PCK taxonomy
    const pckTaxonomy = formatTaxonomyForPrompt();
    
    // Comprehensive PCK analysis prompt
    const summaryPrompt = `אתה מומחה בידע תוכן פדגוגי (PCK) בגיאומטריה. תפקידך לספק ניתוח מקיף של ביצועי המורה בשיחה זו.

**הקשר השיעור:**
${conversationLog.scenario.text}

**מטרות השיעור:**
${conversationLog.scenario.lesson_goals || 'לא צוין'}

**תפיסות שגויות ביעד:**
${conversationLog.scenario.misconception_focus || 'לא צוין'}

**השיחה המלאה (${conversationLog.turns.length} תגובות):**
${conversationText}

**סטטיסטיקה:**
- תגובות מורה: ${conversationLog.stats.totalTeacherMessages}
- תגובות תלמידים: ${conversationLog.stats.totalStudentMessages}
- משך זמן: ${conversationLog.stats.durationMinutes || 'לא צוין'} דקות

---

${pckTaxonomy}

---

**⚠️ חשוב מאוד - הוראות לניתוח:**

1. **התמקד אך ורק במיומנויות PCK המופיעות למעלה**
2. **אל תזכיר או תציע מיומנויות שאינן ברשימה** (למשל: שימוש בדוגמאות חזותיות, גאוגברה, ציורים, וכו')
3. **ציין דוגמאות ספציפיות מהשיחה**
4. **היה מעודד אבל גם ביקורתי בונה**
5. **ספק משוב מעשי ויישומי**

---

**ספק ניתוח מקיף בעברית בפורמט הבא:**

# 📊 ניתוח מקיף PCK

## ✅ מה עשית טוב

[רשום 2-3 נקודות חוזק ספציפיות מהמיומנויות ברשימה, עם דוגמאות מהשיחה]

## 💡 מה ניתן לשפר

[רשום 2-3 תחומים לשיפור מהמיומנויות ברשימה בלבד, עם הסברים ספציפיים]

## 🎯 המלצות קונקרטיות

[ספק 3-4 המלצות מעשיות לשיעור הבא, **רק מהמיומנויות המוגדרות למעלה**]

## 📈 סיכום

[משפט או שניים של סיכום כללי על הביצועים]`;

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

app.listen(PORT, () => {
	console.log(`🚀 Teaching Simulator backend running on http://localhost:${PORT}`);
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


