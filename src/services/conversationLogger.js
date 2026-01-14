/**
 * Conversation Logger Service
 * Tracks and saves complete conversation logs including PCK feedback
 */

export class ConversationLog {
  constructor(scenario, students) {
    this.sessionId = this.generateSessionId();
    this.startTime = new Date().toISOString();
    this.endTime = null;
    
    // Scenario context
    this.scenario = {
      text: scenario.text,
      lesson_goals: scenario.lesson_goals,
      misconception_focus: scenario.misconception_focus,
      target_pck_skills: scenario.target_pck_skills,
      initiated_by: scenario.initiated_by
    };
    
    // Students in this session
    this.students = students.map(s => ({
      name: s.name,
      description: s.description
    }));
    
    // Conversation turns (teacher message + student responses + PCK feedback)
    this.turns = [];
    
    // Summary statistics
    this.stats = {
      totalTeacherMessages: 0,
      totalStudentMessages: 0,
      totalPCKFeedbacks: 0
    };
  }
  
  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Add a conversation turn (teacher message, student responses, PCK feedback)
   */
  addTurn(teacherMessage, studentResponses, pckFeedback) {
    const turn = {
      turnNumber: this.turns.length + 1,
      timestamp: new Date().toISOString(),
      teacher: {
        message: teacherMessage,
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
        detected_skills: pckFeedback.detected_skills || [],
        missed_opportunities: pckFeedback.missed_opportunities || [],
        timestamp: new Date().toISOString()
      } : null
    };
    
    this.turns.push(turn);
    
    // Update statistics
    this.stats.totalTeacherMessages++;
    this.stats.totalStudentMessages += studentResponses.length;
    if (pckFeedback) {
      this.stats.totalPCKFeedbacks++;
    }
  }
  
  /**
   * End the conversation session
   */
  endSession() {
    this.endTime = new Date().toISOString();
    
    // Calculate session duration
    const start = new Date(this.startTime);
    const end = new Date(this.endTime);
    this.stats.durationMinutes = Math.round((end - start) / 1000 / 60);
  }
  
  /**
   * Add summary feedback to the log
   */
  addSummaryFeedback(summaryFeedback) {
    this.summaryFeedback = summaryFeedback;
    // Auto-save to localStorage when feedback is added
    this.saveToLocalStorage();
  }
  
  /**
   * Get the complete log as JSON
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: this.endTime,
      scenario: this.scenario,
      students: this.students,
      turns: this.turns,
      stats: this.stats,
      summaryFeedback: this.summaryFeedback || null
    };
  }
  
  /**
   * Save to localStorage
   */
  saveToLocalStorage() {
    const key = `conversation_log_${this.sessionId}`;
    localStorage.setItem(key, JSON.stringify(this.toJSON()));
    
    // Also update the list of all session IDs
    this.updateSessionsList();
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

