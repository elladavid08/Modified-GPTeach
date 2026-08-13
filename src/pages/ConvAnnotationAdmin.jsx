import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getConvsMeta,
  getAssignments,
  createAssignments,
  cancelAssignment,
  exportAnnotationsJson,
  getAdminAnnotation,
  getFullConv,
} from '../services/convAnnotationService';
import { getAllUsersApi } from '../services/researchService';
import { PCK_SKILLS } from '../config/testConfig';
import ConvAnnotationAgreement from './ConvAnnotationAgreement';
import AdminComparisonSets from './AdminComparisonSets';

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSIGNMENT_TYPES = [
  { value: 'reliability',   label: 'בדיקת הסכמה' },
  { value: 'production',    label: 'תיוג רגיל' },
  { value: 'double_coded',  label: 'תיוג כפול לבקרת איכות' },
  { value: 'adjudication',  label: 'הכרעה סופית' },
];

const CREATABLE_ASSIGNMENT_TYPES = [
  { value: 'reliability', label: 'בדיקת הסכמה' },
  { value: 'production',  label: 'תיוג רגיל' },
];

const STATUS_LABELS = {
  not_started: { he: 'טרם התחיל',   cls: 'bg-secondary text-white' },
  draft:       { he: 'טיוטה',       cls: 'bg-warning text-white' },
  completed:   { he: 'הושלם',       cls: 'bg-success text-white' },
};

const TYPE_LABELS = {
  reliability:  { he: 'בדיקת הסכמה',          cls: 'bg-primary text-white' },
  production:   { he: 'תיוג רגיל',             cls: 'bg-info text-white' },
  double_coded: { he: 'תיוג כפול לבקרת איכות', cls: 'bg-warning text-white' },
  adjudication: { he: 'הכרעה סופית',           cls: 'bg-danger text-white' },
};

const CONV_STATUS = {
  none:        { he: 'טרם שובצה',    cls: 'text-muted' },
  assigned:    { he: 'שובצה',        cls: 'text-info' },
  in_progress: { he: 'בתהליך',       cls: 'text-warning' },
  partial:     { he: 'הושלמה חלקית', cls: 'text-secondary' },
  done:        { he: 'הושלמה',       cls: 'text-success' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

/** Shows HH:mm if the timestamp is today, otherwise dd.mm.yyyy */
function formatUpdatedAt(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return null; }
}

function getScenarioTitle(conv) {
  const t = conv.scenario && conv.scenario.text;
  if (!t) return '—';
  return t.length > 60 ? t.slice(0, 60) + '...' : t;
}

function getUserName(conv) {
  if (conv.userSnapshot && conv.userSnapshot.fullName) return conv.userSnapshot.fullName;
  if (conv.userId) return conv.userId.slice(0, 8);
  return '—';
}

function getTurnCount(conv) {
  return (conv.stats && conv.stats.totalTeacherMessages) || '—';
}

function getTeacherTurnCount(assignment) {
  return (assignment.convMeta && assignment.convMeta.stats && assignment.convMeta.stats.totalTeacherMessages) || '?';
}

/**
 * Admin-only two-line conversation identity cell.
 * Line 1: scenario title (bold)
 * Line 2: userName · date  (subtle)
 * Never used in annotator-facing views.
 */
function AdminConvIdentity({ convMeta, conversationId }) {
  const title = (convMeta && convMeta.scenario && convMeta.scenario.text)
    ? convMeta.scenario.text
    : (conversationId || '—');

  const userName = (convMeta && convMeta.userSnapshot && convMeta.userSnapshot.fullName)
    || (convMeta && convMeta.userId ? convMeta.userId.slice(0, 8) : null);

  const rawDate  = convMeta && (convMeta.startedAt || convMeta.startTime);
  const dateStr  = rawDate ? formatDate(rawDate) : null;

  const subtitle = [userName, dateStr].filter(Boolean).join(' · ');

  return (
    <div>
      <div style={{ fontWeight: 500, fontSize: '0.88rem', color: '#333', lineHeight: 1.3 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: '0.76rem', color: '#888', marginTop: '2px' }}>{subtitle}</div>
      )}
    </div>
  );
}

function scoreColor(n) {
  if (n === 0) return '#e17055';
  if (n === 1) return '#fdcb6e';
  return '#00b894';
}

// ─── Read-only feedback point ─────────────────────────────────────────────────

function FeedbackPointView({ feedbackPoint: fp, index, hideTeacherSnapshot }) {
  const {
    turnNumber, teacherMessageSnapshot,
    selectedDimensions, dimensionFeedback,
    internalNote,
    // legacy fields
    feedbackText, scores,
  } = fp;

  const hasDimensionFeedback = dimensionFeedback && Object.keys(dimensionFeedback).length > 0;
  const dims = selectedDimensions || [];

  return (
    <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', marginBottom: '14px', overflow: 'hidden' }}>
      <div style={{ background: '#f0ebf8', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontWeight: 700, color: '#6c5ce7', fontSize: '0.88rem' }}>
          נקודת משוב {index + 1}
        </span>
        {turnNumber != null && (
          <span style={{ fontSize: '0.82rem', color: '#888' }}>תור {turnNumber}</span>
        )}
      </div>

      <div style={{ padding: '12px 16px' }}>
        {!hideTeacherSnapshot && teacherMessageSnapshot && (
          <div style={{
            background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '6px',
            padding: '8px 12px', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '0.74rem', color: '#888', fontWeight: 600, marginBottom: '3px' }}>
              הודעת המורה:
            </div>
            <div style={{ fontSize: '0.88rem', color: '#333' }}>{teacherMessageSnapshot}</div>
          </div>
        )}

        {/* New dimensionFeedback format */}
        {hasDimensionFeedback && dims.length > 0 && dims.map(dimId => {
          const skill = PCK_SKILLS.find(s => s.id === dimId);
          const df    = dimensionFeedback[dimId] || {};
          return (
            <div key={dimId} style={{
              marginBottom: '8px', background: '#fafafa', borderRadius: '6px',
              padding: '10px 12px', border: '1px solid #f0f0f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <span style={{
                  background: '#6c5ce7', color: '#fff', borderRadius: '4px',
                  padding: '2px 8px', fontSize: '0.76rem', fontWeight: 700,
                }}>
                  {dimId.toUpperCase()} – {skill ? skill.label : dimId}
                </span>
                {df.score != null && (
                  <span style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: scoreColor(df.score), color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.88rem', flexShrink: 0,
                  }}>
                    {df.score}
                  </span>
                )}
              </div>
              {df.feedbackText && (
                <div style={{ fontSize: '0.87rem', color: '#333' }}>{df.feedbackText}</div>
              )}
            </div>
          );
        })}

        {/* Legacy format: flat feedbackText + scores object */}
        {!hasDimensionFeedback && dims.length > 0 && dims.map(dimId => {
          const skill = PCK_SKILLS.find(s => s.id === dimId);
          const sc    = scores && scores[dimId] != null ? scores[dimId] : null;
          return (
            <div key={dimId} style={{
              marginBottom: '8px', background: '#fafafa', borderRadius: '6px',
              padding: '8px 12px', border: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{
                background: '#6c5ce7', color: '#fff', borderRadius: '4px',
                padding: '2px 8px', fontSize: '0.76rem', fontWeight: 700,
              }}>
                {dimId.toUpperCase()} – {skill ? skill.label : dimId}
              </span>
              {sc != null && (
                <span style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: scoreColor(sc), color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '0.88rem',
                }}>
                  {sc}
                </span>
              )}
            </div>
          );
        })}

        {/* Legacy flat feedback text (old format had a single string) */}
        {!hasDimensionFeedback && feedbackText && (
          <div style={{ fontSize: '0.88rem', color: '#333', marginBottom: '6px' }}>
            <strong style={{ fontSize: '0.78rem', color: '#888' }}>משוב:</strong>{' '}
            {feedbackText}
          </div>
        )}

        {internalNote && (
          <div style={{
            background: '#fffde7', border: '1px solid #fff59d', borderRadius: '6px',
            padding: '8px 12px', marginTop: '6px',
          }}>
            <div style={{ fontSize: '0.74rem', color: '#888', fontWeight: 600, marginBottom: '2px' }}>
              הערה פנימית:
            </div>
            <div style={{ fontSize: '0.85rem', color: '#555' }}>{internalNote}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Full conversation turn (read-only, with embedded feedback) ───────────────

function ConvTurnView({ turn, feedbackPoints }) {
  const fps        = (feedbackPoints || []).filter(fp => fp.turnNumber === turn.turnNumber);
  const hasFeedback = fps.length > 0;

  return (
    <div style={{
      marginBottom: '18px',
      borderRight: `4px solid ${hasFeedback ? '#6c5ce7' : '#dee2e6'}`,
      paddingRight: '14px',
    }}>
      <div style={{ fontWeight: 700, color: '#6c5ce7', fontSize: '0.8rem', marginBottom: '5px' }}>
        תור {turn.turnNumber}
      </div>

      {/* Teacher message */}
      <div style={{ background: '#f8f9fa', borderRadius: '6px', padding: '8px 12px', marginBottom: '5px', fontSize: '0.87rem', color: '#333' }}>
        <span style={{ fontWeight: 600, marginLeft: '6px' }}>מורה:</span>
        {(turn.teacher && turn.teacher.message) || '—'}
        {turn.teacher && turn.teacher.image && (
          <div style={{ marginTop: '6px' }}>
            <img
              src={`data:image/png;base64,${turn.teacher.image}`}
              alt="ציור"
              style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '4px', border: '1px solid #dee2e6', display: 'block' }}
            />
          </div>
        )}
      </div>

      {/* Student messages */}
      {(turn.students || []).map((student, i) => (
        <div key={i} style={{ background: '#e7f3ff', borderRadius: '6px', padding: '6px 12px', marginBottom: '4px', fontSize: '0.85rem', color: '#333' }}>
          <span style={{ fontWeight: 600, marginLeft: '6px' }}>{student.name}:</span>
          {student.message}
        </div>
      ))}

      {/* Feedback points for this turn — teacher snapshot hidden (already visible above) */}
      {fps.map((fp, idx) => (
        <div key={fp.feedbackPointId || idx} style={{ marginTop: '6px' }}>
          <FeedbackPointView feedbackPoint={fp} index={idx} hideTeacherSnapshot />
        </div>
      ))}
    </div>
  );
}

// ─── Read-only annotation modal ───────────────────────────────────────────────

function AnnotationViewModal({ assignment, annotation, conversation, loading, error, onClose }) {
  const typeLabel = TYPE_LABELS[assignment.assignmentType] || { he: assignment.assignmentType, cls: 'bg-secondary' };
  const title = assignment.convMeta && assignment.convMeta.scenario && assignment.convMeta.scenario.text
    ? assignment.convMeta.scenario.text
    : assignment.conversationId;

  // Turns sorted by turnNumber; fall back to index order if turnNumber is missing
  const turns = useMemo(() => {
    if (!conversation || !conversation.turns) return [];
    return [...conversation.turns].sort((a, b) => (a.turnNumber || 0) - (b.turnNumber || 0));
  }, [conversation]);

  const feedbackPoints = annotation ? (annotation.feedbackPoints || []) : [];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1060, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '40px 16px', overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '820px',
        direction: 'rtl', display: 'flex', flexDirection: 'column',
        maxHeight: '88vh',
      }}>

        {/* Header — fixed */}
        <div style={{
          padding: '18px 24px 14px', borderBottom: '1px solid #dee2e6',
          borderRadius: '12px 12px 0 0', background: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <h5 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: '8px' }}>צפייה בתיוג</h5>
              <div style={{ fontSize: '0.87rem', color: '#333', marginBottom: '6px', fontWeight: 500 }}>{title}</div>
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '0.83rem', color: '#555' }}>
                <span><strong>מעריך:</strong> {assignment.annotatorName}</span>
                <span>
                  <strong>סוג:</strong>{' '}
                  <span className={`badge ${typeLabel.cls}`} style={{ fontSize: '0.75rem' }}>{typeLabel.he}</span>
                </span>
                {annotation && (
                  <span><strong>הוגש:</strong> {formatDate(annotation.submittedAt || assignment.completedAt)}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#888', lineHeight: 1, padding: '2px 6px', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ overflowY: 'auto', padding: '18px 24px', flex: 1 }}>
          {loading && (
            <div className="text-center py-4">
              <div className="spinner-border text-primary" style={{ width: '1.8rem', height: '1.8rem' }} />
              <p className="mt-2" style={{ color: '#888', fontSize: '0.9rem' }}>טוען תיוג...</p>
            </div>
          )}

          {!loading && error && (
            <div className="alert alert-danger" style={{ fontSize: '0.9rem' }}>{error}</div>
          )}

          {!loading && !error && !annotation && (
            <div className="alert alert-warning" style={{ fontSize: '0.9rem' }}>לא נמצא תיוג עבור שיבוץ זה.</div>
          )}

          {!loading && !error && annotation && (
            <>
              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px', fontSize: '0.8rem', color: '#888' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#6c5ce7', display: 'inline-block' }} />
                  תורות עם משוב
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#dee2e6', display: 'inline-block' }} />
                  תורות ללא משוב
                </span>
              </div>

              {/* Full conversation with embedded feedback */}
              {turns.length > 0 ? (
                turns.map(turn => (
                  <ConvTurnView
                    key={turn.turnNumber}
                    turn={turn}
                    feedbackPoints={feedbackPoints}
                  />
                ))
              ) : (
                /* Fallback: no conversation data — show feedback points only */
                feedbackPoints.length === 0 ? (
                  <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>לא נמצאו נקודות משוב.</div>
                ) : (
                  feedbackPoints.map((fp, idx) => (
                    <FeedbackPointView key={fp.feedbackPointId || idx} feedbackPoint={fp} index={idx} />
                  ))
                )
              )}

              {annotation.generalComment && (
                <div style={{
                  background: '#f8f7fc', border: '1px solid #dee2e6',
                  borderRadius: '8px', padding: '12px 16px', marginTop: '12px',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#6c5ce7', marginBottom: '5px' }}>
                    הערה כללית:
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#333' }}>{annotation.generalComment}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #dee2e6', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" style={{ borderRadius: '20px' }} onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress cell ────────────────────────────────────────────────────────────

function ProgressCell({ assignment }) {
  const fpCount      = assignment.annotatedTurnCount || 0;
  const turnCount    = getTeacherTurnCount(assignment);
  const updatedLabel = formatUpdatedAt(assignment.annotationUpdatedAt);
  const hasStarted   = assignment.status === 'draft' || assignment.status === 'completed';

  return (
    <td style={{ fontSize: '0.8rem', color: '#555', whiteSpace: 'nowrap' }}>
      <div>
        <span style={{ fontWeight: 600, color: fpCount > 0 ? '#6c5ce7' : '#aaa' }}>
          נקודות משוב: {fpCount}/{turnCount}
        </span>
      </div>
      <div style={{ marginTop: '2px', color: '#999' }}>
        {hasStarted && updatedLabel
          ? `עודכן: ${updatedLabel}`
          : !hasStarted
            ? 'טרם נשמרה טיוטה'
            : null}
      </div>
    </td>
  );
}

// ─── Tab 1: Conversation browser ─────────────────────────────────────────────

function ConversationsTab({ currentUser }) {
  const [conversations, setConversations]   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [selected, setSelected]             = useState(new Set());
  const [filterText, setFilterText]         = useState('');
  const [filterVersion, setFilterVersion]   = useState('');
  const [annotators, setAnnotators]         = useState([]);
  const [assignmentType, setAssignmentType] = useState('reliability');
  const [selectedAnnotators, setSelectedAnnotators] = useState(new Set());
  const [creating, setCreating]             = useState(false);
  const [createResult, setCreateResult]     = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      getConvsMeta(currentUser.uid),
      getAllUsersApi(currentUser.uid),
    ])
      .then(([convs, users]) => {
        setConversations(convs);
        setAnnotators((users || []).filter(u => u.isAnnotator));
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [currentUser]);

  const allVersions = useMemo(
    () => [...new Set(conversations.map(c => c.systemVersion).filter(Boolean))].sort(),
    [conversations]
  );

  const filtered = useMemo(() => {
    const q = filterText.toLowerCase();
    return conversations.filter(c => {
      if (filterVersion && c.systemVersion !== filterVersion) return false;
      if (q) {
        const title = getScenarioTitle(c).toLowerCase();
        const user  = getUserName(c).toLowerCase();
        if (!title.includes(q) && !user.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, filterText, filterVersion]);

  const visibleIds  = useMemo(() => filtered.map(c => c.id), [filtered]);
  const allChecked  = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const someChecked = visibleIds.some(id => selected.has(id)) && !allChecked;

  const toggleOne = id =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleAll = () => {
    if (allChecked) setSelected(prev => { const s = new Set(prev); visibleIds.forEach(id => s.delete(id)); return s; });
    else            setSelected(prev => { const s = new Set(prev); visibleIds.forEach(id => s.add(id)); return s; });
  };

  useEffect(() => {
    if (assignmentType === 'production' && selectedAnnotators.size > 1) {
      setSelectedAnnotators(new Set());
    }
  }, [assignmentType]); // eslint-disable-line react-hooks/exhaustive-deps

  const existingAnnotatorIds = useMemo(() => {
    if (selected.size !== 1) return [];
    const convId = [...selected][0];
    const conv   = conversations.find(c => c.id === convId);
    return (conv && conv.assignmentInfo && conv.assignmentInfo.annotatorIds) || [];
  }, [selected, conversations]);

  const handleAnnotatorToggle = (id) => {
    if (assignmentType === 'production') {
      setSelectedAnnotators(prev => prev.has(id) ? new Set() : new Set([id]));
    } else {
      setSelectedAnnotators(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    }
  };

  const handleCreate = async () => {
    if (selected.size === 0 || selectedAnnotators.size === 0) return;
    setCreating(true);
    setCreateResult(null);
    const items = [];
    selected.forEach(convId => {
      selectedAnnotators.forEach(annotatorId => {
        items.push({ conversationId: convId, annotatorId, assignmentType });
      });
    });
    try {
      const result = await createAssignments(currentUser.uid, items);
      setCreateResult(result);
      setSelected(new Set());
      setSelectedAnnotators(new Set());
      const updatedConvs = await getConvsMeta(currentUser.uid);
      setConversations(updatedConvs);
    } catch (err) {
      setCreateResult({ error: err.message });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  if (error)   return <div className="alert alert-danger">{error}</div>;

  return (
    <div>
      {/* Filter bar */}
      <div style={{ background: '#fff', border: '1px solid #dee2e6', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <input
            className="form-control form-control-sm"
            placeholder="חיפוש לפי תרחיש או משתמש..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            style={{ direction: 'rtl' }}
          />
        </div>
        <div>
          <select className="form-select form-select-sm" style={{ minWidth: '150px' }} value={filterVersion} onChange={e => setFilterVersion(e.target.value)}>
            <option value="">כל הגרסאות</option>
            {allVersions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>
          {filtered.length} שיחות
          {selected.size > 0 && <strong style={{ color: '#6c5ce7', marginRight: '8px' }}> · {selected.size} נבחרו</strong>}
        </span>
      </div>

      {/* Assignment creation panel */}
      {selected.size > 0 && (
        <div style={{ background: '#f0ebf8', border: '1px solid #b39ddb', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', direction: 'rtl' }}>
          <h6 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: '14px' }}>יצירת שיבוצים עבור {selected.size} שיחות נבחרות</h6>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>סוג שיבוץ:</div>
              {CREATABLE_ASSIGNMENT_TYPES.map(t => (
                <label key={t.value} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="assignmentType"
                    value={t.value}
                    checked={assignmentType === t.value}
                    onChange={() => setAssignmentType(t.value)}
                    style={{ marginLeft: '6px' }}
                  />
                  {t.label}
                </label>
              ))}
            </div>

            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>
                {assignmentType === 'production' ? 'מעריך (בחר אחד):' : 'מעריכים (ניתן לבחור כמה):'}
              </div>
              {selected.size === 1 && existingAnnotatorIds.length > 0 && (
                <div style={{ fontSize: '0.79rem', color: '#6c5ce7', marginBottom: '8px' }}>
                  מעריכים המסומנים כבר משובצים לשיחה זו ולא ניתן לשנות זאת כאן.
                </div>
              )}
              {selected.size > 1 && (
                <div style={{ fontSize: '0.79rem', color: '#888', marginBottom: '8px', fontStyle: 'italic' }}>
                  לחלק מהשיחות עשויים כבר להיות שיבוצים קיימים. שיבוצים כפולים לא יווצרו מחדש.
                </div>
              )}
              {annotators.length === 0 ? (
                <span style={{ color: '#999', fontSize: '0.85rem' }}>לא נמצאו מעריכים</span>
              ) : (
                annotators.map(a => {
                  const isExisting = existingAnnotatorIds.includes(a.id);
                  const isChecked  = selectedAnnotators.has(a.id) || isExisting;
                  return (
                    <label
                      key={a.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        marginLeft: '12px', marginBottom: '6px', fontSize: '0.9rem',
                        cursor: isExisting ? 'default' : 'pointer',
                        opacity: isExisting ? 0.65 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isExisting}
                        onChange={() => handleAnnotatorToggle(a.id)}
                      />
                      {a.fullName || a.email || a.id}
                      {isExisting && (
                        <span style={{ fontSize: '0.72rem', color: '#6c5ce7', fontWeight: 600 }}>(משובץ)</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: '0.85rem', color: '#555' }}>
                יווצרו <strong>{selected.size * selectedAnnotators.size}</strong> שיבוצים
                {assignmentType === 'production'
                  ? ` (${selected.size} שיחות × מעריך אחד)`
                  : ` (${selected.size} שיחות × ${selectedAnnotators.size} מעריכים)`
                }
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}
                disabled={selectedAnnotators.size === 0 || creating}
                onClick={handleCreate}
              >
                {creating ? 'יוצר...' : 'צור שיבוצים'}
              </button>
            </div>
          </div>

          {createResult && !createResult.error && (
            <div className="mt-3">
              {createResult.created.length > 0 && (
                <div className="alert alert-success py-2 mb-2" style={{ fontSize: '0.88rem' }}>
                  נוצרו {createResult.created.length} שיבוצים בהצלחה.
                </div>
              )}
              {createResult.skipped.length > 0 && (
                <div className="alert alert-warning py-2 mb-0" style={{ fontSize: '0.85rem' }}>
                  <strong>{createResult.skipped.length} שיבוצים דולגו</strong> — כל מעריך יכול לקבל שיבוץ אחד בלבד לכל שיחה:
                  <ul className="mb-1 mt-1" style={{ paddingRight: '20px' }}>
                    {createResult.skipped.map((s, i) => {
                      const annotator = annotators.find(a => a.id === s.annotatorId);
                      const name = annotator ? (annotator.fullName || annotator.email || s.annotatorId) : s.annotatorId;
                      const existingLabel = TYPE_LABELS[s.existingType] ? TYPE_LABELS[s.existingType].he : s.existingType;
                      return (
                        <li key={i}>
                          <strong>{name}</strong> — כבר משובץ לשיחה זו (סוג קיים: <em>{existingLabel}</em>)
                        </li>
                      );
                    })}
                  </ul>
                  <small style={{ color: '#666' }}>כדי לשנות סוג שיבוץ, מחק את השיבוץ הקיים בלשונית "שיבוצים" ואז צור חדש.</small>
                </div>
              )}
            </div>
          )}
          {createResult && createResult.error && (
            <div className="alert alert-danger py-2 mt-3 mb-0">{createResult.error}</div>
          )}
        </div>
      )}

      {/* Conversations table */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
        <table className="table table-hover mb-0" style={{ direction: 'rtl', fontSize: '0.875rem' }}>
          <thead style={{ background: '#6c5ce7', color: '#fff' }}>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                />
              </th>
              <th>משתמש</th>
              <th>תרחיש</th>
              <th>תאריך</th>
              <th style={{ textAlign: 'center' }}>תורות</th>
              <th style={{ textAlign: 'center' }}>מצב תיוג</th>
              <th>מעריכים</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888', padding: '20px' }}>לא נמצאו שיחות</td></tr>
            )}
            {filtered.map(conv => {
              const ai = conv.assignmentInfo || { count: 0, annotators: [], types: [], derivedStatus: 'none' };
              const cs = CONV_STATUS[ai.derivedStatus] || CONV_STATUS.none;
              return (
                <tr
                  key={conv.id}
                  onClick={() => toggleOne(conv.id)}
                  style={{ cursor: 'pointer', background: selected.has(conv.id) ? '#f0ebf8' : undefined }}
                >
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(conv.id)} onChange={() => toggleOne(conv.id)} />
                  </td>
                  <td style={{ fontWeight: 500 }}>{getUserName(conv)}</td>
                  <td style={{ color: '#444', maxWidth: '260px' }}>{getScenarioTitle(conv)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(conv.startTime || conv.startedAt)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge bg-light text-dark">{getTurnCount(conv)}</span>
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span className={cs.cls} style={{ fontWeight: 600, fontSize: '0.8rem' }}>{cs.he}</span>
                    {ai.count > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '2px' }}>{ai.count} שיבוצים</div>
                    )}
                    {ai.types && ai.types.length > 0 && (
                      <div style={{ marginTop: '3px', display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {ai.types.map(t => {
                          const tl = TYPE_LABELS[t] || { he: t, cls: 'bg-secondary' };
                          return <span key={t} className={`badge ${tl.cls}`} style={{ fontSize: '0.7rem' }}>{tl.he}</span>;
                        })}
                      </div>
                    )}
                  </td>
                  <td style={{ maxWidth: '160px', fontSize: '0.8rem', color: '#555' }}>
                    {ai.annotators && ai.annotators.length > 0
                      ? ai.annotators.join(', ')
                      : <span style={{ color: '#bbb' }}>—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Grouped conversation status ──────────────────────────────────────────────

function getGroupStatus(groupAssignments) {
  const statuses      = groupAssignments.map(a => a.status);
  const types         = groupAssignments.map(a => a.assignmentType);
  const allCompleted  = statuses.every(s => s === 'completed');
  const someCompleted = statuses.some(s => s === 'completed');
  const anyDraft      = statuses.some(s => s === 'draft');
  // Ready when: all completed, at least one reliability assignment, and ≥2 assignments total.
  const hasAnyReliability = types.some(t => t === 'reliability');
  if (allCompleted && hasAnyReliability && groupAssignments.length >= 2) return 'ready_for_agreement';
  if (allCompleted)   return 'done';
  if (someCompleted)  return 'partial';
  if (anyDraft)       return 'in_progress';
  return 'not_started';
}

const GROUP_STATUS = {
  not_started:         { he: 'טרם התחיל',         cls: 'bg-secondary text-white' },
  in_progress:         { he: 'בתהליך',              cls: 'bg-warning text-white' },
  partial:             { he: 'הושלם חלקית',         cls: 'bg-info text-white' },
  done:                { he: 'הושלם',               cls: 'bg-success text-white' },
  ready_for_agreement: { he: 'מוכן לחישוב הסכמה', cls: 'bg-primary text-white' },
};

// ─── Grouped view ─────────────────────────────────────────────────────────────

function GroupedView({ assignments, cancellingId, onCancel, onViewAnnotation }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  const groups = useMemo(() => {
    const map = {};
    assignments.forEach(a => {
      if (!map[a.conversationId]) {
        map[a.conversationId] = { conversationId: a.conversationId, convMeta: a.convMeta, assignments: [] };
      }
      map[a.conversationId].assignments.push(a);
    });
    return Object.values(map);
  }, [assignments]);

  const toggleExpanded = id =>
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  if (groups.length === 0) return <div className="alert alert-info">אין שיבוצים לתצוגה.</div>;

  return (
    <div>
      {groups.map(group => {
        const isExpanded   = expandedIds.has(group.conversationId);
        const gStatus      = getGroupStatus(group.assignments);
        const gs           = GROUP_STATUS[gStatus] || GROUP_STATUS.not_started;
        const completedCnt = group.assignments.filter(a => a.status === 'completed').length;
        const types        = [...new Set(group.assignments.map(a => a.assignmentType))];
        const names        = [...new Set(group.assignments.map(a => a.annotatorName).filter(Boolean))];
        const totalFp      = group.assignments.reduce((sum, a) => sum + (a.annotatedTurnCount || 0), 0);

        return (
          <div key={group.conversationId} style={{ border: '1px solid #dee2e6', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden', background: '#fff' }}>
            {/* Group header */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', cursor: 'pointer', background: isExpanded ? '#f0ebf8' : '#fff', flexWrap: 'wrap' }}
              onClick={() => toggleExpanded(group.conversationId)}
            >
              <span style={{ color: '#6c5ce7', fontWeight: 700, fontSize: '0.85rem', minWidth: '14px' }}>
                {isExpanded ? '▲' : '▼'}
              </span>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <AdminConvIdentity convMeta={group.convMeta} conversationId={group.conversationId} />
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                {types.map(t => {
                  const tl = TYPE_LABELS[t] || { he: t, cls: 'bg-secondary' };
                  return <span key={t} className={`badge ${tl.cls}`} style={{ fontSize: '0.72rem' }}>{tl.he}</span>;
                })}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#555', minWidth: '90px' }}>{names.join(', ')}</div>
              <div style={{ fontSize: '0.82rem', color: '#555', minWidth: '70px', whiteSpace: 'nowrap' }}>
                {completedCnt}/{group.assignments.length} הושלמו
              </div>
              {totalFp > 0 && (
                <div style={{ fontSize: '0.78rem', color: '#888', whiteSpace: 'nowrap' }}>
                  {totalFp} נקודות משוב
                </div>
              )}
              <span className={`badge ${gs.cls}`} style={{ fontSize: '0.76rem' }}>{gs.he}</span>
            </div>

            {/* Expanded sub-rows */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #dee2e6' }}>
                <table className="table table-sm mb-0" style={{ direction: 'rtl', fontSize: '0.82rem' }}>
                  <thead style={{ background: '#f8f7fc' }}>
                    <tr>
                      <th>מעריך</th>
                      <th>סוג</th>
                      <th>סטטוס</th>
                      <th>התקדמות</th>
                      <th>נוצר</th>
                      <th>הושלם</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.assignments.map(a => {
                      const st = STATUS_LABELS[a.status]       || { he: a.status,         cls: 'bg-secondary' };
                      const tp = TYPE_LABELS[a.assignmentType] || { he: a.assignmentType, cls: 'bg-secondary' };
                          const fpCount      = a.annotatedTurnCount || 0;
                      const turnCount    = getTeacherTurnCount(a);
                      const updatedLabel = formatUpdatedAt(a.annotationUpdatedAt);
                      const isCompleted  = a.status === 'completed';
                      const hasStarted   = a.status === 'draft' || isCompleted;
                      return (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500 }}>{a.annotatorName}</td>
                          <td><span className={`badge ${tp.cls}`} style={{ fontSize: '0.72rem' }}>{tp.he}</span></td>
                          <td><span className={`badge ${st.cls}`} style={{ fontSize: '0.72rem' }}>{st.he}</span></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: fpCount > 0 ? '#6c5ce7' : '#aaa', fontSize: '0.8rem' }}>
                              {fpCount}/{turnCount}
                            </div>
                            <div style={{ color: '#bbb', fontSize: '0.75rem' }}>
                              {hasStarted && updatedLabel ? `עודכן: ${updatedLabel}` : !hasStarted ? 'טרם נשמר' : null}
                            </div>
                          </td>
                          <td>{formatDate(a.createdAt)}</td>
                          <td>{formatDate(a.completedAt)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                              {isCompleted ? (
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  style={{ borderRadius: '20px', fontSize: '0.72rem', padding: '1px 8px' }}
                                  onClick={() => onViewAnnotation(a)}
                                >
                                  צפייה בתיוג
                                </button>
                              ) : (
                                <span
                                  className="text-muted"
                                  style={{ fontSize: '0.72rem', cursor: 'default' }}
                                  title="ניתן לצפות בתיוג לאחר השלמה"
                                >
                                  ציפייה בתיוג
                                </span>
                              )}
                              <button
                                className="btn btn-sm btn-outline-danger"
                                style={{ borderRadius: '20px', fontSize: '0.72rem', padding: '1px 8px' }}
                                disabled={cancellingId === a.id}
                                onClick={() => onCancel(a.id, a.status)}
                              >
                                {cancellingId === a.id ? '...' : 'מחק'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab 2: Assignments ───────────────────────────────────────────────────────

function AssignmentsTab({ currentUser }) {
  const [allAssignments, setAllAssignments] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [filterType, setFilterType]         = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [viewMode, setViewMode]             = useState('flat');
  const [exporting, setExporting]           = useState(false);
  const [exportError, setExportError]       = useState('');
  const [cancellingId, setCancellingId]     = useState(null);
  const [cancelError, setCancelError]       = useState('');

  // Read-only annotation modal state
  const [modalAssignment, setModalAssignment]   = useState(null);
  const [modalAnnotation, setModalAnnotation]   = useState(null);
  const [modalConversation, setModalConversation] = useState(null);
  const [modalLoading, setModalLoading]         = useState(false);
  const [modalError, setModalError]             = useState('');

  const load = useCallback(() => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    getAssignments(currentUser.uid, {})
      .then(data => { setAllAssignments(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const assignments = useMemo(() => allAssignments.filter(a => {
    if (filterType   && a.assignmentType !== filterType)   return false;
    if (filterStatus && a.status         !== filterStatus) return false;
    return true;
  }), [allAssignments, filterType, filterStatus]);

  const summary = useMemo(() => {
    const total     = allAssignments.length;
    const completed = allAssignments.filter(a => a.status === 'completed').length;
    // A conversation is "ready for agreement" when it has ≥1 reliability assignment
    // AND ≥2 completed assignments (any type).
    const relConvIds = [...new Set(
      allAssignments.filter(a => a.assignmentType === 'reliability').map(a => a.conversationId)
    )];
    const reliabilityReady = relConvIds.filter(cid => {
      const ca = allAssignments.filter(a => a.conversationId === cid);
      return ca.filter(a => a.status === 'completed').length >= 2;
    }).length;
    const regularCompleted = allAssignments.filter(
      a => a.assignmentType !== 'reliability' && a.status === 'completed'
    ).length;
    return { total, completed, reliabilityReady, regularCompleted };
  }, [allAssignments]);

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const data = await exportAnnotationsJson(currentUser.uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `annotations_export_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleCancel = async (assignmentId, status) => {
    const hasAnnotation = status === 'draft' || status === 'completed';
    const msg = hasAnnotation
      ? 'שיבוץ זה כולל תיוג שכבר נשמר. מחיקה תסיר גם את נתוני התיוג לצמיתות. להמשיך?'
      : 'האם למחוק שיבוץ זה? הפעולה אינה הפיכה.';
    if (!window.confirm(msg)) return;
    setCancellingId(assignmentId);
    setCancelError('');
    try {
      await cancelAssignment(currentUser.uid, assignmentId);
      setAllAssignments(prev => prev.filter(a => a.id !== assignmentId));
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const handleViewAnnotation = async (assignment) => {
    setModalAssignment(assignment);
    setModalAnnotation(null);
    setModalConversation(null);
    setModalError('');
    setModalLoading(true);
    try {
      const [annotation, conv] = await Promise.all([
        getAdminAnnotation(assignment.id, currentUser.uid),
        getFullConv(assignment.conversationId, currentUser.uid),
      ]);
      setModalAnnotation(annotation);
      setModalConversation(conv);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalAssignment(null);
    setModalAnnotation(null);
    setModalConversation(null);
    setModalError('');
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  if (error)   return <div className="alert alert-danger">{error}</div>;

  const summaryCards = [
    { label: 'סה"כ שיבוצים',        value: summary.total,            color: '#6c5ce7' },
    { label: 'הושלמו',               value: summary.completed,        color: '#00b894' },
    { label: 'שיחות מוכנות להסכמה', value: summary.reliabilityReady, color: '#0984e3' },
    { label: 'תיוג רגיל שהושלם',    value: summary.regularCompleted, color: '#e17055' },
  ];

  return (
    <div>
      {/* Modal */}
      {modalAssignment && (
        <AnnotationViewModal
          assignment={modalAssignment}
          annotation={modalAnnotation}
          conversation={modalConversation}
          loading={modalLoading}
          error={modalError}
          onClose={handleCloseModal}
        />
      )}

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{ background: '#fff', border: `2px solid ${card.color}`, borderRadius: '10px', padding: '12px 20px', textAlign: 'center', minWidth: '130px' }}>
            <div style={{ fontSize: '1.7rem', fontWeight: 700, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
            <div style={{ fontSize: '0.76rem', color: '#555', marginTop: '4px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Controls bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ fontWeight: 600, marginLeft: '6px', fontSize: '0.85rem' }}>סוג שיבוץ:</label>
          <select className="form-select form-select-sm" style={{ display: 'inline-block', width: 'auto', minWidth: '180px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">הכל</option>
            {ASSIGNMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontWeight: 600, marginLeft: '6px', fontSize: '0.85rem' }}>סטטוס:</label>
          <select className="form-select form-select-sm" style={{ display: 'inline-block', width: 'auto', minWidth: '140px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">הכל</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l.he}</option>)}
          </select>
        </div>
        <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>{assignments.length} שיבוצים</span>

        <div style={{ display: 'flex', gap: '2px', padding: '3px', background: '#f0ebf8', borderRadius: '20px' }}>
          {[{ id: 'flat', label: 'לפי שיבוץ' }, { id: 'grouped', label: 'לפי שיחה' }].map(v => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              style={{
                borderRadius: '16px', border: 'none', padding: '4px 14px',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                background: viewMode === v.id ? '#6c5ce7' : 'transparent',
                color:      viewMode === v.id ? '#fff'     : '#6c5ce7',
                transition: 'all 0.15s',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {cancelError && <span style={{ color: '#d63031', fontSize: '0.85rem' }}>{cancelError}</span>}
          <button
            className="btn btn-sm btn-outline-primary"
            style={{ borderRadius: '20px' }}
            disabled={exporting || allAssignments.length === 0}
            onClick={handleExport}
          >
            {exporting ? 'מייצא...' : 'ייצא JSON'}
          </button>
          {exportError && <span style={{ color: '#d63031', fontSize: '0.85rem' }}>{exportError}</span>}
        </div>
      </div>

      {/* Content */}
      {assignments.length === 0 ? (
        <div className="alert alert-info">אין שיבוצים לתצוגה.</div>
      ) : viewMode === 'flat' ? (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
          <table className="table table-hover mb-0" style={{ direction: 'rtl' }}>
            <thead style={{ background: '#6c5ce7', color: '#fff' }}>
              <tr>
                <th>תרחיש</th>
                <th>מעריך</th>
                <th>סוג</th>
                <th>סטטוס</th>
                <th>התקדמות</th>
                <th>נוצר</th>
                <th>הושלם</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => {
                const st    = STATUS_LABELS[a.status]       || { he: a.status,         cls: 'bg-secondary' };
                const tp    = TYPE_LABELS[a.assignmentType] || { he: a.assignmentType, cls: 'bg-secondary' };
                const isCompleted = a.status === 'completed';
                return (
                  <tr key={a.id}>
                    <td style={{ maxWidth: '260px' }}>
                      <AdminConvIdentity convMeta={a.convMeta} conversationId={a.conversationId} />
                    </td>
                    <td style={{ fontWeight: 500 }}>{a.annotatorName}</td>
                    <td><span className={`badge ${tp.cls}`} style={{ fontSize: '0.8rem' }}>{tp.he}</span></td>
                    <td><span className={`badge ${st.cls}`} style={{ fontSize: '0.8rem' }}>{st.he}</span></td>
                    <ProgressCell assignment={a} />
                    <td style={{ fontSize: '0.85rem' }}>{formatDate(a.createdAt)}</td>
                    <td style={{ fontSize: '0.85rem' }}>{formatDate(a.completedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'nowrap' }}>
                        {isCompleted ? (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            style={{ borderRadius: '20px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                            onClick={() => handleViewAnnotation(a)}
                          >
                            צפייה בתיוג
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            style={{ borderRadius: '20px', fontSize: '0.78rem', whiteSpace: 'nowrap', opacity: 0.45, cursor: 'default' }}
                            disabled
                            title="ניתן לצפות בתיוג לאחר השלמה"
                          >
                            צפייה בתיוג
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-outline-danger"
                          style={{ borderRadius: '20px', fontSize: '0.78rem' }}
                          disabled={cancellingId === a.id}
                          onClick={() => handleCancel(a.id, a.status)}
                        >
                          {cancellingId === a.id ? '...' : 'מחק'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <GroupedView
          assignments={assignments}
          cancellingId={cancellingId}
          onCancel={handleCancel}
          onViewAnnotation={handleViewAnnotation}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConvAnnotationAdmin() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('conversations');

  const tabStyle = (tab) => ({
    padding: '8px 20px',
    borderRadius: '20px',
    border: 'none',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.9rem',
    background:   activeTab === tab ? '#6c5ce7' : 'transparent',
    color:        activeTab === tab ? '#fff'     : '#6c5ce7',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7fc', paddingTop: '80px', paddingBottom: '60px' }}>
      <div className="container" style={{ maxWidth: '1100px', direction: 'rtl' }}>

        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: '6px' }}>ניהול תיוג שיחות</h2>
          <p style={{ color: '#666', marginBottom: 0 }}>בחר שיחות, צור שיבוצים למעריכים, ועקוב אחר ההתקדמות.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', padding: '6px', background: '#fff', borderRadius: '28px', border: '1px solid #dee2e6', width: 'fit-content' }}>
          <button style={tabStyle('conversations')} onClick={() => setActiveTab('conversations')}>
            שיחות לתיוג
          </button>
          <button style={tabStyle('assignments')} onClick={() => setActiveTab('assignments')}>
            שיבוצים
          </button>
          <button style={tabStyle('agreement')} onClick={() => setActiveTab('agreement')}>
            הסכמה בין מעריכים
          </button>
          <button style={tabStyle('comparisons')} onClick={() => setActiveTab('comparisons')}>
            סטי השוואה
          </button>
        </div>

        {activeTab === 'conversations' && <ConversationsTab currentUser={currentUser} />}
        {activeTab === 'assignments'   && <AssignmentsTab   currentUser={currentUser} />}
        {activeTab === 'agreement'     && <ConvAnnotationAgreement />}
        {activeTab === 'comparisons'   && <AdminComparisonSets />}
      </div>
    </div>
  );
}
