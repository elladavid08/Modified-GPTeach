// Polyfill fetch API for Node.js 16 compatibility
import { fetch, Headers, Request, Response } from 'undici';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

import express from 'express';
import cors from 'cors';
import { VertexAI } from '@google-cloud/vertexai';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

console.log('🔧 Initializing Vertex AI with Application Default Credentials...');

// Initialize Vertex AI with Application Default Credentials
const vertexAI = new VertexAI({
  project: 'gen-lang-client-0375164944',
  location: 'us-central1'
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash'
});

console.log('✅ Vertex AI initialized successfully');

/**
 * Convert OpenAI message format to Google GenAI format
 * OpenAI: [{role: "system", content: "..."}, {role: "user", content: "..."}, {role: "assistant", content: "..."}]
 * Google: [{role: "user", parts: [{text: "..."}]}, {role: "model", parts: [{text: "..."}]}]
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
      const content = systemPrompt ? `${systemPrompt}\n\n${message.content}` : message.content;
      contents.push({
        role: "user",
        parts: [{ text: content }]
      });
      systemPrompt = ""; // Clear system prompt after using it
      console.log('👤 Added user message');
    } else if (message.role === "assistant") {
      contents.push({
        role: "model", 
        parts: [{ text: message.content }]
      });
      console.log('🤖 Added assistant/model message');
    }
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

    const responseText = result.response.text();
    console.log('✅ Response received, length:', responseText.length);
    console.log('✅ Response preview:', responseText.substring(0, 200) + '...');
    
    res.json({ 
      success: true,
      text: responseText
    });
  } catch (error) {
    console.error('❌ Error in chat completion:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.name
    });
  }
});

// API endpoint for completions (GPT-3 style)
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

    const responseText = result.response.text();
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
    service: 'GPTeach Backend',
    timestamp: new Date().toISOString(),
    project: 'cloud-run-455609',
    model: 'gemini-1.5-flash'
  });
});

// Test endpoint for debugging
app.get('/api/test', async (req, res) => {
  try {
    console.log('🧪 Test endpoint called');
    
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: "Say hello from GPTeach backend!" }]
      }],
      generationConfig: {
        maxOutputTokens: 50,
        temperature: 0.5
      }
    });

    const responseText = result.response.text();
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
  console.log(`🚀 GPTeach backend running on http://localhost:${PORT}`);
  console.log('🔐 Using Application Default Credentials from gcloud');
  console.log('🎯 Project: cloud-run-455609');
  console.log('🌍 Location: us-central1');
  console.log('🤖 Model: gemini-1.5-flash');
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /api/health - Health check');
  console.log('  GET  /api/test   - Test AI connection');
  console.log('  POST /api/generate - Chat completions');
  console.log('  POST /api/completion - Text completions');
});


