// Backend API base URL
// In production: REACT_APP_API_URL should be empty string (requests go to same domain)
// In development: Falls back to localhost:3001
const API_BASE_URL = process.env.REACT_APP_API_URL !== undefined 
  ? process.env.REACT_APP_API_URL 
  : 'http://localhost:3001';

console.log('🔗 GenAI service initialized with backend URL:', API_BASE_URL);

/**
 * Wraps a fetch call with automatic retries on transient server errors
 * (HTTP 429, 503) using linear backoff. All other non-OK statuses are
 * returned as-is so callers can surface the real error.
 *
 * @param {() => Promise<Response>} fetchFn - A zero-argument function that performs the fetch
 * @param {number} maxRetries - Number of additional attempts after the first (default 2)
 * @param {number} baseDelayMs - Delay before first retry in ms; multiplied by attempt number (default 3000)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(fetchFn, maxRetries = 2, baseDelayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const response = await fetchFn();

    const isTransient = response.status === 429 || response.status === 503;
    if (isTransient && attempt <= maxRetries) {
      const delay = baseDelayMs * attempt; // 3 s, 6 s
      console.warn(`⏳ Transient backend error (${response.status}). Retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    return response;
  }
}

/**
 * Generate content using backend with Google's Vertex AI
 * @param {Array} messages - OpenAI format messages
 * @param {Object} options - Additional options like stop sequences
 * @returns {Promise<string>} - Generated text response
 */
export async function generateWithGenAI(messages, options = {}) {
  try {
    console.log('🚀 Calling backend API for chat completion...');
    console.log('📝 Messages count:', messages.length);
    console.log('📝 Options:', options);
    
    const response = await fetchWithRetry(() => fetch(`${API_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        options
      })
    }));

    console.log('📥 Backend response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ Backend error:', errorData);
      throw new Error(`Backend error (${response.status}): ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log('📦 Backend response received:', result);
    
    if (result.success) {
      console.log('✅ Backend response successful, text length:', result.text.length);
      console.log('✅ Response preview:', result.text.substring(0, 200) + '...');
      return result.text;
    } else {
      console.error('❌ Backend returned error:', result.error);
      throw new Error(result.error || 'Backend returned unsuccessful response');
    }
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('❌ Network error - is the backend running on', API_BASE_URL + '?');
      console.error('❌ Make sure to start the backend server with: cd server && npm start');
      throw new Error('Backend server not available. Please start the backend server.');
    }
    
    console.error('❌ Error calling backend API:', error);
    throw error;
  }
}

/**
 * Generate completion using backend (GPT-3 style)
 * @param {string} prompt - The prompt string
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - Generated text response  
 */
export async function generateWithGenAICompletion(prompt, options = {}) {
  try {
    console.log('🚀 Calling backend API for completion...');
    console.log('📝 Prompt length:', prompt.length);
    console.log('📝 Options:', options);
    
    const response = await fetchWithRetry(() => fetch(`${API_BASE_URL}/api/completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        options
      })
    }));

    console.log('📥 Backend completion response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ Backend completion error:', errorData);
      throw new Error(`Backend error (${response.status}): ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log('📦 Backend completion response received:', result);
    
    if (result.success) {
      console.log('✅ Backend completion successful, text length:', result.text.length);
      console.log('✅ Completion response preview:', result.text.substring(0, 200) + '...');
      return result.text;
    } else {
      console.error('❌ Backend returned completion error:', result.error);
      throw new Error(result.error || 'Backend returned unsuccessful response');
    }
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('❌ Network error - is the backend running on', API_BASE_URL + '?');
      console.error('❌ Make sure to start the backend server with: cd server && npm start');
      throw new Error('Backend server not available. Please start the backend server.');
    }
    
    console.error('❌ Error calling backend completion API:', error);
    throw error;
  }
}

/**
 * Get PCK feedback for a teacher's message.
 *
 * When DST is active (dialogueState is provided), sends recentHistory (last N messages)
 * and the structured dialogue state instead of the full history + feedbackHistory.
 * Falls back to the legacy full-history path when dialogueState is null/undefined.
 *
 * @param {string} teacherMessage - The teacher's message to analyze
 * @param {Array}  conversationHistory - All conversation messages (used in legacy mode)
 * @param {Object} scenario - Current scenario context
 * @param {Array}  feedbackHistory - Last N PCK snapshots (used in legacy mode only)
 * @param {Object|null} dialogueState - Current DST state (null = use legacy path)
 * @returns {Promise<Object>} - Structured PCK analysis object
 */
export async function getPCKFeedback(teacherMessage, conversationHistory = [], scenario = {}, feedbackHistory = [], dialogueState = null) {
  try {
    console.log('💡 Requesting structured PCK feedback analysis...');
    console.log('📝 Teacher message:', teacherMessage.substring(0, 100) + '...');

    // When DST is active, send only the last 8 messages as recent context.
    // The dialogue state carries the analytical cross-turn context instead.
    const recentHistory = dialogueState
      ? conversationHistory.slice(-8)
      : null;

    if (dialogueState) {
      console.log(`🔄 DST mode: PCK gets last ${recentHistory.length} messages (of ${conversationHistory.length} total) + dialogue state (turn ${dialogueState.turn_number})`);
    } else {
      console.log(`📊 Legacy mode: PCK gets full history (${conversationHistory.length} messages) + feedbackHistory (${feedbackHistory.length} items)`);
    }
    
    const response = await fetchWithRetry(() => fetch(`${API_BASE_URL}/api/pck-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teacherMessage,
        conversationHistory,
        scenario,
        feedbackHistory,
        dialogue_state: dialogueState,
        recentHistory,
      })
    }));

    console.log('📥 PCK feedback response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ PCK feedback error:', errorData);
      throw new Error(`Backend error (${response.status}): ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log('📦 PCK feedback received');
    
    if (result.success) {
      console.log('✅ PCK feedback successful');
      console.log('   Quality:', result.analysis.pedagogical_quality);
      console.log('   Misconception addressed:', result.analysis.addressed_misconception);
      console.log('   Predicted understanding:', result.analysis.predicted_student_state && result.analysis.predicted_student_state.understanding_level);
      return result.analysis;
    } else {
      console.error('❌ PCK feedback returned error:', result.error);
      throw new Error(result.error || 'PCK feedback returned unsuccessful response');
    }
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('❌ Network error - is the backend running on', API_BASE_URL + '?');
      throw new Error('Backend server not available. Please start the backend server.');
    }
    
    console.error('❌ Error calling PCK feedback API:', error);
    throw error;
  }
}

/**
 * Test the backend connection
 * @returns {Promise<boolean>} - True if backend is available
 */
export async function testBackendConnection() {
  try {
    console.log('🧪 Testing backend connection...');
    
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Backend health check passed:', result);
      return true;
    } else {
      console.error('❌ Backend health check failed:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Backend connection test failed:', error);
    return false;
  }
}

/**
 * Run a simple test to verify the AI is working
 * @returns {Promise<string>} - Test response
 */
export async function testAI() {
  try {
    console.log('🧪 Testing AI functionality...');
    
    const response = await fetch(`${API_BASE_URL}/api/test`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ AI test passed:', result);
      return result.test_response;
    } else {
      const errorData = await response.json();
      console.error('❌ AI test failed:', errorData);
      throw new Error(errorData.error);
    }
  } catch (error) {
    console.error('❌ AI test error:', error);
    throw error;
  }
}

/**
 * Update the dialogue state after a full conversation turn completes.
 * Called after student responses are generated (when ENABLE_DST is true).
 * The DST agent is a lightweight bookkeeper — it receives the PCK analysis
 * and student responses and returns an updated structured state.
 *
 * @param {string} teacherMessage - Teacher's message this turn
 * @param {Array}  studentResponses - Student messages [{name, text}]
 * @param {Object} pckAnalysis - Full PCK analysis output for this turn
 * @param {Object|null} dialogueState - Current state before this turn (null = first turn)
 * @param {Object} scenario - Current scenario context
 * @returns {Promise<Object|null>} - Updated dialogue state, or null on failure
 */
export async function updateDialogueState(teacherMessage, studentResponses, pckAnalysis, dialogueState, scenario) {
  try {
    console.log('🔄 Requesting DST state update...');

    // Convert ChatMessage objects to plain {student, message} for the DST agent
    const plainResponses = (studentResponses || []).map(msg => ({
      student: msg.agent || msg.name || 'Student',
      message: msg.text || msg.message || '',
    }));

    const response = await fetchWithRetry(() => fetch(`${API_BASE_URL}/api/dst-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherMessage,
        studentResponses: plainResponses,
        pckAnalysis,
        dialogue_state: dialogueState,
        scenario,
      })
    }));

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ DST update error:', errorData);
      return null;
    }

    const result = await response.json();

    if (result.success) {
      console.log('✅ DST state updated — turn:', result.updated_dialogue_state.turn_number);
      return result.updated_dialogue_state;
    } else {
      console.error('❌ DST update returned error:', result.error);
      return null;
    }
  } catch (error) {
    // DST failures are non-fatal — the conversation continues without updated state
    console.error('❌ Error calling DST update API (non-fatal):', error.message);
    return null;
  }
}

/**
 * Get comprehensive PCK summary feedback for entire conversation
 * @param {Object} conversationLog - Complete conversation log
 * @returns {Promise<Object>} - Summary feedback with analysis
 */
export async function getPCKSummary(conversationLog) {
  try {
    console.log('📊 Requesting comprehensive PCK summary analysis...');
    console.log(`   Session: ${conversationLog.sessionId}`);
    console.log(`   Turns: ${conversationLog.turns.length}`);
    
    const response = await fetchWithRetry(() => fetch(`${API_BASE_URL}/api/pck-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationLog
      })
    }));

    console.log('📥 PCK summary response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ PCK summary error:', errorData);
      throw new Error(`Backend error (${response.status}): ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log('📦 PCK summary received');
    
    if (result.success) {
      console.log('✅ PCK summary successful, length:', result.summary.length);
      return {
        summary: result.summary,
        analyzed_turns: result.analyzed_turns,
        session_id: result.session_id
      };
    } else {
      console.error('❌ PCK summary returned error:', result.error);
      throw new Error(result.error || 'PCK summary returned unsuccessful response');
    }
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('❌ Network error - is the backend running on', API_BASE_URL + '?');
      throw new Error('Backend server not available. Please start the backend server.');
    }
    
    console.error('❌ Error calling PCK summary API:', error);
    throw error;
  }
}

// Log initialization
console.log('🎯 GenAI service loaded');
console.log('🔗 Backend API URL:', API_BASE_URL);
console.log('');
console.log('Available functions:');
console.log('  - generateWithGenAI(messages, options)');
console.log('  - generateWithGenAICompletion(prompt, options)');
console.log('  - getPCKFeedback(teacherMessage, conversationHistory, scenario, feedbackHistory, dialogueState?)');
console.log('  - updateDialogueState(teacherMessage, studentResponses, pckAnalysis, dialogueState, scenario)');
console.log('  - getPCKSummary(conversationLog)');
console.log('  - testBackendConnection()');
console.log('  - testAI()');


