import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getResearchParticipantsApi, getConversationsByUserApi } from '../services/researchService';
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

function ParticipantsTable({ participants, convMap, onSelectParticipant }) {
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
            <th>פעילות אחרונה</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => {
            const convs = convMap[p.id] || [];
            const lastActivity = getLastActivity(convs);
            return (
              <tr key={p.id}>
                <td>
                  <span className="badge fs-6" style={{ background: '#6c5ce7' }}>
                    {p.researchParticipantLabel}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge bg-secondary">{convs.length}</span>
                </td>
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

// ─── Breadcrumb ──────────────────────────────────────────────────────────────

function Breadcrumb({ view, participant, onGoToParticipants, onGoToConversations }) {
  return (
    <nav aria-label="breadcrumb" style={{ marginBottom: '20px' }}>
      <ol className="breadcrumb mb-0">
        <li className={`breadcrumb-item ${view === 'participants' ? 'active' : ''}`}>
          {view !== 'participants' ? (
            <button className="btn btn-link p-0 text-decoration-none" onClick={onGoToParticipants}>
              שיחות מחקר
            </button>
          ) : (
            'שיחות מחקר'
          )}
        </li>
        {participant && (
          <li className={`breadcrumb-item ${view === 'conversations' ? 'active' : ''}`}>
            {view === 'detail' ? (
              <button className="btn btn-link p-0 text-decoration-none" onClick={onGoToConversations}>
                {participant.researchParticipantLabel}
              </button>
            ) : (
              participant.researchParticipantLabel
            )}
          </li>
        )}
        {view === 'detail' && (
          <li className="breadcrumb-item active">פרטי שיחה</li>
        )}
      </ol>
    </nav>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ResearchConversations() {
  const { currentUser } = useAuth();

  // 'participants' | 'conversations' | 'detail'
  const [view, setView] = useState('participants');

  const [participants, setParticipants] = useState([]);
  // All conversations pre-loaded per participant: { [userId]: conversation[] }
  const [convMap, setConvMap] = useState({});

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

      // Pre-load conversations for all participants in parallel
      if (users.length > 0) {
        const results = await Promise.all(
          users.map((u) => getConversationsByUserApi(u.id, currentUser.uid))
        );
        const map = {};
        users.forEach((u, i) => {
          map[u.id] = Array.isArray(results[i]) ? results[i] : [];
        });
        setConvMap(map);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
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

        {/* Page title */}
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: 0 }}>שיחות מחקר</h2>
          {view === 'participants' && (
            <span className="badge bg-secondary fs-6">{participants.length} משתתפים</span>
          )}
        </div>

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
            onSelectParticipant={handleSelectParticipant}
          />
        )}

        {/* Conversations for selected participant */}
        {view === 'conversations' && selectedParticipant && (
          <>
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="badge fs-6" style={{ background: '#6c5ce7' }}>
                {selectedParticipant.researchParticipantLabel}
              </span>
              <span className="text-muted" style={{ fontSize: '0.9rem' }}>
                {(convMap[selectedParticipant.id] || []).length} שיחות
              </span>
            </div>
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
