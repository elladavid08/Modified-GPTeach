import React, { useState, useEffect } from 'react';
import { getAllConversationSessions, loadConversationLog, deleteConversationLog, exportConversationLog, saveSummaryFeedback } from '../services/conversationLogger';
import { getPCKSummary } from '../services/genai';
import { PCKSummaryModal } from '../components/PCKSummaryModal';

export const ConversationLogs = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [currentSummary, setCurrentSummary] = useState(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = () => {
    const allSessions = getAllConversationSessions();
    setSessions(allSessions);
  };

  const handleViewLog = (sessionId) => {
    const log = loadConversationLog(sessionId);
    setSelectedLog(log);
  };

  const handleDeleteLog = (sessionId) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק את היומן הזה?')) {
      deleteConversationLog(sessionId);
      loadSessions();
      if (selectedLog && selectedLog.sessionId === sessionId) {
        setSelectedLog(null);
      }
    }
  };

  const handleExportLog = (sessionId) => {
    exportConversationLog(sessionId);
  };
  
  const handleViewSummary = (log) => {
    if (log.summaryFeedback) {
      setCurrentSummary(log.summaryFeedback);
      setShowSummary(true);
    }
  };
  
  const handleGenerateSummary = async (log) => {
    try {
      setIsLoadingSummary(true);
      setShowSummary(true);
      setCurrentSummary(null);
      
      console.log("📊 Generating summary feedback for session:", log.sessionId);
      const summary = await getPCKSummary(log);
      
      console.log("✅ Summary feedback received!");
      setCurrentSummary(summary.summary);
      
      // Save the feedback
      saveSummaryFeedback(log.sessionId, summary.summary);
      
      // Reload sessions to update the list
      loadSessions();
      
      // Reload the selected log to show the feedback
      const updatedLog = loadConversationLog(log.sessionId);
      setSelectedLog(updatedLog);
    } catch (error) {
      console.error("❌ Error generating summary:", error);
      alert(`שגיאה בייצור הניתוח: ${error.message}`);
      setShowSummary(false);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  return (
    <div style={{ padding: '80px 20px 20px 20px', direction: 'rtl', minHeight: '100vh', overflow: 'auto' }}>
      <h1>📊 יומני שיחות שמורים</h1>
      
      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
          <p>אין יומני שיחות שמורים</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Sessions List */}
          <div style={{ width: '300px', borderRight: '2px solid #dee2e6', paddingRight: '20px' }}>
            <h3>שיחות ({sessions.length})</h3>
            {sessions.map((session, index) => (
              <div 
                key={session.sessionId}
                style={{
                  padding: '10px',
                  marginBottom: '10px',
                  backgroundColor: selectedLog && selectedLog.sessionId === session.sessionId ? '#e7f3ff' : '#f8f9fa',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: '1px solid #dee2e6'
                }}
                onClick={() => handleViewLog(session.sessionId)}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                  שיחה #{sessions.length - index}
                </div>
                <div style={{ fontSize: '12px', color: '#6c757d' }}>
                  {new Date(session.startTime).toLocaleString('he-IL')}
                </div>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  {session.turnsCount} תגובות
                </div>
                <div style={{ marginTop: '10px', display: 'flex', gap: '5px' }}>
                  <button 
                    className="btn btn-sm btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportLog(session.sessionId);
                    }}
                  >
                    ייצא
                  </button>
                  <button 
                    className="btn btn-sm btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLog(session.sessionId);
                    }}
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Log Details */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
            {selectedLog ? (
              <div>
                <h2>פרטי שיחה</h2>
                
                {/* Session Info */}
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                  <div><strong>מזהה:</strong> {selectedLog.sessionId}</div>
                  <div><strong>תחילה:</strong> {new Date(selectedLog.startTime).toLocaleString('he-IL')}</div>
                  {selectedLog.endTime && (
                    <div><strong>סיום:</strong> {new Date(selectedLog.endTime).toLocaleString('he-IL')}</div>
                  )}
                  {selectedLog.stats.durationMinutes && (
                    <div><strong>משך זמן:</strong> {selectedLog.stats.durationMinutes} דקות</div>
                  )}
                </div>

                {/* Scenario */}
                <div style={{ marginBottom: '20px' }}>
                  <h4>תרחיש</h4>
                  <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px' }}>
                    {selectedLog.scenario.text}
                  </div>
                </div>

                {/* Statistics */}
                <div style={{ marginBottom: '20px' }}>
                  <h4>סטטיסטיקה</h4>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ backgroundColor: '#d4edda', padding: '10px', borderRadius: '8px', flex: 1 }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{selectedLog.stats.totalTeacherMessages}</div>
                      <div>תגובות מורה</div>
                    </div>
                    <div style={{ backgroundColor: '#cfe2ff', padding: '10px', borderRadius: '8px', flex: 1 }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{selectedLog.stats.totalStudentMessages}</div>
                      <div>תגובות תלמידים</div>
                    </div>
                    <div style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '8px', flex: 1 }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{selectedLog.stats.totalPCKFeedbacks}</div>
                      <div>משובי PCK</div>
                    </div>
                  </div>
                </div>

                {/* PCK Summary Feedback */}
                <div style={{ marginBottom: '20px' }}>
                  <h4>📊 ניתוח מקיף PCK</h4>
                  {selectedLog.summaryFeedback ? (
                    <div style={{ backgroundColor: '#d4edda', padding: '15px', borderRadius: '8px', border: '2px solid #28a745' }}>
                      <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#155724' }}>
                        ✅ ניתוח זמין
                      </div>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleViewSummary(selectedLog)}
                      >
                        צפה בניתוח המקיף
                      </button>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', border: '2px solid #ffc107' }}>
                      <div style={{ marginBottom: '10px', color: '#856404' }}>
                        טרם נוצר ניתוח מקיף לשיחה זו
                      </div>
                      <button
                        className="btn btn-warning btn-sm"
                        onClick={() => handleGenerateSummary(selectedLog)}
                        disabled={isLoadingSummary}
                      >
                        {isLoadingSummary ? '⏳ מייצר ניתוח...' : '📊 צור ניתוח PCK'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Conversation Turns */}
                <div>
                  <h4>שיחה מלאה</h4>
                  {selectedLog.turns.map((turn, index) => (
                    <div key={index} style={{ marginBottom: '30px', borderRight: '4px solid #007bff', paddingRight: '15px' }}>
                      <div style={{ fontWeight: 'bold', color: '#007bff', marginBottom: '10px' }}>
                        תור #{turn.turnNumber}
                      </div>
                      
                      {/* Teacher Message */}
                      <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>מורה:</div>
                        <div>{turn.teacher.message}</div>
                      </div>

                      {/* Student Responses */}
                      {turn.students.map((student, idx) => (
                        <div key={idx} style={{ backgroundColor: '#e7f3ff', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{student.name}:</div>
                          <div>{student.message}</div>
                        </div>
                      ))}

                      {/* PCK Feedback */}
                      {turn.pckFeedback && (
                        <div style={{ backgroundColor: '#d4edda', padding: '10px', borderRadius: '8px', borderRight: '4px solid #28a745' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>💡 משוב PCK:</div>
                          <div>{turn.pckFeedback.feedback_message}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
                <p>בחר שיחה מהרשימה לצפייה בפרטים</p>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* PCK Summary Modal */}
      {showSummary && (
        <PCKSummaryModal
          summary={currentSummary}
          isLoading={isLoadingSummary}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
};

export default ConversationLogs;

