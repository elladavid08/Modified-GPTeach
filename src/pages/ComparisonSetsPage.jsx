import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PCK_SKILLS } from '../config/testConfig';
import {
  fetchComparisonSets,
  fetchComparisonSetDetail,
  fetchComparisonData,
  fetchConsensusAnnotation,
  saveConsensusAnnotationDraft,
  submitConsensusAnnotation,
} from '../services/convAnnotationService';

// ─── Helpers ─────────────────────────────────────────────────────────────────


function getScoreForDim(fps, dimId) {
  for (const fp of fps) {
    if (fp.dimensionFeedback && fp.dimensionFeedback[dimId] != null &&
        fp.dimensionFeedback[dimId].score != null) {
      return fp.dimensionFeedback[dimId].score;
    }
    if (fp.scores && fp.scores[dimId] != null) return fp.scores[dimId];
  }
  return null;
}

function getTextForDim(fps, dimId) {
  for (const fp of fps) {
    if (fp.dimensionFeedback && fp.dimensionFeedback[dimId] &&
        fp.dimensionFeedback[dimId].feedbackText) {
      return fp.dimensionFeedback[dimId].feedbackText;
    }
    // Legacy: single feedbackText, only useful if the single dim matches
    if (fp.feedbackText && (fp.selectedDimensions || []).includes(dimId)) return fp.feedbackText;
  }
  return null;
}

// ─── Score badge colors (by value, not annotator) ────────────────────────────

function scoreColor(n) {
  if (n === 0) return '#a29bfe'; // purple
  if (n === 1) return '#fdcb6e'; // yellow
  if (n === 2) return '#00b894'; // green
  return '#aaa';
}

// ─── Annotator color themes (A = purple, B = blue) ───────────────────────────

const COLOR_A = {
  accent: '#6c5ce7',
  light:  '#f5f2ff',
  border: '#c5baf0',
  text:   '#4a3ab5',
};

const COLOR_B = {
  accent: '#0984e3',
  light:  '#eef6ff',
  border: '#90c4f5',
  text:   '#0667bb',
};

const COLOR_C = {
  accent: '#27ae60',
  light:  '#edfaf1',
  border: '#a9dfbf',
  text:   '#1a7a43',
};

// ─── Single annotator cell for one PCK dimension ────────────────────────────

function DimAnnotatorCell({ fps, dimId, selected, colors }) {
  if (!selected) {
    return (
      <div style={{
        padding: '11px 14px', minHeight: 52,
        background: '#fafafa',
        color: '#c0c0c0', fontStyle: 'italic', fontSize: '0.82rem',
        direction: 'rtl', textAlign: 'right',
      }}>
        לא סומן
      </div>
    );
  }
  const score = getScoreForDim(fps, dimId);
  const text  = getTextForDim(fps, dimId);
  return (
    <div style={{
      padding: '11px 14px',
      background: colors.light,
      borderTop: `2px solid ${colors.border}`,
    }}>
      {score != null && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: '50%',
          background: scoreColor(score), color: '#fff',
          fontWeight: 700, fontSize: '0.86rem',
        }}>
          {score}
        </span>
      )}
      {text && (
        <div style={{
          fontSize: '0.84rem', color: '#222', whiteSpace: 'pre-wrap',
          direction: 'rtl', textAlign: 'right',
          marginTop: score != null ? 7 : 0,
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Consensus dim cell (editable / read-only) ───────────────────────────────

function ConsensusDimCell({ dimId, consensusEntry, onChange, readonly, fpAForTurn, fpBForTurn, nameA, nameB }) {
  const included     = consensusEntry ? !!consensusEntry.included   : false;
  const score        = consensusEntry ? consensusEntry.score        : null;
  const feedbackText = consensusEntry ? (consensusEntry.feedbackText || '') : '';

  function handleIncludeToggle(e) {
    onChange({ included: e.target.checked, score: e.target.checked ? score : null, feedbackText: e.target.checked ? feedbackText : '' });
  }
  function handleScore(v) { onChange({ included: true, score: v, feedbackText }); }
  function handleText(e)  { onChange({ included: true, score, feedbackText: e.target.value }); }
  function copyFrom(fps) {
    const s = getScoreForDim(fps, dimId);
    const t = getTextForDim(fps, dimId);
    onChange({ included: true, score: s != null ? s : score, feedbackText: t || feedbackText });
  }

  const aSelected = fpAForTurn.some(fp => (fp.selectedDimensions || []).includes(dimId));
  const bSelected = fpBForTurn.some(fp => (fp.selectedDimensions || []).includes(dimId));

  // Read-only state (consensus completed)
  if (readonly) {
    if (!included) {
      return (
        <div style={{ padding: '11px 14px', background: '#fafafa', color: '#bbb', fontStyle: 'italic', fontSize: '0.82rem', minHeight: 52, direction: 'rtl', textAlign: 'right' }}>
          לא נכלל
        </div>
      );
    }
    return (
      <div style={{ padding: '11px 14px', background: COLOR_C.light, borderTop: `2px solid ${COLOR_C.border}` }}>
        {score != null && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: '50%',
            background: scoreColor(score), color: '#fff', fontWeight: 700, fontSize: '0.86rem',
          }}>{score}</span>
        )}
        {feedbackText && (
          <div style={{ fontSize: '0.84rem', color: '#222', whiteSpace: 'pre-wrap', direction: 'rtl', textAlign: 'right', marginTop: score != null ? 7 : 0 }}>
            {feedbackText}
          </div>
        )}
      </div>
    );
  }

  // Editable state
  return (
    <div style={{ padding: '10px 12px', background: included ? COLOR_C.light : '#fafafa', borderTop: included ? `2px solid ${COLOR_C.border}` : undefined, minHeight: 52, direction: 'rtl' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem', color: '#555', marginBottom: included ? 8 : 0 }}>
        <input type="checkbox" checked={included} onChange={handleIncludeToggle} style={{ cursor: 'pointer' }} />
        לכלול בתיוג המוסכם
      </label>

      {included && (
        <>
          {/* Score buttons */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 7, direction: 'ltr' }}>
            {[0, 1, 2].map(v => (
              <button
                key={v}
                onClick={() => handleScore(v)}
                style={{
                  width: 28, height: 28, borderRadius: '50%', border: 'none',
                  background: score === v ? scoreColor(v) : '#e9ecef',
                  color: score === v ? '#fff' : '#555',
                  fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                  outline: score === v ? `2px solid ${scoreColor(v)}` : 'none',
                  transition: 'background 0.1s',
                }}
              >{v}</button>
            ))}
          </div>

          {/* Feedback textarea */}
          <div style={{ marginBottom: 7 }}>
            <div style={{ fontSize: '0.74rem', color: '#888', marginBottom: 2 }}>משוב מוסכם:</div>
            <textarea
              value={feedbackText}
              onChange={handleText}
              rows={3}
              style={{
                width: '100%', fontSize: '0.83rem', border: `1px solid ${COLOR_C.border}`,
                borderRadius: 4, padding: '5px 8px', resize: 'vertical',
                direction: 'rtl', background: '#fff',
              }}
              placeholder="כתוב משוב מוסכם..."
            />
          </div>

          {/* Copy from annotator buttons */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {aSelected && (
              <button
                onClick={() => copyFrom(fpAForTurn)}
                style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: `1px solid ${COLOR_A.border}`, background: COLOR_A.light, color: COLOR_A.text, cursor: 'pointer' }}
              >
                העתק מ־{nameA}
              </button>
            )}
            {bSelected && (
              <button
                onClick={() => copyFrom(fpBForTurn)}
                style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: `1px solid ${COLOR_B.border}`, background: COLOR_B.light, color: COLOR_B.text, cursor: 'pointer' }}
              >
                העתק מ־{nameB}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Annotation comparison block for one teacher turn ────────────────────────

function TurnAnnotationComparison({ fpAForTurn, fpBForTurn, nameA, nameB, consensusForTurn, onConsensusChange, consensusCompleted }) {
  const aMarked = fpAForTurn.length > 0;
  const bMarked = fpBForTurn.length > 0;
  if (!aMarked && !bMarked) return null;

  const dimsA   = new Set(fpAForTurn.flatMap(fp => fp.selectedDimensions || []));
  const dimsB   = new Set(fpBForTurn.flatMap(fp => fp.selectedDimensions || []));
  const allDims = PCK_SKILLS.filter(s => dimsA.has(s.id) || dimsB.has(s.id));

  const locationGap    = aMarked !== bMarked;
  const locationGapMsg = aMarked
    ? `רק ${nameA} סימן/ה נקודת משוב בתור זה`
    : `רק ${nameB} סימן/ה נקודת משוב בתור זה`;

  // 4-column grid: פרמטר | A | B | החלטה מוסכמת  (RTL: right-to-left)
  const gridCols = '150px 1fr 1fr 1.4fr';

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
      {/* Location gap banner */}
      {locationGap && (
        <div style={{
          background: '#fff4ee', borderBottom: '1px solid #f5c9af',
          padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8, direction: 'rtl',
        }}>
          <span style={{ color: '#c0392b', fontSize: '0.9rem', flexShrink: 0 }}>⚑</span>
          <span style={{ color: '#c0392b', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>פער במיקום משוב</span>
          <span style={{ color: '#777', fontSize: '0.78rem' }}>{locationGapMsg}</span>
        </div>
      )}

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols }}>
        <div style={{
          padding: '8px 8px', fontWeight: 600, fontSize: '0.73rem',
          color: '#999', background: '#f5f5f5',
          borderBottom: '3px solid #ddd', borderLeft: '1px solid #e4e4e4',
          textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          פרמטר
        </div>
        <div style={{
          padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem',
          color: COLOR_A.text, background: COLOR_A.light,
          borderBottom: `3px solid ${COLOR_A.accent}`, borderLeft: '1px solid #e4e4e4',
          direction: 'rtl', textAlign: 'right',
        }}>
          {nameA}
        </div>
        <div style={{
          padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem',
          color: COLOR_B.text, background: COLOR_B.light,
          borderBottom: `3px solid ${COLOR_B.accent}`, borderLeft: '1px solid #e4e4e4',
          direction: 'rtl', textAlign: 'right',
        }}>
          {nameB}
        </div>
        <div style={{
          padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem',
          color: COLOR_C.text, background: COLOR_C.light,
          borderBottom: `3px solid ${COLOR_C.accent}`,
          direction: 'rtl', textAlign: 'right',
        }}>
          {consensusCompleted ? '✓ החלטה מוסכמת' : 'החלטה מוסכמת'}
        </div>
      </div>

      {/* No dimensions edge case */}
      {allDims.length === 0 && (
        <div style={{ padding: '12px 14px', color: '#aaa', fontSize: '0.84rem', direction: 'rtl' }}>
          סומנה נקודת משוב ללא ממדים נבחרים.
        </div>
      )}

      {/* One row per PCK dimension */}
      {allDims.map((skill, idx) => {
        const aSelected = dimsA.has(skill.id);
        const bSelected = dimsB.has(skill.id);
        const scoreA = aSelected ? getScoreForDim(fpAForTurn, skill.id) : null;
        const scoreB = bSelected ? getScoreForDim(fpBForTurn, skill.id) : null;

        let dimIndicator = null;
        if (aSelected && bSelected && scoreA != null && scoreB != null) {
          dimIndicator = scoreA === scoreB
            ? { label: 'הסכמה בציון', bg: '#d4edda', color: '#155724' }
            : { label: 'פער בציון',   bg: '#fff3cd', color: '#856404' };
        }

        const consensusEntry = consensusForTurn ? consensusForTurn[skill.id] : undefined;

        return (
          <div key={skill.id} style={{
            display: 'grid', gridTemplateColumns: gridCols,
            borderTop: idx === 0 ? '2px solid #ddd' : '1px solid #ebebeb',
          }}>
            {/* פרמטר column */}
            <div style={{
              background: '#f7f7f7', padding: '10px 8px',
              borderLeft: '1px solid #e4e4e4',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
              textAlign: 'center', gap: 4,
            }}>
              <span style={{ fontWeight: 800, fontSize: '0.74rem', color: '#6c5ce7', background: '#ece8ff', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.03em' }}>
                {skill.id.toUpperCase()}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#555', direction: 'rtl', lineHeight: 1.35 }}>
                {skill.label}
              </span>
              {dimIndicator && (
                <span style={{ background: dimIndicator.bg, color: dimIndicator.color, borderRadius: 10, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 600, marginTop: 3 }}>
                  {dimIndicator.label}
                </span>
              )}
              {(!aSelected || !bSelected) && (
                <span style={{ fontSize: '0.67rem', color: '#c0392b', fontStyle: 'italic', marginTop: 2 }}>
                  רק צד אחד
                </span>
              )}
            </div>

            {/* Annotator A */}
            <div style={{ borderLeft: '1px solid #ebebeb' }}>
              <DimAnnotatorCell fps={fpAForTurn} dimId={skill.id} selected={aSelected} colors={COLOR_A} />
            </div>

            {/* Annotator B */}
            <div style={{ borderLeft: '1px solid #ebebeb' }}>
              <DimAnnotatorCell fps={fpBForTurn} dimId={skill.id} selected={bSelected} colors={COLOR_B} />
            </div>

            {/* Consensus */}
            <div style={{ borderLeft: '1px solid #ebebeb' }}>
              <ConsensusDimCell
                dimId={skill.id}
                consensusEntry={consensusEntry}
                onChange={(entry) => onConsensusChange && onConsensusChange(skill.id, entry)}
                readonly={!!consensusCompleted}
                fpAForTurn={fpAForTurn}
                fpBForTurn={fpBForTurn}
                nameA={nameA}
                nameB={nameB}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Full conversation turn (teacher + optional comparison + students) ────────

function FullTurnBlock({ turn, fpA, fpB, nameA, nameB, consensusLocal, onConsensusChangeTurn, consensusCompleted }) {
  const fpAForTurn = fpA.filter(fp => fp.turnNumber === turn.turnNumber);
  const fpBForTurn = fpB.filter(fp => fp.turnNumber === turn.turnNumber);
  const hasAnnotation = fpAForTurn.length > 0 || fpBForTurn.length > 0;

  const teacherMsg = turn.teacher && (turn.teacher.message || turn.teacher.text);
  const students   = turn.students || [];

  const consensusForTurn = consensusLocal ? consensusLocal[turn.turnNumber] || {} : {};

  function handleConsensusChange(dimId, entry) {
    if (onConsensusChangeTurn) onConsensusChangeTurn(turn.turnNumber, dimId, entry);
  }

  return (
    <div style={{ marginBottom: 28, borderRight: '3px solid #f0edff', paddingRight: 14 }}>
      {/* Teacher message */}
      <div style={{
        background: '#fffde7', border: '1px solid #ffe88a',
        borderRadius: 8, padding: '10px 16px',
        marginBottom: hasAnnotation ? 8 : 12,
        direction: 'rtl',
      }}>
        <div style={{ fontSize: '0.71rem', color: '#bbb', fontWeight: 700, marginBottom: 4, letterSpacing: '0.04em' }}>
          תור {turn.turnNumber} — מורה
        </div>
        <div style={{ fontSize: '0.93rem', color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
          {teacherMsg || <em style={{ color: '#ccc' }}>(אין הודעה)</em>}
        </div>
        {turn.teacher && turn.teacher.image && (
          <div style={{ marginTop: 8 }}>
            <img
              src={`data:image/png;base64,${turn.teacher.image}`}
              alt="ציור של המורה"
              style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: 6, border: '1px solid #ffe88a', display: 'block' }}
            />
          </div>
        )}
      </div>

      {/* Annotation comparison + consensus column */}
      {hasAnnotation && (
        <div style={{ marginRight: 10 }}>
          <TurnAnnotationComparison
            fpAForTurn={fpAForTurn}
            fpBForTurn={fpBForTurn}
            nameA={nameA}
            nameB={nameB}
            consensusForTurn={consensusForTurn}
            onConsensusChange={handleConsensusChange}
            consensusCompleted={consensusCompleted}
          />
        </div>
      )}

      {/* Student messages */}
      {students.map((student, i) => (
        <div key={i} style={{
          background: '#f8f9fa', border: '1px solid #e9ecef',
          borderRadius: 8, padding: '9px 16px',
          marginBottom: 8, marginRight: 20, direction: 'rtl',
        }}>
          <div style={{ fontSize: '0.71rem', color: '#bbb', fontWeight: 700, marginBottom: 3, letterSpacing: '0.04em' }}>
            {student.name || 'תלמיד'}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {student.message || student.text || ''}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helper: hydrate consensusLocal from saved feedbackPoints ────────────────

function hydrateConsensusLocal(feedbackPoints) {
  const local = {};
  for (const fp of (feedbackPoints || [])) {
    const tn = fp.turnNumber;
    local[tn] = {};
    for (const dimId of (fp.selectedDimensions || [])) {
      const df = fp.dimensionFeedback && fp.dimensionFeedback[dimId];
      if (df !== undefined) {
        local[tn][dimId] = {
          included:     !!df.included,
          score:        df.score != null ? df.score : null,
          feedbackText: df.feedbackText || '',
        };
      }
    }
  }
  return local;
}

// ─── Helper: build feedbackPoints array from consensusLocal ──────────────────

function buildFeedbackPoints(consensusLocal, turns, fpA, fpB) {
  const result = [];
  for (const [tnStr, dimMap] of Object.entries(consensusLocal)) {
    const tn = Number(tnStr);
    if (!dimMap || Object.keys(dimMap).length === 0) continue;

    // Only include dims in union of A+B for this turn
    const fpAT = fpA.filter(fp => fp.turnNumber === tn);
    const fpBT = fpB.filter(fp => fp.turnNumber === tn);
    const allowed = new Set([
      ...fpAT.flatMap(fp => fp.selectedDimensions || []),
      ...fpBT.flatMap(fp => fp.selectedDimensions || []),
    ]);

    const selectedDimensions = [];
    const dimensionFeedback  = {};
    for (const [dimId, entry] of Object.entries(dimMap)) {
      if (!allowed.has(dimId)) continue; // frontend pre-filter (backend also enforces)
      selectedDimensions.push(dimId);
      dimensionFeedback[dimId] = {
        included:     !!entry.included,
        score:        entry.score != null ? entry.score : null,
        feedbackText: entry.feedbackText || '',
      };
    }

    if (selectedDimensions.length === 0) continue;

    const turn = turns.find(t => t.turnNumber === tn);
    const teacherMessageSnapshot = (turn && turn.teacher && (turn.teacher.message || turn.teacher.text)) || '';
    result.push({ turnNumber: tn, teacherMessageSnapshot, selectedDimensions, dimensionFeedback });
  }
  return result;
}

// ─── Full comparison view ─────────────────────────────────────────────────────

function ComparisonView({ requesterId, comparisonSetId, conversationId, assignmentIdA, assignmentIdB, scenarioTitle, onBack }) {
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [data, setData]                   = useState(null);
  const [consensus, setConsensus]         = useState(null);
  const [consensusError, setConsensusError] = useState(null);
  // local editable map: { [turnNumber]: { [dimId]: { included, score, feedbackText } } }
  const [consensusLocal, setConsensusLocal] = useState({});
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState(null);
  const [submitConfirm, setSubmitConfirm] = useState(false);

  useEffect(() => {
    if (!requesterId || !conversationId || !assignmentIdA || !assignmentIdB) return;
    setLoading(true);
    setError(null);
    setConsensusError(null);

    Promise.all([
      fetchComparisonData(requesterId, conversationId, assignmentIdA, assignmentIdB, false),
      comparisonSetId
        ? fetchConsensusAnnotation(requesterId, comparisonSetId, conversationId).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([compData, consensusDoc]) => {
        setData(compData);
        setConsensus(consensusDoc);
        if (consensusDoc && consensusDoc.feedbackPoints) {
          setConsensusLocal(hydrateConsensusLocal(consensusDoc.feedbackPoints));
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [requesterId, comparisonSetId, conversationId, assignmentIdA, assignmentIdB]);

  const handleConsensusChangeTurn = useCallback((turnNumber, dimId, entry) => {
    setConsensusLocal(prev => ({
      ...prev,
      [turnNumber]: { ...(prev[turnNumber] || {}), [dimId]: entry },
    }));
    setSaveMsg(null);
  }, []);

  async function handleSaveDraft() {
    if (!comparisonSetId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const fps = buildFeedbackPoints(consensusLocal, data.conv.turns || [], data.annotatorA.feedbackPoints, data.annotatorB.feedbackPoints);
      await saveConsensusAnnotationDraft(requesterId, comparisonSetId, conversationId, [assignmentIdA, assignmentIdB], fps);
      const updated = await fetchConsensusAnnotation(requesterId, comparisonSetId, conversationId).catch(() => null);
      setConsensus(updated);
      setSaveMsg({ type: 'success', text: 'הטיוטה נשמרה בהצלחה.' });
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message === 'already_completed' ? 'התיוג המוסכם כבר הוגש ולא ניתן לערוך.' : `שגיאה בשמירה: ${e.message}` });
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitConfirmed() {
    setSubmitConfirm(false);
    setSaving(true);
    setSaveMsg(null);
    try {
      const fps = buildFeedbackPoints(consensusLocal, data.conv.turns || [], data.annotatorA.feedbackPoints, data.annotatorB.feedbackPoints);
      // Validate: every included dim must have score + feedbackText
      const validationErrors = [];
      for (const fp of fps) {
        for (const dimId of fp.selectedDimensions) {
          const df = fp.dimensionFeedback[dimId];
          if (df.included) {
            const skill = PCK_SKILLS.find(s => s.id === dimId);
            const label = skill ? skill.label : dimId;
            if (df.score == null)        validationErrors.push(`תור ${fp.turnNumber} — ${label}: חסר ציון.`);
            if (!df.feedbackText.trim()) validationErrors.push(`תור ${fp.turnNumber} — ${label}: חסר משוב מוסכם.`);
          }
        }
      }
      if (validationErrors.length > 0) {
        setSaveMsg({ type: 'error', text: validationErrors.join(' | ') });
        setSaving(false);
        return;
      }
      await saveConsensusAnnotationDraft(requesterId, comparisonSetId, conversationId, [assignmentIdA, assignmentIdB], fps);
      await submitConsensusAnnotation(requesterId, comparisonSetId, conversationId);
      const updated = await fetchConsensusAnnotation(requesterId, comparisonSetId, conversationId).catch(() => null);
      setConsensus(updated);
      setSaveMsg({ type: 'success', text: 'התיוג המוסכם הוגש בהצלחה.' });
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message === 'already_completed' ? 'התיוג המוסכם כבר הוגש.' : `שגיאה: ${e.message}` });
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit() {
    if (!comparisonSetId) return;
    // Check if there are any included dims at all
    const fps = buildFeedbackPoints(consensusLocal, data.conv.turns || [], data.annotatorA.feedbackPoints, data.annotatorB.feedbackPoints);
    const hasAnyIncluded = fps.some(fp => fp.selectedDimensions.some(d => fp.dimensionFeedback[d] && fp.dimensionFeedback[d].included));
    if (!hasAnyIncluded) {
      setSubmitConfirm(true);
      return;
    }
    handleSubmitConfirmed();
  }

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  if (error) {
    return (
      <div>
        <div className="alert alert-danger">{error}</div>
        <button className="btn btn-sm btn-outline-secondary" onClick={onBack}>← חזרה</button>
      </div>
    );
  }
  if (!data) return null;

  const { conv, annotatorA, annotatorB } = data;
  const turns = conv.turns || [];
  const consensusCompleted = consensus && consensus.status === 'completed';

  const title = (conv.convMeta && conv.convMeta.scenario && conv.convMeta.scenario.text)
    ? conv.convMeta.scenario.text
    : (scenarioTitle || conversationId);

  return (
    <div style={{ paddingBottom: comparisonSetId ? 90 : 0 }}>
      {/* Back + title */}
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <button className="btn btn-sm btn-outline-secondary" onClick={onBack}>← חזרה</button>
        <h6 className="mb-0" style={{ color: '#6c5ce7', direction: 'rtl' }}>{title}</h6>
        {consensusCompleted && (
          <span style={{ background: COLOR_C.light, color: COLOR_C.text, border: `1px solid ${COLOR_C.border}`, borderRadius: 6, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
            ✓ הוגש
          </span>
        )}
      </div>

      {/* Annotator legend */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div className="d-flex gap-3">
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: COLOR_A.text, background: COLOR_A.light, border: `1px solid ${COLOR_A.border}`, borderRadius: 6, padding: '3px 10px' }}>
            {annotatorA.name}
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: COLOR_B.text, background: COLOR_B.light, border: `1px solid ${COLOR_B.border}`, borderRadius: 6, padding: '3px 10px' }}>
            {annotatorB.name}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#bbb' }}>השוואה לצפייה בלבד</span>
      </div>

      {/* Consensus load error (non-blocking) */}
      {consensusError && (
        <div className="alert alert-warning py-2" style={{ fontSize: '0.85rem', direction: 'rtl' }}>
          לא ניתן לטעון את ההחלטה המוסכמת: {consensusError}
        </div>
      )}

      {/* Full conversation */}
      {turns.length === 0 ? (
        <div className="alert alert-info">לא נמצאו תורות בשיחה זו.</div>
      ) : (
        turns.map(turn => (
          <FullTurnBlock
            key={turn.turnNumber != null ? turn.turnNumber : Math.random()}
            turn={turn}
            fpA={annotatorA.feedbackPoints}
            fpB={annotatorB.feedbackPoints}
            nameA={annotatorA.name}
            nameB={annotatorB.name}
            consensusLocal={consensusLocal}
            onConsensusChangeTurn={consensusCompleted ? null : handleConsensusChangeTurn}
            consensusCompleted={!!consensusCompleted}
          />
        ))
      )}

      {/* Confirmation dialog: submit with no included feedback */}
      {submitConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050,
        }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, maxWidth: 400, direction: 'rtl', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h6 style={{ fontWeight: 700, marginBottom: 12 }}>אישור הגשה</h6>
            <p style={{ fontSize: '0.9rem', color: '#444' }}>
              לא נבחרה אף נקודת משוב מוסכמת בשיחה. האם לסיים בכל זאת?
            </p>
            <div className="d-flex gap-2 justify-content-end mt-3">
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setSubmitConfirm(false)}>ביטול</button>
              <button className="btn btn-sm btn-success" onClick={handleSubmitConfirmed}>הגש בכל זאת</button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom action bar — only when comparisonSetId is provided */}
      {comparisonSetId && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #dee2e6',
          padding: '10px 24px', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 12,
          justifyContent: 'flex-start', direction: 'rtl',
        }}>
          {consensusCompleted ? (
            <span style={{ fontSize: '0.88rem', color: COLOR_C.text, fontWeight: 600 }}>
              ✓ התיוג המוסכם הוגש{consensus.submittedAt ? ` · ${consensus.submittedAt}` : ''}
            </span>
          ) : (
            <>
              <button
                className="btn btn-sm btn-outline-success"
                onClick={handleSaveDraft}
                disabled={saving || !comparisonSetId}
              >
                {saving ? 'שומר...' : 'שמור טיוטה'}
              </button>
              <button
                className="btn btn-sm btn-success"
                onClick={handleSubmit}
                disabled={saving || !comparisonSetId}
              >
                סיום תיוג מוסכם
              </button>
              {consensus && consensus.updatedAt && (
                <span style={{ fontSize: '0.78rem', color: '#aaa' }}>
                  עודכן: {consensus.updatedAt}
                </span>
              )}
            </>
          )}
          {saveMsg && (
            <span style={{ fontSize: '0.82rem', color: saveMsg.type === 'success' ? COLOR_C.text : '#c0392b', marginRight: 8 }}>
              {saveMsg.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Set detail view (list of conversations) ──────────────────────────────────

function SetDetailView({ requesterId, set, onBack, onOpenComparison }) {
  const items = set.items || [];

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <button className="btn btn-sm btn-outline-secondary" onClick={onBack}>← חזרה לרשימה</button>
        <h6 className="mb-0" style={{ color: '#6c5ce7' }}>{set.title}</h6>
      </div>

      {set.description && (
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: 16 }}>{set.description}</p>
      )}

      {items.length === 0 ? (
        <div className="alert alert-info">אין שיחות בסט זה.</div>
      ) : (
        <div>
          {items.map((item, idx) => {
            const title = (item.convMeta && item.convMeta.scenario && item.convMeta.scenario.text)
              ? item.convMeta.scenario.text
              : item.conversationId;
            const annotatorNames = item.annotatorNames || [];
            return (
              <div
                key={item.conversationId}
                style={{
                  border: '1px solid #dee2e6', borderRadius: 8, padding: '14px 16px',
                  marginBottom: 10, background: '#fff',
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: '#333', fontSize: '0.92rem', direction: 'rtl' }}>
                    שיחה {idx + 1} — {title}
                  </div>
                  {annotatorNames.length > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 3 }}>
                      {annotatorNames.join(' · ')}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-sm text-white"
                  style={{ background: '#6c5ce7', borderColor: '#6c5ce7', borderRadius: 20 }}
                  onClick={() => onOpenComparison(item, title)}
                >
                  פתח השוואה
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sets list view ───────────────────────────────────────────────────────────

function SetsListView({ sets, loading, error, onOpen }) {
  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  if (error)   return <div className="alert alert-danger">{error}</div>;

  if (sets.length === 0) {
    return (
      <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
        אין סטי השוואה זמינים כרגע. האדמין יוסיף השוואות בקרוב.
      </div>
    );
  }

  return (
    <div>
      {sets.map(set => (
        <div
          key={set.id}
          style={{
            border: '1px solid #dee2e6', borderRadius: 10, padding: '16px 18px',
            marginBottom: 12, background: '#fff',
          }}
        >
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <h6 style={{ color: '#6c5ce7', marginBottom: 4, fontWeight: 700 }}>{set.title}</h6>
              {set.description && (
                <p style={{ fontSize: '0.87rem', color: '#666', marginBottom: 6 }}>{set.description}</p>
              )}
              <span style={{ fontSize: '0.8rem', color: '#888' }}>
                {set.itemCount} שיחות
              </span>
            </div>
            <button
              className="btn btn-sm text-white"
              style={{ background: '#6c5ce7', borderColor: '#6c5ce7', borderRadius: 20, alignSelf: 'flex-start' }}
              onClick={() => onOpen(set.id)}
            >
              פתח השוואה
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ComparisonSetsPage() {
  const { currentUser } = useAuth();
  const requesterId = currentUser && currentUser.uid;

  const [view, setView]                       = useState('list'); // 'list' | 'set' | 'comparison'
  const [sets, setSets]                       = useState([]);
  const [setsLoading, setSetsLoading]         = useState(true);
  const [setsError, setSetsError]             = useState(null);
  const [selectedSet, setSelectedSet]         = useState(null);
  const [selectedItem, setSelectedItem]       = useState(null);
  const [selectedItemTitle, setSelectedItemTitle] = useState('');
  const [setLoading, setSetLoading]           = useState(false);
  const [setError, setSetError]               = useState(null);

  useEffect(() => {
    if (!requesterId) return;
    setSetsLoading(true);
    fetchComparisonSets(requesterId, false)
      .then(s => setSets(s))
      .catch(e => setSetsError(e.message))
      .finally(() => setSetsLoading(false));
  }, [requesterId]);

  async function handleOpenSet(setId) {
    setSetLoading(true);
    setSetError(null);
    try {
      const set = await fetchComparisonSetDetail(requesterId, setId, false);
      setSelectedSet(set);
      setView('set');
    } catch (e) {
      setSetError(e.message);
    } finally {
      setSetLoading(false);
    }
  }

  function handleOpenComparison(item, title) {
    setSelectedItem(item);
    setSelectedItemTitle(title);
    setView('comparison');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7fc', paddingTop: 80, paddingBottom: 60 }}>
      <div className="container" style={{ maxWidth: 900, direction: 'rtl' }}>

        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: 0 }}>השוואת תיוגים</h2>
        </div>

        {setLoading && <div className="text-center py-4"><div className="spinner-border text-primary" /></div>}
        {setError   && <div className="alert alert-danger mb-3">{setError}</div>}

        {!setLoading && view === 'list' && (
          <SetsListView
            sets={sets}
            loading={setsLoading}
            error={setsError}
            onOpen={handleOpenSet}
          />
        )}

        {!setLoading && view === 'set' && selectedSet && (
          <SetDetailView
            requesterId={requesterId}
            set={selectedSet}
            onBack={() => setView('list')}
            onOpenComparison={handleOpenComparison}
          />
        )}

        {view === 'comparison' && selectedItem && Array.isArray(selectedItem.assignmentIds) && selectedItem.assignmentIds.length >= 2 && (
          <ComparisonView
            requesterId={requesterId}
            comparisonSetId={selectedSet && selectedSet.id}
            conversationId={selectedItem.conversationId}
            assignmentIdA={selectedItem.assignmentIds[0]}
            assignmentIdB={selectedItem.assignmentIds[1]}
            scenarioTitle={selectedItemTitle}
            onBack={() => setView('set')}
          />
        )}
      </div>
    </div>
  );
}
