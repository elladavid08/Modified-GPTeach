import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchComparisonSets,
  fetchComparisonEligible,
  saveComparisonSet,
  patchComparisonSet,
  removeComparisonSet,
} from '../services/convAnnotationService';

const TYPE_LABELS_MAP = {
  reliability: 'בדיקת הסכמה',
  production:  'תיוג רגיל',
  double_coded: 'תיוג כפול',
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return iso; }
}

// ─── Scenario title from convMeta ────────────────────────────────────────────

function getScenarioTitle(convMeta) {
  return (convMeta && convMeta.scenario && convMeta.scenario.text)
    ? convMeta.scenario.text
    : null;
}

function getUserName(convMeta) {
  if (convMeta && convMeta.userSnapshot && convMeta.userSnapshot.fullName) return convMeta.userSnapshot.fullName;
  if (convMeta && convMeta.userId) return convMeta.userId.slice(0, 8);
  return null;
}

function ConvIdentityLabel({ convMeta, conversationId }) {
  const title    = getScenarioTitle(convMeta) || conversationId || '—';
  const userName = getUserName(convMeta);
  const rawDate  = convMeta && (convMeta.startedAt || convMeta.startTime);
  let dateStr = null;
  if (rawDate) {
    try { dateStr = new Date(rawDate).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { /* ignore */ }
  }
  const subtitle = [userName, dateStr].filter(Boolean).join(' · ');
  return (
    <div>
      <div style={{ fontWeight: 500, fontSize: '0.88rem', color: '#333' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.76rem', color: '#888', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

// ─── Create / Edit form ───────────────────────────────────────────────────────

function ComparisonSetForm({ adminId, existingSet, onSaved, onCancel }) {
  const [title, setTitle]                 = useState(existingSet ? existingSet.title : '');
  const [description, setDescription]    = useState(existingSet ? (existingSet.description || '') : '');
  const [visible, setVisible]             = useState(existingSet ? existingSet.visibleToAnnotators : false);
  const [items, setItems]                 = useState(existingSet ? existingSet.items || [] : []); // [{conversationId, assignmentIds, convMeta, annotatorNames}]

  const [eligibleConvs, setEligibleConvs] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(true);
  const [eligibleError, setEligibleError] = useState(null);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState(null);

  useEffect(() => {
    fetchComparisonEligible(adminId)
      .then(convs => setEligibleConvs(convs))
      .catch(e => setEligibleError(e.message))
      .finally(() => setEligibleLoading(false));
  }, [adminId]);

  // Which conversationIds are already in items
  const includedConvIds = useMemo(() => new Set(items.map(i => i.conversationId)), [items]);

  function handleToggleConv(conv) {
    const convId = conv.conversationId;
    if (includedConvIds.has(convId)) {
      setItems(prev => prev.filter(i => i.conversationId !== convId));
    } else {
      // Auto-select first 2 completed assignments
      const autoSelected = (conv.completedAssignments || []).slice(0, 2).map(a => a.assignmentId);
      setItems(prev => [...prev, {
        conversationId: convId,
        assignmentIds: autoSelected,
        convMeta: conv.convMeta,
        annotatorNames: autoSelected.map(aid => {
          const a = (conv.completedAssignments || []).find(a => a.assignmentId === aid);
          return a ? a.annotatorName : aid;
        }),
      }]);
    }
  }

  function handleAssignmentSelect(convId, assignmentId, checked) {
    setItems(prev => prev.map(item => {
      if (item.conversationId !== convId) return item;
      const prev2 = item.assignmentIds || [];
      if (checked) {
        if (prev2.length >= 2) return item; // max 2
        const conv = eligibleConvs.find(c => c.conversationId === convId);
        const aName = conv
          ? (conv.completedAssignments.find(a => a.assignmentId === assignmentId) || {}).annotatorName || assignmentId
          : assignmentId;
        return {
          ...item,
          assignmentIds: [...prev2, assignmentId],
          annotatorNames: [...(item.annotatorNames || []), aName],
        };
      } else {
        const idx = prev2.indexOf(assignmentId);
        const names = [...(item.annotatorNames || [])];
        names.splice(idx, 1);
        return { ...item, assignmentIds: prev2.filter(id => id !== assignmentId), annotatorNames: names };
      }
    }));
  }

  async function handleSave() {
    if (!title.trim()) { setSaveError('נדרש שם לסט.'); return; }
    const invalidItems = items.filter(i => !i.assignmentIds || i.assignmentIds.length !== 2);
    if (invalidItems.length > 0) { setSaveError('יש לבחור בדיוק 2 שיבוצים לכל שיחה.'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const cleanItems = items.map(({ conversationId, assignmentIds }) => ({ conversationId, assignmentIds }));
      if (existingSet) {
        await patchComparisonSet(adminId, existingSet.id, { title: title.trim(), description: description.trim() || null, items: cleanItems, visibleToAnnotators: visible });
      } else {
        await saveComparisonSet(adminId, { title: title.trim(), description: description.trim() || null, items: cleanItems, visibleToAnnotators: visible });
      }
      onSaved();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="d-flex align-items-center mb-3 gap-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>← חזרה</button>
        <h6 className="mb-0" style={{ color: '#6c5ce7' }}>
          {existingSet ? 'עריכת סט השוואה' : 'יצירת סט השוואה חדש'}
        </h6>
      </div>

      {/* Title */}
      <div className="form-group mb-3">
        <label style={{ fontWeight: 600 }}>שם הסט *</label>
        <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder='לדוגמה: "כיול אפריל 2026"' style={{ maxWidth: 420 }} />
      </div>

      {/* Description */}
      <div className="form-group mb-3">
        <label style={{ fontWeight: 600 }}>תיאור (אופציונלי)</label>
        <textarea className="form-control" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור קצר של מטרת ההשוואה" style={{ maxWidth: 420 }} />
      </div>

      {/* Visibility */}
      <div className="form-group mb-4 d-flex align-items-center gap-2">
        <input type="checkbox" id="vis-toggle" checked={visible} onChange={e => setVisible(e.target.checked)} />
        <label htmlFor="vis-toggle" style={{ marginBottom: 0 }}>גלוי לצוות המעריכים</label>
      </div>

      {/* Conversation picker */}
      <div className="mb-4">
        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
          בחר שיחות להשוואה
          <span className="badge badge-secondary ml-2" style={{ fontSize: '0.8rem' }}>{items.length} נבחרו</span>
        </label>

        {eligibleLoading && <div className="text-muted">טוען שיחות...</div>}
        {eligibleError  && <div className="alert alert-danger">{eligibleError}</div>}

        {!eligibleLoading && eligibleConvs.length === 0 && (
          <div className="alert alert-warning" style={{ fontSize: '0.9rem' }}>
            לא נמצאו שיחות עם שתי הערכות מושלמות.
          </div>
        )}

        {!eligibleLoading && eligibleConvs.length > 0 && (
          <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: 4 }}>
            {eligibleConvs.map(conv => {
              const included  = includedConvIds.has(conv.conversationId);
              const item      = items.find(i => i.conversationId === conv.conversationId);
              const selectedAssignmentIds = item ? (item.assignmentIds || []) : [];
              const title = getScenarioTitle(conv.convMeta) || conv.conversationId.slice(0, 14);
              const userName = getUserName(conv.convMeta);

              return (
                <div key={conv.conversationId} style={{ borderBottom: '1px solid #f0f0f0', padding: '10px 14px', background: included ? '#f0edff' : '#fff' }}>
                  {/* Conversation row */}
                  <div
                    className="d-flex align-items-center gap-2"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleToggleConv(conv)}
                  >
                    <input type="checkbox" checked={included} onChange={() => {}} onClick={e => e.stopPropagation()} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{title}</div>
                      {userName && <div style={{ fontSize: '0.76rem', color: '#888' }}>{userName}</div>}
                    </div>
                    <span className="badge badge-light" style={{ fontSize: '0.75rem' }}>
                      {conv.completedAssignments.length} שיבוצים
                    </span>
                  </div>

                  {/* Assignment selector (only when included) */}
                  {included && (
                    <div className="mt-2 ml-4" style={{ paddingRight: '20px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 4 }}>
                        בחר בדיוק 2 שיבוצים להשוואה:
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        {(conv.completedAssignments || []).map(asgn => {
                          const isChecked = selectedAssignmentIds.includes(asgn.assignmentId);
                          const isDisabled = !isChecked && selectedAssignmentIds.length >= 2;
                          return (
                            <label
                              key={asgn.assignmentId}
                              className="d-flex align-items-center gap-1"
                              style={{ fontSize: '0.82rem', cursor: isDisabled ? 'not-allowed' : 'pointer', color: isDisabled ? '#bbb' : '#333', userSelect: 'none' }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={e => handleAssignmentSelect(conv.conversationId, asgn.assignmentId, e.target.checked)}
                              />
                              <span>{asgn.annotatorName}</span>
                              <span style={{ color: '#aaa', fontSize: '0.74rem' }}>
                                ({TYPE_LABELS_MAP[asgn.assignmentType] || asgn.assignmentType})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {selectedAssignmentIds.length === 2 && (
                        <div style={{ fontSize: '0.76rem', color: '#00b894', marginTop: 4 }}>✓ נבחרו 2 שיבוצים</div>
                      )}
                      {selectedAssignmentIds.length !== 2 && (
                        <div style={{ fontSize: '0.76rem', color: '#e17055', marginTop: 4 }}>נדרשים בדיוק 2 שיבוצים</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {saveError && <div className="alert alert-danger mb-3">{saveError}</div>}

      <button
        className="btn text-white"
        style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}
        disabled={saving}
        onClick={handleSave}
      >
        {saving ? <><span className="spinner-border spinner-border-sm mr-2" />שומר...</> : 'שמור סט'}
      </button>
    </div>
  );
}

// ─── Main admin component ─────────────────────────────────────────────────────

export default function AdminComparisonSets() {
  const { currentUser } = useAuth();
  const adminId = currentUser && currentUser.uid;

  const [view, setView]           = useState('list'); // 'list' | 'create' | 'edit'
  const [editSet, setEditSet]     = useState(null);
  const [sets, setSets]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  function loadSets() {
    setLoading(true);
    fetchComparisonSets(adminId, true)
      .then(s => setSets(s))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (adminId) loadSets(); }, [adminId]); // eslint-disable-line

  async function handleDelete(setId) {
    if (!window.confirm('האם למחוק את סט ההשוואה הזה לצמיתות?')) return;
    setDeletingId(setId);
    try { await removeComparisonSet(adminId, setId); loadSets(); }
    catch (e) { alert('שגיאה במחיקה: ' + e.message); }
    finally { setDeletingId(null); }
  }

  async function handleToggleVisibility(set) {
    setTogglingId(set.id);
    try { await patchComparisonSet(adminId, set.id, { visibleToAnnotators: !set.visibleToAnnotators }); loadSets(); }
    catch (e) { alert('שגיאה: ' + e.message); }
    finally { setTogglingId(null); }
  }

  function handleEdit(set) { setEditSet(set); setView('edit'); }

  if (view === 'create' || view === 'edit') {
    return (
      <ComparisonSetForm
        adminId={adminId}
        existingSet={view === 'edit' ? editSet : null}
        onSaved={() => { setView('list'); setEditSet(null); loadSets(); }}
        onCancel={() => { setView('list'); setEditSet(null); }}
      />
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0" style={{ color: '#333' }}>סטי השוואה</h6>
        <button
          className="btn btn-sm text-white"
          style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}
          onClick={() => setView('create')}
        >
          + סט חדש
        </button>
      </div>

      {loadError && <div className="alert alert-danger">{loadError}</div>}

      {loading ? (
        <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
      ) : sets.length === 0 ? (
        <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
          לא נמצאו סטי השוואה. לחץ "+ סט חדש" כדי ליצור את הראשון.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover">
            <thead style={{ background: '#f5f0ff' }}>
              <tr>
                <th>שם הסט</th>
                <th>תיאור</th>
                <th>שיחות</th>
                <th>נוצר</th>
                <th>גלוי לצוות</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sets.map(set => (
                <tr key={set.id}>
                  <td><strong>{set.title}</strong></td>
                  <td style={{ fontSize: '0.84rem', color: '#666', maxWidth: 200 }}>{set.description || '—'}</td>
                  <td>{set.itemCount}</td>
                  <td style={{ fontSize: '0.84rem' }}>{fmtDate(set.createdAt)}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${set.visibleToAnnotators ? 'btn-success' : 'btn-outline-secondary'}`}
                      style={{ fontSize: '0.78rem', borderRadius: 20 }}
                      disabled={togglingId === set.id}
                      onClick={() => handleToggleVisibility(set)}
                    >
                      {togglingId === set.id ? '...' : set.visibleToAnnotators ? 'גלוי ✓' : 'מוסתר'}
                    </button>
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      <button className="btn btn-sm btn-outline-primary" style={{ fontSize: '0.78rem' }} onClick={() => handleEdit(set)}>עריכה</button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        style={{ fontSize: '0.78rem' }}
                        disabled={deletingId === set.id}
                        onClick={() => handleDelete(set.id)}
                      >
                        {deletingId === set.id ? '...' : 'מחק'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
