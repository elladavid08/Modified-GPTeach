/**
 * Conversation Logger Service
 * Tracks and saves complete conversation logs including PCK feedback
 */

import { saveConversation, addMessageToConversation, saveOrGetStudentPersona } from './firestoreService';

/**
 * Compress a base64 PNG image by resizing it to a max width.
 * Keeps PNG format so existing display code (`data:image/png;base64,…`) still works.
 * Firestore documents have a 1 MB limit, so this prevents failures when teachers
 * include drawings in multiple turns.
 */
async function compressImageBase64(base64, maxWidth = 600) {
	if (!base64) return null;
	return new Promise((resolve) => {
		const img = new window.Image();
		img.onload = () => {
			let { width, height } = img;
			if (width <= maxWidth) {
				// Already small enough – return as-is
				resolve(base64);
				return;
			}
			height = Math.round(height * maxWidth / width);
			width = maxWidth;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			canvas.getContext('2d').drawImage(img, 0, 0, width, height);
			// Strip the data-URL prefix so storage format stays consistent
			const dataUrl = canvas.toDataURL('image/png');
			resolve(dataUrl.replace('data:image/png;base64,', ''));
		};
		img.onerror = () => resolve(base64); // Fallback: keep original on error
		img.src = `data:image/png;base64,${base64}`;
	});
}

export class ConversationLog {
	constructor(scenario, students, userId, userProfile, systemVersion = "1.0") {
		this.sessionId = this.generateSessionId();
		this.startTime = new Date().toISOString();
		this.endTime = null;
		this.userId = userId;
		
		// Create minimal user snapshot (only critical fields for research)
		this.userSnapshot = {
			fullName: userProfile && userProfile.fullName ? userProfile.fullName : 'Unknown',
			role: userProfile && userProfile.role ? userProfile.role : 'unknown'
		};
		
		this.systemVersion = systemVersion;
		
		// Scenario context
		this.scenario = {
			text: scenario.text,
			grade_level: scenario.grade_level,
			ai_context_summary: scenario.ai_context_summary,
			ai_prior_knowledge: scenario.ai_prior_knowledge,
			ai_pedagogical_focus: scenario.ai_pedagogical_focus,
			misconception_focus: scenario.misconception_focus,
			target_pck_skills: scenario.target_pck_skills,
			initiated_by: scenario.initiated_by
		};
		
		// Store student data temporarily for initialization
		this.studentsData = students;
		
		// Student persona references (will be populated on first save)
		this.studentRefs = [];
		
		// Conversation turns (teacher message + student responses + PCK feedback)
		this.turns = [];
		
		// Summary statistics
		this.stats = {
			totalTeacherMessages: 0,
			totalStudentMessages: 0,
			totalPCKFeedbacks: 0
		};
		
		// Track if Firestore has been initialized
		// Only initialize on first message to avoid saving empty conversations
		this.firestoreInitialized = false;
	}
  
  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
	/**
	 * Initialize conversation in Firestore
	 */
	async initializeFirestoreConversation() {
		if (!this.userId) {
			console.warn('⚠️  No userId provided, skipping Firestore initialization');
			return;
		}
		
		try {
			// Create/get student persona references
			console.log('📚 Creating student persona references...');
			this.studentRefs = await Promise.all(
				this.studentsData.map(student => 
					saveOrGetStudentPersona(student, this.systemVersion)
				)
			);
			console.log('✅ Student persona references created:', this.studentRefs);
			
			const conversationData = {
				sessionId: this.sessionId,
				userId: this.userId,
				userSnapshot: this.userSnapshot,  // Store minimal snapshot instead of full profile
				systemVersion: this.systemVersion,
				scenario: this.scenario,
				studentRefs: this.studentRefs,  // Store references instead of full data
				startTime: this.startTime,
				endTime: this.endTime,
				turns: [],
				stats: this.stats,
				summaryFeedback: null
			};
			
			const result = await saveConversation(conversationData);
			if (result.error) {
				console.error('❌ Failed to initialize conversation in Firestore:', result.error);
			} else {
				console.log('✅ Conversation initialized in Firestore:', this.sessionId);
			}
		} catch (error) {
			console.error('❌ Error initializing conversation in Firestore:', error);
		}
	}
  
	/**
	 * Add a conversation turn (teacher message, student responses, PCK feedback)
	 * @param {string} teacherMessage
	 * @param {Array}  studentResponses
	 * @param {Object|null} pckFeedback
	 * @param {string|null} teacherImage - base64 PNG drawing
	 * @param {Object|null} dialogueState - DST state snapshot after this turn (optional)
	 */
	async addTurn(teacherMessage, studentResponses, pckFeedback, teacherImage = null, dialogueState = null) {
		// Initialize Firestore on first turn (lazy initialization)
		if (!this.firestoreInitialized) {
			console.log('📊 First message - initializing conversation in Firestore...');
			await this.initializeFirestoreConversation();
			this.firestoreInitialized = true;
		}

		// Compress drawing to keep Firestore document within the 1 MB limit
		const storedImage = teacherImage ? await compressImageBase64(teacherImage) : null;
		
		const turn = {
			turnNumber: this.turns.length + 1,
			timestamp: new Date().toISOString(),
			teacher: {
				message: teacherMessage,
				image: storedImage,   // compressed base64 PNG drawing (null if no drawing)
				timestamp: new Date().toISOString()
			},
			students: studentResponses.map(msg => ({
				name: msg.name,
				message: msg.text,
				timestamp: new Date().toISOString()
			})),
			pckFeedback: pckFeedback ? {
				feedback_message: pckFeedback.feedback_message,
				feedback_type: pckFeedback.feedback_type,
				skills_assessment: pckFeedback.skills_assessment || [],      // primary source — mirrors sidebar display
				detected_skills: pckFeedback.detected_skills || [],          // fallback
				missed_opportunities: pckFeedback.missed_opportunities || [], // fallback
				timestamp: new Date().toISOString()
			} : null,
		// DST state snapshot at the end of this turn (null when DST is disabled)
		dialogueState: dialogueState || null,
		};
		
		this.turns.push(turn);
		
		// Update statistics
		this.stats.totalTeacherMessages++;
		this.stats.totalStudentMessages += studentResponses.length;
		if (pckFeedback) {
			this.stats.totalPCKFeedbacks++;
		}
		
		// Save to Firestore
		await this.saveToFirestore();
	}
  
	/**
	 * End the conversation session
	 */
	async endSession() {
		this.endTime = new Date().toISOString();
		
		// Calculate session duration
		const start = new Date(this.startTime);
		const end = new Date(this.endTime);
		this.stats.durationMinutes = Math.round((end - start) / 1000 / 60);
		
		// Only save if conversation has messages (Firestore was initialized)
		if (this.firestoreInitialized) {
			await this.saveToFirestore();
		} else {
			console.log('⚠️  No messages in conversation, not saving to Firestore');
		}
	}
  
	/**
	 * Add summary feedback to the log
	 */
	async addSummaryFeedback(summaryFeedback) {
		this.summaryFeedback = summaryFeedback;
		// Auto-save to localStorage when feedback is added
		this.saveToLocalStorage();
		// Also save to Firestore (only if conversation has messages)
		if (this.firestoreInitialized) {
			await this.saveToFirestore();
		}
	}
  
	/**
	 * Get the complete log as JSON
	 */
	toJSON() {
		return {
			sessionId: this.sessionId,
			userId: this.userId,
			userSnapshot: this.userSnapshot,  // Use snapshot instead of full profile
			systemVersion: this.systemVersion,
			startTime: this.startTime,
			endTime: this.endTime,
			scenario: this.scenario,
			studentRefs: this.studentRefs,  // Use references instead of full data
			turns: this.turns,
			stats: this.stats,
			summaryFeedback: this.summaryFeedback || null
		};
	}
  
  /**
   * Save to Firestore
   */
  async saveToFirestore() {
    if (!this.userId) {
      console.warn('⚠️  No userId provided, skipping Firestore save');
      return;
    }
    
    try {
      const result = await saveConversation(this.toJSON());
      if (result.error) {
        console.error('❌ Failed to save conversation to Firestore:', result.error);
      }
    } catch (error) {
      console.error('❌ Error saving conversation to Firestore:', error);
    }
  }
  
  /**
   * Save to localStorage
   */
  saveToLocalStorage() {
    const key = `conversation_log_${this.sessionId}`;
    localStorage.setItem(key, JSON.stringify(this.toJSON()));
    
    // Also update the list of all session IDs
    this.updateSessionsList();
    
    // Also save to Firestore (non-blocking)
    this.saveToFirestore().catch(err => 
      console.error('Failed to sync with Firestore:', err)
    );
  }
  
  /**
   * Update the list of all saved sessions
   */
  updateSessionsList() {
    const sessionsListKey = 'conversation_sessions_list';
    let sessionsList = [];
    
    const existingList = localStorage.getItem(sessionsListKey);
    if (existingList) {
      sessionsList = JSON.parse(existingList);
    }
    
    // Check if this session already exists in the list
    const existingIndex = sessionsList.findIndex(s => s.sessionId === this.sessionId);
    
    const sessionData = {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: this.endTime,
      scenario: this.scenario.text.substring(0, 100),
      turnsCount: this.turns.length
    };
    
    if (existingIndex >= 0) {
      // Update existing session
      sessionsList[existingIndex] = sessionData;
    } else {
      // Add new session to the list
      sessionsList.push(sessionData);
    }
    
    localStorage.setItem(sessionsListKey, JSON.stringify(sessionsList));
  }
}

/**
 * Load a conversation log from localStorage
 */
export function loadConversationLog(sessionId) {
  const key = `conversation_log_${sessionId}`;
  const logData = localStorage.getItem(key);
  
  if (!logData) {
    return null;
  }
  
  return JSON.parse(logData);
}

/**
 * Get list of all saved conversation sessions
 */
export function getAllConversationSessions() {
  const sessionsListKey = 'conversation_sessions_list';
  const sessionsList = localStorage.getItem(sessionsListKey);
  
  if (!sessionsList) {
    return [];
  }
  
  return JSON.parse(sessionsList);
}

/**
 * Delete a conversation log
 */
export function deleteConversationLog(sessionId) {
  const key = `conversation_log_${sessionId}`;
  localStorage.removeItem(key);
  
  // Update sessions list
  const sessionsListKey = 'conversation_sessions_list';
  let sessionsList = JSON.parse(localStorage.getItem(sessionsListKey) || '[]');
  sessionsList = sessionsList.filter(s => s.sessionId !== sessionId);
  localStorage.setItem(sessionsListKey, JSON.stringify(sessionsList));
}

/**
 * Save summary feedback for an existing log
 */
export function saveSummaryFeedback(sessionId, summaryFeedback) {
  const key = `conversation_log_${sessionId}`;
  const logData = localStorage.getItem(key);
  
  if (!logData) {
    console.error('Conversation log not found');
    return false;
  }
  
  const log = JSON.parse(logData);
  log.summaryFeedback = summaryFeedback;
  localStorage.setItem(key, JSON.stringify(log));
  
  console.log('✅ Summary feedback saved for session:', sessionId);
  return true;
}

/**
 * Export conversation log as downloadable file
 */
export function exportConversationLog(sessionId) {
  const log = loadConversationLog(sessionId);
  if (!log) {
    console.error('Conversation log not found');
    return;
  }
  
  const dataStr = JSON.stringify(log, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `conversation_${sessionId}_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
}

