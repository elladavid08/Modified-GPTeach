import React, { useState, useEffect, useMemo } from 'react';
import { getAllConversations, getConversation, deleteConversation } from '../services/firestoreService';
import { getPCKSummary } from '../services/genai';
import { PCKSummaryModal } from '../components/PCKSummaryModal';
import { ConversationDetail } from './ConversationLogs';

// ---------- PCK skill definitions ----------
const SKILL_IDS = [
  'error-identification',
  'error-characterization',
  'diagnostic-interpretation',
  'adapted-pedagogical-response',
  'error-leveraging',
];
const SKILL_NAMES_HE = {
  'error-identification':         'זיהוי השגיאה',
  'error-characterization':       'אפיון סוג השגיאה',
  'diagnostic-interpretation':    'פרשנות אבחונית של חשיבת התלמיד',
  'adapted-pedagogical-response': 'תגובה פדגוגית מותאמת',
  'error-leveraging':             'מינוף השגיאה ללמידה',
};

// ---------- CSV helpers ----------
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  var str = String(val);
  if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCSV(filename, rows) {
  var csv = '\ufeff' + rows.map(function(r) { return r.map(escapeCSV).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// ---------- Main component ----------
const AdminConversationLogs = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [currentSummary, setCurrentSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filterUser, setFilterUser] = useState('');
  const [filterVersion, setFilterVersion] = useState('');
  // markedTurns: array of enriched turn objects for annotation export
  const [markedTurns, setMarkedTurns] = useState([]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    setLoadError(null);
    var result = await getAllConversations(300);
    if (result.error) {
      setLoadError(result.error);
    } else {
      setSessions(result.conversations);
    }
    setIsLoading(false);
  };

  const handleViewLog = async (sessionId) => {
    var result = await getConversation(sessionId);
    if (result.error) {
      alert('שגיאה בטעינת השיחה: ' + result.error);
    } else {
      setSelectedLog(result.conversation);
    }
  };

  const handleDeleteLog = async (sessionId) => {
    var confirmed = window.confirm(
      '\u26a0\ufe0f \u05de\u05d7\u05d9\u05e7\u05d4 \u05de\u05d1\u05e1\u05d9\u05e1 \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd!\n\n' +
      '\u05d4\u05d0\u05dd \u05d0\u05ea\u05d4 \u05d1\u05d8\u05d5\u05d7 \u05e9\u05d1\u05e8\u05e6\u05d5\u05e0\u05da \u05dc\u05de\u05d7\u05d5\u05e7 \u05e9\u05d9\u05d7\u05d4 \u05d6\u05d5 \u05dc\u05e6\u05de\u05d9\u05ea\u05d5\u05ea \u05de\u05d4\u05de\u05e1\u05d3 \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd?\n' +
      '\u05e4\u05e2\u05d5\u05dc\u05d4 \u05d6\u05d5 \u05d0\u05d9\u05e0\u05d4 \u05e0\u05d9\u05ea\u05e0\u05ea \u05dc\u05d1\u05d9\u05d8\u05d5\u05dc.'
    );
    if (!confirmed) return;
    var result = await deleteConversation(sessionId);
    if (result.error) {
      alert('\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05de\u05d7\u05d9\u05e7\u05d4: ' + result.error);
    } else {
      setSessions(function(prev) { return prev.filter(function(s) { return (s.sessionId || s.id) !== sessionId; }); });
      if (selectedLog && (selectedLog.sessionId === sessionId || selectedLog.id === sessionId)) {
        setSelectedLog(null);
      }
      // Also remove any marked turns from this session
      setMarkedTurns(function(prev) { return prev.filter(function(t) { return t.sessionId !== sessionId; }); });
    }
  };

  const handleExportLog = (log) => {
    var dataStr = JSON.stringify(log, null, 2);
    var dataBlob = new Blob([dataStr], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'conversation_' + log.sessionId + '_' + new Date().toISOString().split('T')[0] + '.json';
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
      var summary = await getPCKSummary(log);
      setCurrentSummary(summary.summary);
      var updated = await getConversation(log.sessionId);
      if (updated.conversation) setSelectedLog(updated.conversation);
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('שגיאה בייצור הניתוח: ' + error.message);
      setShowSummary(false);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // ---------- Turn marking ----------
  const handleMarkTurn = (turn) => {
    if (!selectedLog) return;
    var sid = selectedLog.sessionId || selectedLog.id;
    var turnKey = sid + '_' + turn.turnNumber;

    setMarkedTurns(function(prev) {
      var exists = prev.find(function(t) { return t.turnKey === turnKey; });
      if (exists) {
        return prev.filter(function(t) { return t.turnKey !== turnKey; });
      }
      var scenario = selectedLog.scenario || {};
      var userName = '';
      if (selectedLog.userSnapshot && selectedLog.userSnapshot.fullName) {
        userName = selectedLog.userSnapshot.fullName;
      } else if (selectedLog.userId) {
        userName = selectedLog.userId.slice(0, 8);
      }
      // The PCK feedback evaluates the teacher's response to the PREVIOUS turn's students.
      // So we look up turn N-1 to get the students the teacher was actually responding to.
      var prevStudents = [];
      var isOpeningMove = turn.turnNumber === 1;
      if (!isOpeningMove && selectedLog.turns) {
        for (var k = 0; k < selectedLog.turns.length; k++) {
          if (selectedLog.turns[k].turnNumber === turn.turnNumber - 1) {
            prevStudents = selectedLog.turns[k].students || [];
            break;
          }
        }
      }
      return prev.concat([{
        turnKey: turnKey,
        sessionId: sid,
        turnNumber: turn.turnNumber,
        userName: userName,
        systemVersion: selectedLog.systemVersion || '',
        date: selectedLog.startTime || '',
        scenario_text: scenario.text || '',
        scenario_misconception: scenario.misconception_focus || '',
        teacher_message: turn.teacher ? turn.teacher.message : '',
        students: prevStudents,
        isOpeningMove: isOpeningMove,
        pckFeedback: turn.pckFeedback || null,
      }]);
    });
  };

  // Build a lookup object { turnKey: true } for ConversationDetail
  const markedTurnIds = useMemo(function() {
    var obj = {};
    markedTurns.forEach(function(t) { obj[t.turnKey] = true; });
    return obj;
  }, [markedTurns]);

  // ---------- CSV export ----------
  const exportForExperts = () => {
    var skillHeaders = [];
    SKILL_IDS.forEach(function(id) {
      var name = SKILL_NAMES_HE[id];
      skillHeaders.push(name + ' - ציון (0/1/2/לא רלוונטי)');
      skillHeaders.push(name + ' - הסבר');
      skillHeaders.push(name + ' - מה היה חסר לציון גבוה יותר');
    });
    var headers = [
      'מספר',
      'משתמש',
      'תאריך',
      'גרסת מערכת',
      'תרחיש',
      'תפיסה שגויה ממוקדת',
      'הודעות תלמידים (שהמורה הגיב עליהן)',
      'תגובת המורה',
    ].concat(skillHeaders).concat([
      'איכות פדגוגית כללית (חיובי / ניטרלי / בעייתי)',
      'הערות כלליות',
    ]);

    var rows = markedTurns.map(function(t, i) {
      var studentMessages = t.isOpeningMove
        ? '(פתיחת שיחה — אין הודעות תלמידים קודמות)'
        : (t.students || []).map(function(s) { return s.name + ': ' + s.message; }).join(' | ');
      var date = t.date ? new Date(t.date).toLocaleDateString('he-IL') : '';
      var emptySkillCols = [];
      SKILL_IDS.forEach(function() { emptySkillCols.push('', '', ''); });
      return [
        i + 1,
        t.userName,
        date,
        t.systemVersion,
        t.scenario_text,
        t.scenario_misconception,
        studentMessages,
        t.teacher_message,
      ].concat(emptySkillCols).concat(['', '']);
    });

    downloadCSV('annotation_for_experts.csv', [headers].concat(rows));
  };

  const exportModelOutput = () => {
    var skillHeaders = [];
    SKILL_IDS.forEach(function(id) {
      var name = SKILL_NAMES_HE[id];
      skillHeaders.push(name + ' - ציון מודל');
      skillHeaders.push(name + ' - הסבר מודל');
    });
    var headers = [
      'מספר',
      'sessionId',
      'מספר תור',
      'משתמש',
      'תאריך',
    ].concat(skillHeaders).concat(['הודעת משוב מלאה של המודל']);

    var rows = markedTurns.map(function(t, i) {
      var feedback = t.pckFeedback;
      var skillData = [];
      SKILL_IDS.forEach(function(id) {
        if (!feedback || !feedback.skills_assessment) {
          skillData.push('', '');
          return;
        }
        var skill = null;
        for (var k = 0; k < feedback.skills_assessment.length; k++) {
          if (feedback.skills_assessment[k].skill_id === id) { skill = feedback.skills_assessment[k]; break; }
        }
        if (!skill || !skill.is_relevant) {
          skillData.push('לא רלוונטי', '');
          return;
        }
        var explanation = skill.score > 0 ? (skill.evidence || '') : (skill.what_could_be_better || '');
        skillData.push(skill.score, explanation);
      });
      var date = t.date ? new Date(t.date).toLocaleDateString('he-IL') : '';
      return [
        i + 1,
        t.sessionId,
        t.turnNumber,
        t.userName,
        date,
      ].concat(skillData).concat([feedback ? (feedback.feedback_message || '') : '']);
    });

    downloadCSV('model_output_for_researcher.csv', [headers].concat(rows));
  };

  // ---------- Helpers ----------
  const formatDate = (session) => {
    var ts = session.startTime || session.startedAt;
    if (!ts) return '—';
    return new Date(ts).toLocaleString('he-IL');
  };

  const getTurnCount = (session) => {
    if (session.turns) return session.turns.length;
    if (session.stats) return session.stats.totalTeacherMessages || 0;
    return '—';
  };

  const getUserName = (session) => {
    if (session.userSnapshot && session.userSnapshot.fullName) return session.userSnapshot.fullName;
    if (session.userId) return session.userId.slice(0, 8);
    return '—';
  };

  const allUsers = useMemo(function() { return [...new Set(sessions.map(getUserName))].sort(); }, [sessions]);
  const allVersions = useMemo(function() { return [...new Set(sessions.map(function(s) { return s.systemVersion || '—'; }))].sort(); }, [sessions]);

  const filtered = useMemo(function() {
    return sessions.filter(function(s) {
      if (filterUser && getUserName(s) !== filterUser) return false;
      if (filterVersion && (s.systemVersion || '—') !== filterVersion) return false;
      return true;
    });
  }, [sessions, filterUser, filterVersion]);

  // ---------- Render ----------
  return (
    <div style={{ padding: '80px 20px 20px 20px', direction: 'rtl', minHeight: '100vh', overflow: 'auto' }}>
      <h1>🔬 שיחות כל המשתמשים (מנהל)</h1>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ marginLeft: '6px', fontSize: '0.9rem' }}>משתמש:</label>
          <select
            className="form-select form-select-sm"
            style={{ width: '180px', display: 'inline-block' }}
            value={filterUser}
            onChange={function(e) { setFilterUser(e.target.value); }}
          >
            <option value="">כולם</option>
            {allUsers.map(function(u) { return <option key={u} value={u}>{u}</option>; })}
          </select>
        </div>
        <div>
          <label style={{ marginLeft: '6px', fontSize: '0.9rem' }}>גרסה:</label>
          <select
            className="form-select form-select-sm"
            style={{ width: '150px', display: 'inline-block' }}
            value={filterVersion}
            onChange={function(e) { setFilterVersion(e.target.value); }}
          >
            <option value="">כולן</option>
            {allVersions.map(function(v) { return <option key={v} value={v}>{v}</option>; })}
          </select>
        </div>
        <button className="btn btn-outline-secondary btn-sm" onClick={loadSessions}>רענן</button>
        <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>
          מציג {filtered.length} מתוך {sessions.length} שיחות
        </span>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
          <div className="spinner-border text-primary" role="status" />
          <p style={{ marginTop: '12px' }}>טוען שיחות מהמסד...</p>
        </div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#dc3545' }}>
          <p>שגיאה בטעינת השיחות: {loadError}</p>
          <button className="btn btn-outline-danger btn-sm" onClick={loadSessions}>נסה שוב</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
          <p>לא נמצאו שיחות</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '20px', maxHeight: 'calc(100vh - 180px)' }}>
          {/* Sessions List */}
          <div style={{ width: '320px', borderRight: '2px solid #dee2e6', paddingRight: '20px', overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
            <h3>שיחות ({filtered.length})</h3>
            {filtered.map(function(session, index) {
              var sid = session.sessionId || session.id;
              var isSelected = selectedLog && (selectedLog.sessionId === sid || selectedLog.id === sid);
              return (
                <div
                  key={sid}
                  style={{
                    padding: '10px',
                    marginBottom: '10px',
                    backgroundColor: isSelected ? '#e7f3ff' : '#f8f9fa',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: '1px solid ' + (isSelected ? '#007bff' : '#dee2e6'),
                  }}
                  onClick={function() { handleViewLog(sid); }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                      👤 {getUserName(session)}
                    </div>
                    <span style={{ fontSize: '0.72rem', backgroundColor: '#6c757d', color: '#fff', borderRadius: '4px', padding: '1px 6px' }}>
                      {session.systemVersion || '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>{formatDate(session)}</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>{getTurnCount(session)} תגובות מורה</div>
                  {session.scenario && session.scenario.text && (
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.scenario.text.slice(0, 60)}...
                    </div>
                  )}
                  <div style={{ marginTop: '8px', display: 'flex', gap: '5px' }}>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                      onClick={function(e) { e.stopPropagation(); handleExportLog(session); }}
                    >
                      ייצא JSON
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                      onClick={function(e) { e.stopPropagation(); handleDeleteLog(sid); }}
                    >
                      מחק
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Log Details */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
            {selectedLog ? (
              <ConversationDetail
                log={selectedLog}
                showUser={true}
                onExport={handleExportLog}
                onGenerateSummary={handleGenerateSummary}
                onViewSummary={handleViewSummary}
                isLoadingSummary={isLoadingSummary}
                onMarkTurn={handleMarkTurn}
                markedTurnIds={markedTurnIds}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '50px', color: '#6c757d' }}>
                <p>בחר שיחה מהרשימה לצפייה בפרטים</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sticky export bar — appears when turns are marked */}
      {markedTurns.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          left: 0,
          backgroundColor: '#1a1a2e',
          color: '#fff',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          zIndex: 2000,
          direction: 'rtl',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.35)',
        }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
            ⭐ {markedTurns.length} תורים מסומנים לייצוא
          </span>
          <button className="btn btn-warning btn-sm" onClick={exportForExperts}>
            ייצא לתיוג מומחים
          </button>
          <button className="btn btn-outline-light btn-sm" onClick={exportModelOutput}>
            ייצא פלט מודל (לחוקר)
          </button>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={function() { setMarkedTurns([]); }}
          >
            נקה הכל
          </button>
        </div>
      )}

      {showSummary && (
        <PCKSummaryModal
          summary={currentSummary}
          isLoading={isLoadingSummary}
          onClose={function() { setShowSummary(false); }}
        />
      )}
    </div>
  );
};

export default AdminConversationLogs;
