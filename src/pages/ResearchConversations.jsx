import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getResearchParticipantsApi, getConversationsByUserApi } from '../services/researchService';
import { getSubmissions } from '../services/annotationService';
import { ConversationDetail } from './ConversationLogs';
import { PCKSummaryModal } from '../components/PCKSummaryModal';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDateTime(val) {
  if (!val) return '—';
  try {
    const d = val.toDate ? val.toDate() : new Date(val);
    return d.toLocaleString('he-IL');
  } catch {
    return '—';
  }
}

function formatDateOnly(val) {
  if (!val) return '—';
  try {
    const d = val.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString('he-IL');
  } catch {
    return '—';
  }
}

function getStartTs(conv) {
  return conv.startTime || conv.startedAt || null;
}

function getTurnCount(conv) {
  if (conv.turns) return conv.turns.length;
  if (conv.stats && conv.stats.totalTeacherMessages != null) return conv.stats.totalTeacherMessages;
  return '—';
}

function getDuration(conv) {
  if (conv.stats && conv.stats.durationMinutes) return `${conv.stats.durationMinutes} דק'`;
  return '—';
}

function getScenarioTitle(conv) {
  const text = conv.scenario && conv.scenario.text;
  if (!text) return '—';
  return text.length > 70 ? text.slice(0, 70) + '...' : text;
}

function getLastActivity(conversations) {
  return conversations.reduce((max, c) => {
    const ts = getStartTs(c);
    if (!ts) return max;
    try {
      const d = new Date(ts);
      return !max || d > max ? d : max;
    } catch {
      return max;
    }
  }, null);
}

// ─── Participants table ──────────────────────────────────────────────────────

/**
 * Renders a questionnaire action cell.
 * submissionInfo: { id } | null
 *   null → questionnaire doesn't exist yet ("חסר")
 *   otherwise → "צפייה" (opens questionnaire content in read-only mode)
 */
function QuestActionCell({ submissionInfo, onNavigate }) {
  if (!submissionInfo) {
    return (
      <td style={{ textAlign: 'center' }}>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>חסר</span>
      </td>
    );
  }
  return (
    <td style={{ textAlign: 'center' }}>
      <button
        className="btn btn-sm btn-outline-primary"
        style={{ borderRadius: '20px', fontSize: '0.8rem', minWidth: '56px' }}
        onClick={() => onNavigate(submissionInfo.id)}
      >
        צפייה
      </button>
    </td>
  );
}

function ParticipantsTable({ participants, convMap, submissionMap, onNavigateToAnnotation, onSelectParticipant }) {
  if (participants.length === 0) {
    return (
      <div className="alert alert-info">
        אין משתתפי מחקר פעילים. מנהל המערכת צריך להוסיף משתתפים בעמוד "ניהול מחקר".
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
      <table className="table table-hover mb-0" style={{ direction: 'rtl' }}>
        <thead style={{ background: '#6c5ce7', color: '#fff' }}>
          <tr>
            <th>מזהה מחקר</th>
            <th style={{ textAlign: 'center' }}>שיחות</th>
            <th style={{ textAlign: 'center' }}>שאלון פתיחה</th>
            <th style={{ textAlign: 'center' }}>שאלון סיום</th>
            <th>פעילות אחרונה</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => {
            const convs = convMap[p.id] || [];
            const lastActivity = getLastActivity(convs);
            const subs = submissionMap[p.id] || {};
            return (
              <tr key={p.id}>
                <td>
                  <span className="badge fs-6" style={{ background: '#6c5ce7', color: '#fff' }}>
                    {p.researchParticipantLabel}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge bg-secondary text-white">{convs.length}</span>
                </td>
                <QuestActionCell submissionInfo={subs.pre || null} onNavigate={onNavigateToAnnotation} />
                <QuestActionCell submissionInfo={subs.post || null} onNavigate={onNavigateToAnnotation} />
                <td style={{ fontSize: '0.9rem', color: '#555' }}>
                  {formatDateOnly(lastActivity)}
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    style={{ borderRadius: '20px' }}
                    onClick={() => onSelectParticipant(p)}
                    disabled={convs.length === 0}
                  >
                    צפייה בשיחות
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Conversations table for a single participant ────────────────────────────

function ConversationsList({ participant, conversations, onSelectConversation }) {
  if (conversations.length === 0) {
    return <div className="alert alert-info">אין שיחות שמורות עבור משתתף זה.</div>;
  }

  const sorted = [...conversations].sort((a, b) => {
    const ta = getStartTs(a) || '';
    const tb = getStartTs(b) || '';
    return String(tb).localeCompare(String(ta));
  });

  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
      <table className="table table-hover mb-0" style={{ direction: 'rtl' }}>
        <thead style={{ background: '#5a4fc9', color: '#fff' }}>
          <tr>
            <th>#</th>
            <th>תרחיש</th>
            <th>תחילת שיחה</th>
            <th style={{ textAlign: 'center' }}>משך</th>
            <th style={{ textAlign: 'center' }}>תורות</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((conv, idx) => (
            <tr key={conv.id || conv.sessionId}>
              <td style={{ color: '#6c5ce7', fontWeight: 600 }}>{sorted.length - idx}</td>
              <td style={{ fontSize: '0.88rem', maxWidth: '280px' }}>
                {getScenarioTitle(conv)}
              </td>
              <td style={{ fontSize: '0.9rem' }}>{formatDateTime(getStartTs(conv))}</td>
              <td style={{ textAlign: 'center' }}>{getDuration(conv)}</td>
              <td style={{ textAlign: 'center' }}>{getTurnCount(conv)}</td>
              <td>
                <button
                  className="btn btn-sm btn-outline-primary"
                  style={{ borderRadius: '20px' }}
                  onClick={() => onSelectConversation(conv)}
                >
                  צפייה בשיחה
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Breadcrumb (shown only in detail view) ──────────────────────────────────

function Breadcrumb({ view, participant, onGoToParticipants, onGoToConversations }) {
  if (view !== 'detail') return null;
  return (
    <nav aria-label="breadcrumb" style={{ marginBottom: '16px' }}>
      <ol className="breadcrumb mb-0" style={{ fontSize: '0.9rem' }}>
        <li className="breadcrumb-item">
          <button className="btn btn-link p-0 text-decoration-none" style={{ fontSize: '0.9rem' }} onClick={onGoToParticipants}>
            שיחות מחקר
          </button>
        </li>
        {participant && (
          <li className="breadcrumb-item">
            <button className="btn btn-link p-0 text-decoration-none" style={{ fontSize: '0.9rem' }} onClick={onGoToConversations}>
              {participant.researchParticipantLabel}
            </button>
          </li>
        )}
        <li className="breadcrumb-item active">פרטי שיחה</li>
      </ol>
    </nav>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ResearchConversations() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // 'participants' | 'conversations' | 'detail'
  const [view, setView] = useState('participants');

  const [participants, setParticipants] = useState([]);
  // All conversations pre-loaded per participant: { [userId]: conversation[] }
  const [convMap, setConvMap] = useState({});
  // { [userId]: { pre: {id, annotatedByMe}|null, post: {id, annotatedByMe}|null } }
  const [submissionMap, setSubmissionMap] = useState({});

  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // PCK summary modal state
  const [showSummary, setShowSummary] = useState(false);
  const [currentSummary, setCurrentSummary] = useState(null);

  useEffect(() => {
    if (currentUser) loadParticipants();
  }, [currentUser]);

  const loadParticipants = async () => {
    setLoading(true);
    setError('');
    try {
      const users = await getResearchParticipantsApi(currentUser.uid);
      setParticipants(users);

      if (users.length > 0) {
        // Build set of research participant userId values for fast lookup
        const participantIdSet = new Set(users.map((u) => u.id));

        // Pre-load conversations and all submissions in parallel
        const [convResults, allSubmissions] = await Promise.all([
          Promise.all(users.map((u) => getConversationsByUserApi(u.id, currentUser.uid))),
          getSubmissions(currentUser.uid).catch(() => []),
        ]);

        const newConvMap = {};
        users.forEach((u, i) => {
          newConvMap[u.id] = Array.isArray(convResults[i]) ? convResults[i] : [];
        });
        setConvMap(newConvMap);

        // Build submissionMap: only for research participants
        // { [userId]: { pre: {id, annotatedByMe}|null, post: {id, annotatedByMe}|null } }
        const sMap = {};
        users.forEach((u) => { sMap[u.id] = { pre: null, post: null }; });
        (allSubmissions || []).forEach((s) => {
          if (participantIdSet.has(s.userId) && (s.testType === 'pre' || s.testType === 'post')) {
            sMap[s.userId][s.testType] = { id: s.id, annotatedByMe: !!s.annotatedByMe };
          }
        });
        setSubmissionMap(sMap);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleNavigateToAnnotation = (submissionId) => {
    navigate(`/admin/annotate/${submissionId}?readonly=true`);
  };

  const handleSelectParticipant = (participant) => {
    setSelectedParticipant(participant);
    setView('conversations');
  };

  const handleSelectConversation = (conv) => {
    setSelectedConversation(conv);
    setView('detail');
  };

  const handleGoToParticipants = () => {
    setView('participants');
    setSelectedParticipant(null);
    setSelectedConversation(null);
  };

  const handleGoToConversations = () => {
    setView('conversations');
    setSelectedConversation(null);
  };

  const handleViewSummary = (log) => {
    if (log.summaryFeedback) {
      setCurrentSummary(log.summaryFeedback);
      setShowSummary(true);
    }
  };

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">טוען...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7fc', paddingTop: '80px', paddingBottom: '60px' }}>
      <div className="container" style={{ maxWidth: '1000px', direction: 'rtl' }}>

        {/* Page title — only on participants view */}
        {view === 'participants' && (
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: 0 }}>שיחות מחקר</h2>
            <span className="badge bg-secondary text-white fs-6">{participants.length} משתתפים</span>
          </div>
        )}

        <Breadcrumb
          view={view}
          participant={selectedParticipant}
          onGoToParticipants={handleGoToParticipants}
          onGoToConversations={handleGoToConversations}
        />

        {error && <div className="alert alert-danger">{error}</div>}

        {/* Participants list */}
        {view === 'participants' && (
          <ParticipantsTable
            participants={participants}
            convMap={convMap}
            submissionMap={submissionMap}
            onNavigateToAnnotation={handleNavigateToAnnotation}
            onSelectParticipant={handleSelectParticipant}
          />
        )}

        {/* Conversations for selected participant */}
        {view === 'conversations' && selectedParticipant && (
          <>
            <button
              className="btn btn-outline-secondary btn-sm mb-3"
              onClick={handleGoToParticipants}
            >
              → חזרה לרשימת המשתתפים
            </button>
            <h4 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: '16px' }}>
              שיחות של {selectedParticipant.researchParticipantLabel}
              <span className="text-muted fw-normal ms-2" style={{ fontSize: '0.95rem' }}>
                ({(convMap[selectedParticipant.id] || []).length} שיחות)
              </span>
            </h4>
            <ConversationsList
              participant={selectedParticipant}
              conversations={convMap[selectedParticipant.id] || []}
              onSelectConversation={handleSelectConversation}
            />
          </>
        )}

        {/* Conversation detail */}
        {view === 'detail' && selectedConversation && (
          <ConversationDetail
            log={selectedConversation}
            showUser={false}
            onViewSummary={handleViewSummary}
            // Generating summaries is an admin/researcher action — pass a no-op
            onGenerateSummary={() => {}}
            isLoadingSummary={false}
            onMarkTurn={null}
            markedTurnIds={null}
          />
        )}
      </div>

      {showSummary && (
        <PCKSummaryModal
          summary={currentSummary}
          isLoading={false}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
