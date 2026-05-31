import React, { useState, useEffect } from 'react';
import { getConversationsByUser, getConversation } from '../services/firestoreService';
import { getPCKSummary } from '../services/genai';
import { saveSummaryFeedback } from '../services/conversationLogger';
import { PCKSummaryModal } from '../components/PCKSummaryModal';
import { useAuth } from '../contexts/AuthContext';

const SKILL_NAMES_HE = {
  'error-identification':         'זיהוי השגיאה',
  'error-characterization':       'אפיון סוג השגיאה',
  'diagnostic-interpretation':    'פרשנות אבחונית של חשיבת התלמיד',
  'adapted-pedagogical-response': 'תגובה פדגוגית מותאמת',
  'error-leveraging':             'מינוף השגיאה ללמידה',
};

const SCORE_COLOR = {
  2: '#28a745',
  1: '#ffc107',
  0: '#c9b8d8',
};

function SkillBullet({ color }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: color,
      flexShrink: 0,
      marginLeft: '9px',
      marginTop: '3px',
    }} />
  );
}

function PCKLegend() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginBottom: '10px',
      padding: '6px 10px',
      backgroundColor: '#ebebeb',
      borderRadius: '6px',
      fontSize: '0.78rem',
      color: '#555',
      direction: 'rtl',
    }}>
      {[2, 1, 0].map(score => (
        <div key={score} style={{ display: 'flex', alignItems: 'center' }}>
          <SkillBullet color={SCORE_COLOR[score]} />
          <span>{{ 2: 'קיים היטב', 1: 'קיים באופן חלקי', 0: 'חסר' }[score]}</span>
        </div>
      ))}
    </div>
  );
}

function PCKFeedbackBullets({ pckFeedback }) {
  const assessedSkills = (pckFeedback.skills_assessment || []).filter(s => s.is_relevant);

  let skillRows;
  if (assessedSkills.length > 0) {
    skillRows = assessedSkills.map(s => ({
      skillId: s.skill_id,
      score: s.score,
      text: s.score > 0 ? (s.evidence || '') : (s.what_could_be_better || ''),
    }));
  } else {
    skillRows = [
      ...(pckFeedback.detected_skills || []).map(s => ({
        skillId: s.skill_id,
        score: 2,
        text: s.evidence || '',
      })),
      ...(pckFeedback.missed_opportunities || []).map(s => ({
        skillId: s.skill_id,
        score: 0,
        text: s.what_could_have_been_done || '',
      })),
    ];
  }

  if (skillRows.length === 0) return null;

  return (
    <div style={{ backgroundColor: '#d4edda', padding: '12px', borderRadius: '8px', borderRight: '4px solid #28a745' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#155724' }}>💡 משוב PCK:</div>
      <PCKLegend />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {skillRows.map((row, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            padding: '8px 0',
            borderBottom: '1px solid #c3e6cb',
            direction: 'rtl',
          }}>
            <SkillBullet color={SCORE_COLOR[row.score] !== undefined ? SCORE_COLOR[row.score] : SCORE_COLOR[0]} />
            <span style={{ fontSize: '0.88rem', color: '#333', lineHeight: '1.5' }}>
              <strong>{SKILL_NAMES_HE[row.skillId] || row.skillId}</strong>
              {row.text ? ': ' + row.text : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ConversationLogs = () => {
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [currentSummary, setCurrentSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (currentUser) {
      loadSessions();
    }
  }, [currentUser]);

  const loadSessions = async () => {
    setIsLoading(true);
    setLoadError(null);
    const { conversations, error } = await getConversationsByUser(currentUser.uid);
    if (error) {
      setLoadError(error);
    } else {
      setSessions(conversations);
    }
    setIsLoading(false);
  };

  const handleViewLog = async (sessionId) => {
    const { conversation, error } = await getConversation(sessionId);
    if (error) {
      alert(`שגיאה בטעינת השיחה: ${error}`);
    } else {
      setSelectedLog(conversation);
    }
  };

  const handleExportLog = (log) => {
    const dataStr = JSON.stringify(log, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `conversation_${log.sessionId}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
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

      const summary = await getPCKSummary(log);
      setCurrentSummary(summary.summary);
      saveSummaryFeedback(log.sessionId, summary.summary);
      await loadSessions();
      const { conversation: updatedLog } = await getConversation(log.sessionId);
      if (updatedLog) setSelectedLog(updatedLog);
    } catch (error) {
      console.error('❌ Error generating summary:', error);
      alert(`שגיאה בייצור הניתוח: ${error.message}`);
      setShowSummary(false);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const formatDate = (session) => {
    const ts = session.startTime || session.startedAt;
    if (!ts) return '—';
    return new Date(ts).toLocaleString('he-IL');
  };

  const getTurnCount = (session) => {
    if (session.turns) return session.turns.length;
    if (session.stats) return session.stats.totalTeacherMessages || 0;
    return '—';
  };

  return (
    <div style={{ padding: '80px 20px 20px 20px', direction: 'rtl', minHeight: '100vh', overflow: 'auto' }}>
      <h1>📊 יומני שיחות שמורים</h1>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
          <div className="spinner-border text-primary" role="status" />
          <p style={{ marginTop: '12px' }}>טוען שיחות...</p>
        </div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#dc3545' }}>
          <p>שגיאה בטעינת השיחות: {loadError}</p>
          <button className="btn btn-outline-danger btn-sm" onClick={loadSessions}>נסה שוב</button>
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
          <p>אין יומני שיחות שמורים</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '20px', maxHeight: 'calc(100vh - 120px)' }}>
          {/* Sessions List */}
          <div style={{ width: '300px', borderRight: '2px solid #dee2e6', paddingRight: '20px', overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
            <h3>שיחות ({sessions.length})</h3>
            {sessions.map((session, index) => (
              <div
                key={session.sessionId || session.id}
                style={{
                  padding: '10px',
                  marginBottom: '10px',
                  backgroundColor: selectedLog && (selectedLog.sessionId === session.sessionId || selectedLog.id === session.id) ? '#e7f3ff' : '#f8f9fa',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: '1px solid #dee2e6'
                }}
                onClick={() => handleViewLog(session.sessionId || session.id)}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                  שיחה #{sessions.length - index}
                </div>
                <div style={{ fontSize: '12px', color: '#6c757d' }}>
                  {formatDate(session)}
                </div>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  {getTurnCount(session)} תגובות
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportLog(session);
                    }}
                  >
                    ייצא
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Log Details */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
            {selectedLog ? (
              <ConversationDetail
                log={selectedLog}
                onExport={handleExportLog}
                onGenerateSummary={handleGenerateSummary}
                onViewSummary={handleViewSummary}
                isLoadingSummary={isLoadingSummary}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
                <p>בחר שיחה מהרשימה לצפייה בפרטים</p>
              </div>
            )}
          </div>
        </div>
      )}

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

/**
 * Shared detail panel used by both ConversationLogs and AdminConversationLogs.
 */
export function ConversationDetail({ log, onExport, onGenerateSummary, onViewSummary, isLoadingSummary, showUser = false, onMarkTurn = null, markedTurnIds = null }) {
  return (
    <div>
      <h2>פרטי שיחה</h2>

      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <div><strong>מזהה:</strong> {log.sessionId}</div>
        {showUser && log.userSnapshot && (
          <div><strong>משתמש:</strong> {log.userSnapshot.fullName || '—'}</div>
        )}
        <div><strong>גרסה:</strong> {log.systemVersion || '—'}</div>
        <div><strong>תחילה:</strong> {log.startTime ? new Date(log.startTime).toLocaleString('he-IL') : '—'}</div>
        {log.endTime && (
          <div><strong>סיום:</strong> {new Date(log.endTime).toLocaleString('he-IL')}</div>
        )}
        {log.stats && log.stats.durationMinutes && (
          <div><strong>משך זמן:</strong> {log.stats.durationMinutes} דקות</div>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4>תרחיש</h4>
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px' }}>
          {log.scenario && log.scenario.text}
        </div>
      </div>

      {log.stats && (
        <div style={{ marginBottom: '20px' }}>
          <h4>סטטיסטיקה</h4>
          <div style={{ display: 'flex', gap: '15px' }}>
            <div style={{ backgroundColor: '#d4edda', padding: '10px', borderRadius: '8px', flex: 1 }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{log.stats.totalTeacherMessages}</div>
              <div>תגובות מורה</div>
            </div>
            <div style={{ backgroundColor: '#cfe2ff', padding: '10px', borderRadius: '8px', flex: 1 }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{log.stats.totalStudentMessages}</div>
              <div>תגובות תלמידים</div>
            </div>
            <div style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '8px', flex: 1 }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{log.stats.totalPCKFeedbacks}</div>
              <div>משובי PCK</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h4>📊 ניתוח מקיף PCK</h4>
        {log.summaryFeedback ? (
          <div style={{ backgroundColor: '#d4edda', padding: '15px', borderRadius: '8px', border: '2px solid #28a745' }}>
            <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#155724' }}>✅ ניתוח זמין</div>
            <button className="btn btn-success btn-sm" onClick={() => onViewSummary(log)}>
              צפה בניתוח המקיף
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', border: '2px solid #ffc107' }}>
            <div style={{ marginBottom: '10px', color: '#856404' }}>טרם נוצר ניתוח מקיף לשיחה זו</div>
            <button
              className="btn btn-warning btn-sm"
              onClick={() => onGenerateSummary(log)}
              disabled={isLoadingSummary}
            >
              {isLoadingSummary ? '⏳ מייצר ניתוח...' : '📊 צור ניתוח PCK'}
            </button>
          </div>
        )}
      </div>

      <div>
        <h4>שיחה מלאה</h4>
        {(log.turns || []).map((turn, index) => {
          const turnKey = (log.sessionId || log.id) + '_' + turn.turnNumber;
          const isMarked = markedTurnIds && markedTurnIds[turnKey];
          return (
          <div key={index} style={{ marginBottom: '30px', borderRight: '4px solid ' + (isMarked ? '#28a745' : '#007bff'), paddingRight: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', gap: '10px' }}>
              <span style={{ fontWeight: 'bold', color: isMarked ? '#28a745' : '#007bff' }}>
                תור #{turn.turnNumber}
              </span>
              {onMarkTurn && (
                <button
                  className={isMarked ? 'btn btn-sm btn-success' : 'btn btn-sm btn-outline-secondary'}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => onMarkTurn(turn)}
                >
                  {isMarked ? '✅ מסומן לייצוא' : '⭐ סמן לייצוא'}
                </button>
              )}
            </div>

            <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>מורה:</div>
              <div>{turn.teacher && turn.teacher.message}</div>
              {turn.teacher && turn.teacher.image && (
                <div style={{ marginTop: '10px' }}>
                  <img
                    src={`data:image/png;base64,${turn.teacher.image}`}
                    alt="ציור של המורה"
                    style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', border: '1px solid #dee2e6', display: 'block' }}
                  />
                </div>
              )}
            </div>

            {(turn.students || []).map((student, idx) => (
              <div key={idx} style={{ backgroundColor: '#e7f3ff', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{student.name}:</div>
                <div>{student.message}</div>
              </div>
            ))}

            {turn.pckFeedback && (
              <PCKFeedbackBullets pckFeedback={turn.pckFeedback} />
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default ConversationLogs;
