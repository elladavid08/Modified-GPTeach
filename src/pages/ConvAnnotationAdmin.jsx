import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getConvsMeta,
  getAssignments,
  createAssignments,
  cancelAssignment,
  exportAnnotationsJson,
} from '../services/convAnnotationService';
import { getAllUsersApi } from '../services/researchService';

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSIGNMENT_TYPES = [
  { value: 'reliability',   label: 'בדיקת הסכמה' },
  { value: 'production',    label: 'תיוג רגיל' },
  { value: 'double_coded',  label: 'תיוג כפול לבקרת איכות' },
  { value: 'adjudication',  label: 'הכרעה סופית' },
];

const STATUS_LABELS = {
  not_started: { he: 'טרם התחיל',   cls: 'bg-secondary' },
  draft:       { he: 'טיוטה',       cls: 'bg-warning text-dark' },
  completed:   { he: 'הושלם',       cls: 'bg-success text-white' },
};

// Assignment type labels — used in admin views only (never shown to annotators)
const TYPE_LABELS = {
  reliability:  { he: 'בדיקת הסכמה',         cls: 'bg-primary text-white' },
  production:   { he: 'תיוג רגיל',            cls: 'bg-info text-dark' },
  double_coded: { he: 'תיוג כפול לבקרת איכות', cls: 'bg-warning text-dark' },
  adjudication: { he: 'הכרעה סופית',          cls: 'bg-danger text-white' },
};

// Derived status for a conversation based on its assignments
const CONV_STATUS = {
  none:        { he: 'טרם שובצה',    cls: 'text-muted' },
  assigned:    { he: 'שובצה',        cls: 'text-info' },
  in_progress: { he: 'בתהליך',       cls: 'text-warning' },
  partial:     { he: 'הושלמה חלקית', cls: 'text-secondary' },
  done:        { he: 'הושלמה',       cls: 'text-success' },
};

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
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

// ─── Tab 1: Conversation browser ─────────────────────────────────────────────

function ConversationsTab({ currentUser }) {
  const [conversations, setConversations]   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [selected, setSelected]             = useState(new Set()); // Set of convIds
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
        const title   = getScenarioTitle(c).toLowerCase();
        const user    = getUserName(c).toLowerCase();
        if (!title.includes(q) && !user.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, filterText, filterVersion]);

  const visibleIds   = useMemo(() => filtered.map(c => c.id), [filtered]);
  const allChecked   = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const someChecked  = visibleIds.some(id => selected.has(id)) && !allChecked;

  const toggleOne = id =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleAll = () => {
    if (allChecked) setSelected(prev => { const s = new Set(prev); visibleIds.forEach(id => s.delete(id)); return s; });
    else            setSelected(prev => { const s = new Set(prev); visibleIds.forEach(id => s.add(id)); return s; });
  };

  const toggleAnnotator = id =>
    setSelectedAnnotators(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

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
      // Reload conversations so assignment info columns reflect the new assignments
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

      {/* Assignment creation panel — shown when ≥1 conversation selected */}
      {selected.size > 0 && (
        <div style={{ background: '#f0ebf8', border: '1px solid #b39ddb', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', direction: 'rtl' }}>
          <h6 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: '14px' }}>יצירת שיבוצים עבור {selected.size} שיחות נבחרות</h6>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Assignment type */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>סוג שיבוץ:</div>
              {ASSIGNMENT_TYPES.map(t => (
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

            {/* Annotators */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>מעריכים:</div>
              {annotators.length === 0
                ? <span style={{ color: '#999', fontSize: '0.85rem' }}>לא נמצאו מעריכים</span>
                : annotators.map(a => (
                  <label key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '12px', marginBottom: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedAnnotators.has(a.id)}
                      onChange={() => toggleAnnotator(a.id)}
                    />
                    {a.fullName || a.email || a.id}
                  </label>
                ))
              }
            </div>

            {/* Preview + create button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: '0.85rem', color: '#555' }}>
                יווצרו <strong>{selected.size * selectedAnnotators.size}</strong> שיבוצים
                ({selected.size} שיחות × {selectedAnnotators.size} מעריכים)
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
                      <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '2px' }}>
                        {ai.count} שיבוצים
                      </div>
                    )}
                    {ai.types && ai.types.length > 0 && (
                      <div style={{ marginTop: '3px', display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {ai.types.map(t => {
                          const tl = TYPE_LABELS[t] || { he: t, cls: 'bg-secondary' };
                          return (
                            <span key={t} className={`badge ${tl.cls}`} style={{ fontSize: '0.7rem' }}>{tl.he}</span>
                          );
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

// ─── Grouped conversation status ─────────────────────────────────────────────

function getGroupStatus(groupAssignments) {
  const statuses    = groupAssignments.map(a => a.status);
  const types       = groupAssignments.map(a => a.assignmentType);
  const allCompleted  = statuses.every(s => s === 'completed');
  const someCompleted = statuses.some(s => s === 'completed');
  const anyDraft      = statuses.some(s => s === 'draft');
  const allReliability = types.every(t => t === 'reliability');
  if (allCompleted && allReliability && groupAssignments.length >= 2) return 'ready_for_agreement';
  if (allCompleted)   return 'done';
  if (someCompleted)  return 'partial';
  if (anyDraft)       return 'in_progress';
  return 'not_started';
}

const GROUP_STATUS = {
  not_started:         { he: 'טרם התחיל',            cls: 'bg-secondary' },
  in_progress:         { he: 'בתהליך',                cls: 'bg-warning text-dark' },
  partial:             { he: 'הושלם חלקית',           cls: 'bg-info text-dark' },
  done:                { he: 'הושלם',                  cls: 'bg-success text-white' },
  ready_for_agreement: { he: 'מוכן לחישוב הסכמה',    cls: 'bg-primary text-white' },
};

// ─── Grouped view sub-component ───────────────────────────────────────────────

function GroupedView({ assignments, cancellingId, onCancel }) {
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
        const title        = (group.convMeta && group.convMeta.scenario && group.convMeta.scenario.text)
          ? group.convMeta.scenario.text.slice(0, 65) + (group.convMeta.scenario.text.length > 65 ? '...' : '')
          : group.conversationId.slice(0, 14) + '...';
        const gStatus      = getGroupStatus(group.assignments);
        const gs           = GROUP_STATUS[gStatus] || GROUP_STATUS.not_started;
        const completedCnt = group.assignments.filter(a => a.status === 'completed').length;
        const types        = [...new Set(group.assignments.map(a => a.assignmentType))];
        const names        = [...new Set(group.assignments.map(a => a.annotatorName).filter(Boolean))];

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
              <div style={{ flex: 1, minWidth: '200px', fontSize: '0.88rem', fontWeight: 500, color: '#333' }}>
                {title}
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
                      <th>נוצר</th>
                      <th>הושלם</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.assignments.map(a => {
                      const st = STATUS_LABELS[a.status]       || { he: a.status,         cls: 'bg-secondary' };
                      const tp = TYPE_LABELS[a.assignmentType] || { he: a.assignmentType, cls: 'bg-secondary' };
                      return (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500 }}>{a.annotatorName}</td>
                          <td><span className={`badge ${tp.cls}`} style={{ fontSize: '0.72rem' }}>{tp.he}</span></td>
                          <td><span className={`badge ${st.cls}`} style={{ fontSize: '0.72rem' }}>{st.he}</span></td>
                          <td>{formatDate(a.createdAt)}</td>
                          <td>{formatDate(a.completedAt)}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              style={{ borderRadius: '20px', fontSize: '0.72rem', padding: '1px 8px' }}
                              disabled={cancellingId === a.id}
                              onClick={() => onCancel(a.id, a.status)}
                            >
                              {cancellingId === a.id ? '...' : 'מחק'}
                            </button>
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

  const load = useCallback(() => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    // Always fetch all — filter client-side so summary cards stay accurate
    getAssignments(currentUser.uid, {})
      .then(data => { setAllAssignments(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  // Client-side filtered view
  const assignments = useMemo(() => allAssignments.filter(a => {
    if (filterType   && a.assignmentType !== filterType)   return false;
    if (filterStatus && a.status         !== filterStatus) return false;
    return true;
  }), [allAssignments, filterType, filterStatus]);

  // Summary computed from the unfiltered list
  const summary = useMemo(() => {
    const total     = allAssignments.length;
    const completed = allAssignments.filter(a => a.status === 'completed').length;
    const relConvIds = [...new Set(
      allAssignments.filter(a => a.assignmentType === 'reliability').map(a => a.conversationId)
    )];
    const reliabilityReady = relConvIds.filter(cid => {
      const ca = allAssignments.filter(a => a.conversationId === cid);
      return ca.length >= 2 && ca.every(a => a.status === 'completed');
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

        {/* View toggle */}
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
                <th>נוצר</th>
                <th>הושלם</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => {
                const st    = STATUS_LABELS[a.status]       || { he: a.status,         cls: 'bg-secondary' };
                const tp    = TYPE_LABELS[a.assignmentType] || { he: a.assignmentType, cls: 'bg-secondary' };
                const title = (a.convMeta && a.convMeta.scenario && a.convMeta.scenario.text)
                  ? a.convMeta.scenario.text.slice(0, 55) + (a.convMeta.scenario.text.length > 55 ? '...' : '')
                  : a.conversationId.slice(0, 12) + '...';
                return (
                  <tr key={a.id}>
                    <td style={{ fontSize: '0.88rem', maxWidth: '280px' }}>{title}</td>
                    <td style={{ fontWeight: 500 }}>{a.annotatorName}</td>
                    <td><span className={`badge ${tp.cls}`} style={{ fontSize: '0.8rem' }}>{tp.he}</span></td>
                    <td><span className={`badge ${st.cls}`} style={{ fontSize: '0.8rem' }}>{st.he}</span></td>
                    <td style={{ fontSize: '0.85rem' }}>{formatDate(a.createdAt)}</td>
                    <td style={{ fontSize: '0.85rem' }}>{formatDate(a.completedAt)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        style={{ borderRadius: '20px', fontSize: '0.78rem' }}
                        disabled={cancellingId === a.id}
                        onClick={() => handleCancel(a.id, a.status)}
                      >
                        {cancellingId === a.id ? '...' : 'מחק'}
                      </button>
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

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', padding: '6px', background: '#fff', borderRadius: '28px', border: '1px solid #dee2e6', width: 'fit-content' }}>
          <button style={tabStyle('conversations')} onClick={() => setActiveTab('conversations')}>
            שיחות לתיוג
          </button>
          <button style={tabStyle('assignments')} onClick={() => setActiveTab('assignments')}>
            שיבוצים
          </button>
        </div>

        {activeTab === 'conversations' && <ConversationsTab currentUser={currentUser} />}
        {activeTab === 'assignments'   && <AssignmentsTab   currentUser={currentUser} />}
      </div>
    </div>
  );
}
