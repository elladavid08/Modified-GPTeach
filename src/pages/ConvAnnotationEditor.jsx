import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getFullConv,
  getConvAnnotation,
  getMyAssignments,
  saveConvAnnotation,
  submitConvAnnotation,
} from '../services/convAnnotationService';
import FeedbackPointEditor from '../components/FeedbackPointEditor';
import { PCK_SKILLS } from '../config/testConfig';
import {
  logEvent,
  flushEvents,
  beaconEvents,
  setDiagnosticContext,
  getNavigationType,
} from '../utils/annotationDiagnostics';
import {
  hashContent,
  readLocalDraft,
  writeLocalDraft,
  clearLocalDraft,
  isSafeToPrune,
} from '../utils/annotationLocalDraft';
import { useAnnotationAutosave } from '../hooks/useAnnotationAutosave';

function formatLocalTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// ─── Read-only conversation view ─────────────────────────────────────────────

function TurnBlock({ turn, feedbackPoints, onAddFeedback, onEditFeedback, readOnly }) {
  const existing = feedbackPoints.filter(fp => fp.turnNumber === turn.turnNumber);

  return (
    <div style={{
      marginBottom: '24px',
      borderRight: `4px solid ${existing.length > 0 ? '#6c5ce7' : '#dee2e6'}`,
      paddingRight: '14px',
    }}>
      {/* Teacher message */}
      <div style={{ fontWeight: 700, color: '#6c5ce7', fontSize: '0.85rem', marginBottom: '6px' }}>
        תור {turn.turnNumber}
      </div>
      <div style={{ background: '#f8f9fa', borderRadius: '6px', padding: '10px 14px', marginBottom: '8px', fontSize: '0.9rem', color: '#333' }}>
        <span style={{ fontWeight: 600, marginLeft: '6px' }}>מורה:</span>
        {(turn.teacher && turn.teacher.message) || '—'}
        {turn.teacher && turn.teacher.image && (
          <div style={{ marginTop: '8px' }}>
            <img
              src={`data:image/png;base64,${turn.teacher.image}`}
              alt="ציור"
              style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '6px', border: '1px solid #dee2e6', display: 'block' }}
            />
          </div>
        )}
      </div>

      {/* Student messages */}
      {(turn.students || []).map((student, i) => (
        <div key={i} style={{ background: '#e7f3ff', borderRadius: '6px', padding: '8px 14px', marginBottom: '6px', fontSize: '0.88rem', color: '#333' }}>
          <span style={{ fontWeight: 600, marginLeft: '6px' }}>{student.name}:</span>
          {student.message}
        </div>
      ))}

      {/* Existing feedback points for this turn */}
      {existing.map(fp => (
        <div key={fp.feedbackPointId} style={{
          background: '#f0ebf8', borderRadius: '8px', padding: '10px 14px',
          marginTop: '8px', fontSize: '0.85rem', border: '1px solid #b39ddb',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              {/* Per-dimension feedback (new format) */}
              {(fp.selectedDimensions || []).map(dimId => {
                const skill = PCK_SKILLS.find(s => s.id === dimId);
                const df    = fp.dimensionFeedback && fp.dimensionFeedback[dimId];
                // Backward compat: fall back to old scores map + single feedbackText
                const score = df ? df.score : (fp.scores && fp.scores[dimId] != null ? fp.scores[dimId] : null);
                const text  = df ? df.feedbackText : fp.feedbackText;
                return (
                  <div key={dimId} style={{ marginBottom: '8px' }}>
                    <span style={{
                      background: '#6c5ce7', color: '#fff',
                      borderRadius: '4px', padding: '2px 7px', fontSize: '0.75rem', fontWeight: 700,
                      marginLeft: '6px',
                    }}>
                      {dimId.toUpperCase()}: {score != null ? score : '—'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#6c5ce7' }}>
                      {skill ? skill.label : dimId}
                    </span>
                    {text && (
                      <div style={{ marginTop: '3px', paddingRight: '4px', color: '#333', lineHeight: 1.5 }}>
                        {text}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Fallback: old format with no dimensions at all */}
              {(!fp.selectedDimensions || fp.selectedDimensions.length === 0) && fp.feedbackText && (
                <div style={{ color: '#333' }}>
                  <span style={{ fontWeight: 700, color: '#6c5ce7', marginLeft: '6px' }}>משוב:</span>
                  {fp.feedbackText}
                </div>
              )}
            </div>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                style={{ borderRadius: '20px', fontSize: '0.75rem', flexShrink: 0 }}
                onClick={() => onEditFeedback(fp)}
              >
                עריכה
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add feedback button — only while this turn has no feedback point yet.
          Once one exists it is edited via עריכה, which keeps a turn to a single
          point and makes it impossible to score the same PCK dimension twice. */}
      {!readOnly && existing.length === 0 && (
        <button
          type="button"
          style={{
            marginTop: '8px', background: 'none',
            border: '1px dashed #b39ddb', borderRadius: '6px',
            padding: '5px 14px', color: '#6c5ce7', fontSize: '0.85rem',
            cursor: 'pointer', width: '100%', textAlign: 'center',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f0ebf8'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
          onClick={() => onAddFeedback(turn)}
        >
          + הוסף משוב כאן
        </button>
      )}
    </div>
  );
}

// ─── Scenario header ──────────────────────────────────────────────────────────

function ScenarioHeader({ conversation }) {
  const scenario = conversation.scenario || {};
  return (
    <div style={{
      background: '#fff3cd', border: '1px solid #ffe082',
      borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', direction: 'rtl',
    }}>
      <div style={{ fontWeight: 700, marginBottom: '4px', color: '#856404' }}>תרחיש</div>
      <div style={{ fontSize: '0.9rem', color: '#444' }}>{scenario.text || '—'}</div>
      {scenario.misconception_focus && (
        <div style={{ fontSize: '0.82rem', color: '#888', marginTop: '4px' }}>
          תפיסה שגויה: {scenario.misconception_focus}
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function ConvAnnotationEditor() {
  const { assignmentId } = useParams();
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = userProfile && userProfile.isAdmin;

  // Data
  const [assignment, setAssignment]         = useState(null);
  const [conversation, setConversation]     = useState(null);
  const [feedbackPoints, setFeedbackPoints] = useState([]);
  const [generalComment, setGeneralComment] = useState('');

  // Tracks the last persisted state so we can detect unsaved changes
  const [lastSavedState, setLastSavedState] = useState(null);

  // UI state
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState('');
  const [saveSuccess, setSaveSuccess]     = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState('');
  const [readOnly, setReadOnly]           = useState(false);

  // Active editor state
  const [activeEditorTurn, setActiveEditorTurn]   = useState(null);  // turn object being edited
  const [editingPoint, setEditingPoint]           = useState(null);  // existing point or null for new

  // Local backup / recovery state
  const [modalDraft, setModalDraft]               = useState(null);  // uncommitted FeedbackPointEditor work
  const [modalInitialDraft, setModalInitialDraft] = useState(null);  // seed for a restored modal
  const [recovery, setRecovery]                   = useState(null);  // pending local-backup offer
  const [serverAckHash, setServerAckHash]         = useState(null);  // hash confirmed persisted server-side
  const [serverUpdatedAt, setServerUpdatedAt]     = useState(null);

  const uid = currentUser && currentUser.uid;

  // Fingerprint of the draft. Drives dirty detection, autosave and recovery.
  const contentHash = useMemo(
    () => hashContent({ feedbackPoints, generalComment }),
    [feedbackPoints, generalComment]
  );

  // Latest values for timer-driven callbacks that must not close over stale state.
  const stateRef = useRef({ feedbackPoints, generalComment, contentHash });
  stateRef.current = { feedbackPoints, generalComment, contentHash };

  const autosaveEnabled = !readOnly && !loading && !loadError && !!uid && !!assignment;

  const autosave = useAnnotationAutosave({
    enabled: autosaveEnabled,
    contentHash,
    getSnapshot: useCallback(() => {
      const s = stateRef.current;
      return {
        payload: {
          annotatorId:    uid,
          assignmentId,
          feedbackPoints: s.feedbackPoints,
          generalComment: s.generalComment,
        },
        hash: s.contentHash,
      };
    }, [uid, assignmentId]),
    save: useCallback(async (payload) => { await saveConvAnnotation(payload); }, []),
    // Keep lastSavedState in step with what was actually persisted, so the
    // existing "unsaved changes" prompt in handleBackToTasks stays accurate.
    onSaved: useCallback((hash, payload) => {
      setServerAckHash(hash);
      setLastSavedState({
        feedbackPoints: payload.feedbackPoints,
        generalComment: payload.generalComment,
      });
    }, []),
  });

  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  // Load assignment + full conversation + annotation draft in parallel
  useEffect(() => {
    if (!currentUser || !assignmentId) return;
    setLoading(true);
    logEvent('load_start');

    // First, fetch the user's assignment list to get assignment metadata
    // We don't have a single-assignment endpoint, so we infer from the annotation's assignmentType
    // and load the conversation via getFullConv.
    // Actually we fetch annotation (which includes conversationId + type) and the full conv in parallel.
    Promise.all([
      getConvAnnotation(assignmentId, currentUser.uid),
      getMyAssignments(currentUser.uid),
    ])
      .then(async ([annotation, myAssignments]) => {
        const asgn = myAssignments.find(a => a.id === assignmentId);

        if (!asgn) {
          logEvent('load_error', {
            stage: 'assignment_lookup',
            assignmentCount: Array.isArray(myAssignments) ? myAssignments.length : null,
          });
          setLoadError('לא נמצאה משימה זו. ייתכן שהיא לא שויכה אליך.');
          setLoading(false);
          return;
        }

        setAssignment(asgn);

        const isCompleted = asgn.status === 'completed';
        if (isCompleted) setReadOnly(true);

        // Load full conversation
        const conv = await getFullConv(asgn.conversationId, currentUser.uid);
        setConversation(conv);

        const loadedPoints  = annotation ? (annotation.feedbackPoints || []) : [];
        const loadedComment = annotation ? (annotation.generalComment  || '') : '';
        setFeedbackPoints(loadedPoints);
        setGeneralComment(loadedComment);
        setLastSavedState({ feedbackPoints: loadedPoints, generalComment: loadedComment });

        const serverHash = hashContent({ feedbackPoints: loadedPoints, generalComment: loadedComment });
        const srvUpdatedAt = annotation ? (annotation.updatedAt || null) : null;
        setServerAckHash(serverHash);
        setServerUpdatedAt(srvUpdatedAt);
        autosaveRef.current.markSaved(serverHash);

        // Offer the local backup if it holds anything the server draft does not.
        // Never restored automatically.
        if (!isCompleted) {
          const local = readLocalDraft(currentUser.uid, assignmentId);
          if (local && (local.committedHash !== serverHash || local.modalDraft)) {
            setRecovery({
              record: local,
              serverHash,
              serverPointCount: loadedPoints.length,
              serverChangedElsewhere: !!(
                local.lastServerUpdatedAt && srvUpdatedAt && local.lastServerUpdatedAt !== srvUpdatedAt
              ),
            });
            logEvent('local_recovery_offered', {
              localPoints: ((local.committed && local.committed.feedbackPoints) || []).length,
              serverPoints: loadedPoints.length,
              hasModalDraft: !!local.modalDraft,
            });
          } else if (local) {
            clearLocalDraft(currentUser.uid, assignmentId);
          }
        }

        logEvent('load_success', { status: asgn.status, points: loadedPoints.length });
        setLoading(false);
      })
      .catch(err => {
        logEvent('load_error', { stage: 'fetch', message: err.message });
        setLoadError(err.message);
        setLoading(false);
      });
  }, [currentUser, assignmentId]);

  // ── Diagnostics: page lifecycle while the editor is mounted ─────────────────
  useEffect(() => {
    setDiagnosticContext({ uid: uid || null, assignmentId });
    logEvent('editor_mount', {
      navigationType: getNavigationType(),
      historyLength: window.history.length,
      referrer: document.referrer || '',
      online: navigator.onLine,
    });
    flushEvents();

    let hiddenAt = null;
    const onPopState    = () => logEvent('popstate', { historyLength: window.history.length });
    const onPageHide    = (e) => { logEvent('pagehide', { persisted: !!e.persisted }); beaconEvents(); };
    const onWindowError = (e) => logEvent('window_error', {
      message: String(e.message || '').slice(0, 300),
      source: String(e.filename || '').slice(0, 200),
      line: e.lineno,
    });
    const onRejection   = (e) => logEvent('unhandled_rejection', {
      reason: String((e.reason && e.reason.message) || e.reason || '').slice(0, 300),
    });
    const onVisibility  = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        logEvent('visibility_hidden');
      } else {
        logEvent('visibility_visible', { hiddenMs: hiddenAt ? Date.now() - hiddenAt : null });
        hiddenAt = null;
      }
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onRejection);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      logEvent('editor_unmount');
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [uid, assignmentId]);

  // ── Local backup ────────────────────────────────────────────────────────────
  // Written on every committed or modal state change. Pruned only when the whole
  // local record is provably represented in the persisted server draft AND there
  // is no uncommitted modal work (see isSafeToPrune).
  useEffect(() => {
    if (!uid || !assignmentId) return;
    if (loading || loadError || readOnly) return;

    // A pending recovery offer is preserved until the annotator decides. If they
    // start editing instead, the offer is stale, so drop it and resume backups.
    if (recovery) {
      if (contentHash !== recovery.serverHash || modalDraft) {
        logEvent('local_recovery_auto_dismissed');
        setRecovery(null);
      }
      return;
    }

    const record = {
      committed:           { feedbackPoints, generalComment },
      committedHash:       contentHash,
      modalDraft:          modalDraft || null,
      serverAckHash:       serverAckHash,
      savedAt:             new Date().toISOString(),
      lastServerUpdatedAt: serverUpdatedAt,
    };

    if (isSafeToPrune(record)) {
      clearLocalDraft(uid, assignmentId);
      return;
    }
    if (!writeLocalDraft(uid, assignmentId, record)) {
      logEvent('local_backup_write', { ok: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentHash, modalDraft, serverAckHash, serverUpdatedAt, recovery, loading, loadError, readOnly, uid, assignmentId]);

  // ── Warn before a reload/close that would drop unsaved work ─────────────────
  useEffect(() => {
    if (readOnly || loading || loadError) return undefined;
    const hasUnsaved = (serverAckHash !== null && contentHash !== serverAckHash) || !!modalDraft;
    if (!hasUnsaved) return undefined;

    const handler = (e) => {
      logEvent('beforeunload', { hasUnsaved: true });
      beaconEvents();
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [readOnly, loading, loadError, contentHash, serverAckHash, modalDraft]);

  // ── Editor actions ──────────────────────────────────────────────────────────

  const handleAddFeedback = useCallback((turn) => {
    setModalInitialDraft(null);
    setModalDraft(null);
    setEditingPoint(null);
    setActiveEditorTurn(turn);
  }, []);

  const handleEditFeedback = useCallback((fp) => {
    if (!conversation) return;
    const turn = (conversation.turns || []).find(t => t.turnNumber === fp.turnNumber);
    if (turn) {
      setModalInitialDraft(null);
      setModalDraft(null);
      setEditingPoint(fp);
      setActiveEditorTurn(turn);
    }
  }, [conversation]);

  const handleSavePoint = useCallback((point) => {
    setFeedbackPoints(prev => {
      const idx = prev.findIndex(p => p.feedbackPointId === point.feedbackPointId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = point;
        return next;
      }
      return [...prev, point];
    });
    setActiveEditorTurn(null);
    setEditingPoint(null);
    setModalDraft(null);
    setModalInitialDraft(null);
    // Clear previous save status so the user knows they have unsaved changes
    setSaveSuccess(false);
  }, []);

  const handleCancelEditor = useCallback(() => {
    setActiveEditorTurn(null);
    setEditingPoint(null);
    setModalDraft(null);
    setModalInitialDraft(null);
  }, []);

  const handleDeletePoint = useCallback((feedbackPointId) => {
    setFeedbackPoints(prev => prev.filter(p => p.feedbackPointId !== feedbackPointId));
    setActiveEditorTurn(null);
    setEditingPoint(null);
    setModalDraft(null);
    setModalInitialDraft(null);
    setSaveSuccess(false);
  }, []);

  // Mirrors in-progress modal state into the local backup. An untouched form is
  // treated as "no draft" so it cannot trigger a spurious recovery offer.
  const handleModalDraftChange = useCallback((draft) => {
    const isEmpty =
      (!draft.selectedDimensions || draft.selectedDimensions.length === 0) &&
      !(draft.internalNote && draft.internalNote.trim());

    if (isEmpty) {
      setModalDraft(null);
      return;
    }
    setModalDraft({
      turnNumber:      activeEditorTurn ? activeEditorTurn.turnNumber : null,
      existingPointId: editingPoint ? editingPoint.feedbackPointId : null,
      selectedDimensions: draft.selectedDimensions,
      dimensionFeedback:  draft.dimensionFeedback,
      internalNote:       draft.internalNote,
      showNote:           draft.showNote,
      updatedAt:          new Date().toISOString(),
    });
  }, [activeEditorTurn, editingPoint]);

  const handleRestoreLocal = useCallback(() => {
    if (!recovery) return;
    const rec       = recovery.record;
    const committed = rec.committed || { feedbackPoints: [], generalComment: '' };
    const points    = committed.feedbackPoints || [];

    setFeedbackPoints(points);
    setGeneralComment(committed.generalComment || '');

    if (rec.modalDraft && conversation) {
      const turn = (conversation.turns || []).find(t => t.turnNumber === rec.modalDraft.turnNumber);
      if (turn) {
        const pt = rec.modalDraft.existingPointId
          ? points.find(p => p.feedbackPointId === rec.modalDraft.existingPointId) || null
          : null;
        setModalInitialDraft(rec.modalDraft);
        setEditingPoint(pt);
        setActiveEditorTurn(turn);
      }
    }

    logEvent('local_recovery_accepted', {
      points: points.length,
      hadModalDraft: !!rec.modalDraft,
    });
    setRecovery(null);
    setSaveSuccess(false);
  }, [recovery, conversation]);

  const handleDiscardLocal = useCallback(() => {
    logEvent('local_recovery_discarded');
    if (uid) clearLocalDraft(uid, assignmentId);
    setRecovery(null);
  }, [uid, assignmentId]);

  // Navigate back — warns if there are unsaved changes
  function handleBackToTasks() {
    const hasUnsaved = lastSavedState && (
      JSON.stringify(feedbackPoints) !== JSON.stringify(lastSavedState.feedbackPoints) ||
      generalComment !== lastSavedState.generalComment
    );
    if (hasUnsaved) {
      if (!window.confirm('יש שינויים שלא נשמרו. האם לצאת בלי לשמור?')) return;
    }
    navigate('/annotation/conv-tasks');
  }

  // Lock page scroll while the feedback editor is open
  useEffect(() => {
    if (activeEditorTurn) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [activeEditorTurn]);

  // ── Save draft ──────────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    if (readOnly) return;
    // Cancel any queued autosave so the manual save is the only in-flight write.
    autosave.cancelPending();
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      // force=true keeps the existing behavior of always issuing the request,
      // while sharing the saved-hash so no autosave follows immediately after.
      await autosave.runSave('manual', true);
      setSaveSuccess(true);
      setLastSavedState({ feedbackPoints, generalComment });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (readOnly) return;

    // Submit-level validation: warn if open editor
    if (activeEditorTurn) {
      setSaveError('יש לסגור את עורך המשוב לפני ההגשה.');
      return;
    }

    // Confirm if zero feedback points
    if (feedbackPoints.length === 0) {
      const ok = window.confirm('לא הוספת אף נקודת משוב. האם לסיים את התיוג בכל זאת?');
      if (!ok) return;
    }

    setSubmitting(true);
    setSubmitError('');
    // Cancel queued autosave so a late write cannot race the submit.
    autosave.cancelPending();
    // Save latest state first, then submit
    try {
      await saveConvAnnotation({ annotatorId: currentUser.uid, assignmentId, feedbackPoints, generalComment });
      await submitConvAnnotation(assignmentId, currentUser.uid);
      setLastSavedState({ feedbackPoints, generalComment });
      autosave.markSaved(contentHash);
      setServerAckHash(contentHash);
      setReadOnly(true);
      setSaveSuccess(false);
      // Submitted work is durably persisted — the local backup can be released.
      if (uid) clearLocalDraft(uid, assignmentId);
      logEvent('submit_success', { points: feedbackPoints.length });
    } catch (err) {
      logEvent('submit_failure', { message: err.message });
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: loading / error ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container mt-5 text-center" dir="rtl">
        <div className="spinner-border text-primary" />
        <p className="mt-3">טוען שיחה...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container mt-5" dir="rtl">
        <div className="alert alert-danger">{loadError}</div>
        <button className="btn btn-outline-secondary" onClick={() => navigate('/annotation/conv-tasks')}>
          ← חזרה לרשימת המשימות
        </button>
      </div>
    );
  }

  const turns = (conversation && conversation.turns) || [];

  const autosaveLabel = (() => {
    if (readOnly) return null;
    if (autosave.status === 'saving')  return { text: 'שומר...',                 color: '#6c5ce7' };
    if (autosave.status === 'saved')   return { text: '✓ נשמר אוטומטית',          color: '#00b894' };
    if (autosave.status === 'unsaved') return { text: '● שינויים שלא נשמרו',      color: '#e17055' };
    if (autosave.status === 'error')   return { text: '✕ שמירה אוטומטית נכשלה',   color: '#d63031' };
    return null;
  })();

  const recoveryLocalPoints = recovery
    ? ((recovery.record.committed && recovery.record.committed.feedbackPoints) || []).length
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7fc', paddingTop: '72px', paddingBottom: '100px' }}>
      <div className="container" style={{ maxWidth: '860px', direction: 'rtl' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ marginBottom: '8px' }}
              onClick={handleBackToTasks}
            >
              ← חזרה למשימות
            </button>
            <h4 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: '4px' }}>
              {readOnly ? 'צפייה בתיוג' : 'תיוג שיחה'}
            </h4>
            {readOnly && (
              <span className="badge bg-success" style={{ fontSize: '0.82rem' }}>הוגש — תיוג זה נעול לעריכה</span>
            )}
          </div>
          {!readOnly && saveSuccess && (
            <div className="alert alert-success py-2 px-3 mb-0" style={{ borderRadius: '8px', fontSize: '0.88rem' }}>
              ✓ הטיוטה נשמרה
            </div>
          )}
        </div>

        {/* Local backup recovery offer — never restored automatically */}
        {recovery && (
          <div
            className="alert alert-warning"
            style={{ borderRadius: '8px', direction: 'rtl', fontSize: '0.9rem' }}
          >
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>נמצאה עבודה שמורה בדפדפן</div>
            <div style={{ marginBottom: '4px' }}>
              גיבוי מקומי מהתאריך {formatLocalTime(recovery.record.savedAt)} מכיל {recoveryLocalPoints} נקודות משוב
              {recovery.record.modalDraft ? ', כולל נקודת משוב שלא נשמרה' : ''}.
              הגרסה השמורה בשרת מכילה {recovery.serverPointCount} נקודות משוב.
            </div>
            {recovery.serverChangedElsewhere && (
              <div style={{ color: '#856404', marginBottom: '4px' }}>
                שים לב: הטיוטה בשרת עודכנה ממכשיר או חלון אחר.
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                className="btn btn-sm btn-primary"
                style={{ background: '#6c5ce7', borderColor: '#6c5ce7', borderRadius: '20px' }}
                onClick={handleRestoreLocal}
              >
                שחזר את הגיבוי המקומי
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                style={{ borderRadius: '20px' }}
                onClick={handleDiscardLocal}
              >
                התעלם והמשך מהשרת
              </button>
            </div>
          </div>
        )}

        {/* Scenario */}
        {conversation && <ScenarioHeader conversation={conversation} />}

        {/* Feedback editor — full-screen overlay modal */}
        {activeEditorTurn && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(30, 20, 60, 0.55)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '76px 16px 20px',
          }}>
            <div style={{
              background: '#fff', borderRadius: '12px',
              border: '2px solid #6c5ce7',
              boxShadow: '0 8px 40px rgba(108,92,231,0.3)',
              width: '100%', maxWidth: '680px',
              maxHeight: 'calc(100vh - 108px)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Modal header — always visible */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid #e9ecef',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0, background: '#fff', borderRadius: '10px 10px 0 0',
              }}>
                <span style={{ fontWeight: 700, color: '#6c5ce7', fontSize: '0.95rem' }}>
                  {editingPoint ? 'עריכת נקודת משוב' : 'הוספת נקודת משוב'}
                </span>
                <button
                  type="button"
                  onClick={handleCancelEditor}
                  style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                  aria-label="סגור"
                >
                  ×
                </button>
              </div>

              {/* Scrollable content — PCK dimensions grow here */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
                <FeedbackPointEditor
                  turn={activeEditorTurn}
                  existingPoint={editingPoint}
                  sessionId={assignment && assignment.conversationId}
                  onSave={handleSavePoint}
                  onCancel={handleCancelEditor}
                  onDelete={!readOnly && editingPoint ? handleDeletePoint : undefined}
                  initialDraft={modalInitialDraft}
                  onDraftChange={readOnly ? undefined : handleModalDraftChange}
                />
              </div>
            </div>
          </div>
        )}

        {/* Conversation turns */}
        <div>
          {turns.length === 0 && (
            <div className="alert alert-info">לא נמצאו תורות בשיחה זו.</div>
          )}
          {turns.map(turn => (
            <TurnBlock
              key={turn.turnNumber}
              turn={turn}
              feedbackPoints={feedbackPoints}
              onAddFeedback={handleAddFeedback}
              onEditFeedback={handleEditFeedback}
              readOnly={readOnly}
            />
          ))}
        </div>

        {/* General comment */}
        <div style={{ marginTop: '24px' }}>
          <label style={{ fontWeight: 700, fontSize: '0.9rem', color: '#333', display: 'block', marginBottom: '6px' }}>
            הערה כללית לשיחה (אופציונלי)
          </label>
          <textarea
            style={{
              width: '100%', minHeight: '80px', resize: 'vertical',
              padding: '8px 12px', borderRadius: '6px', border: '1px solid #ced4da',
              fontFamily: 'inherit', fontSize: '0.9rem', direction: 'rtl',
              background: readOnly ? '#f8f9fa' : '#fff',
            }}
            placeholder="הערות כלליות על השיחה כולה..."
            value={generalComment}
            onChange={e => !readOnly && setGeneralComment(e.target.value)}
            readOnly={readOnly}
          />
        </div>

      </div>

      {/* Sticky bottom bar — hidden in read-only mode */}
      {!readOnly && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #dee2e6',
          padding: '12px 24px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
          flexWrap: 'wrap', gap: '10px', zIndex: 1000,
        }}>
          <div style={{ direction: 'rtl', fontSize: '0.88rem', color: '#555' }}>
            {feedbackPoints.length > 0
              ? <span style={{ color: '#6c5ce7', fontWeight: 600 }}>{feedbackPoints.length} נקודות משוב</span>
              : <span style={{ color: '#aaa' }}>טרם נוספו נקודות משוב</span>
            }
            {autosaveLabel && (
              <span style={{ color: autosaveLabel.color, marginRight: '12px', fontWeight: 600 }}>
                {autosaveLabel.text}
              </span>
            )}
            {autosave.status === 'error' && autosave.lastError && (
              <span style={{ color: '#d63031', marginRight: '6px' }}>{autosave.lastError}</span>
            )}
            {saveError    && <span style={{ color: '#d63031', marginRight: '12px' }}>{saveError}</span>}
            {submitError  && <span style={{ color: '#d63031', marginRight: '12px' }}>{submitError}</span>}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-outline-secondary"
              style={{ borderRadius: '20px' }}
              disabled={saving || submitting}
              onClick={handleBackToTasks}
            >
              ← חזרה למשימות
            </button>
            <button
              className="btn btn-outline-primary"
              style={{ borderRadius: '20px', borderColor: '#6c5ce7', color: '#6c5ce7' }}
              disabled={saving || submitting}
              onClick={handleSaveDraft}
            >
              {saving ? 'שומר...' : 'שמור טיוטה'}
            </button>
            <button
              className="btn btn-primary"
              style={{ background: '#6c5ce7', borderColor: '#6c5ce7', borderRadius: '20px' }}
              disabled={saving || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'מגיש...' : 'סיום תיוג'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
