import React, { useState } from 'react';
import { PCK_SKILLS } from '../config/testConfig';

// ─── Score buttons (0 / 1 / 2) ───────────────────────────────────────────────

function scoreColor(n) {
  if (n === 0) return '#e17055';
  if (n === 1) return '#fdcb6e';
  return '#00b894';
}

function ScoreButtons({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {[0, 1, 2].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            border: `2px solid ${value === n ? scoreColor(n) : '#ced4da'}`,
            background: value === n ? scoreColor(n) : '#fff',
            color: value === n ? '#fff' : '#555',
            fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ScoreLegend() {
  return (
    <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: '#888' }}>
      <span><span style={{ color: '#00b894', fontWeight: 700 }}>2</span> = מלא</span>
      <span><span style={{ color: '#fdcb6e', fontWeight: 700 }}>1</span> = חלקי</span>
      <span><span style={{ color: '#e17055', fontWeight: 700 }}>0</span> = חסר</span>
    </div>
  );
}

/**
 * Migrate a legacy feedback point (old structure: scores + feedbackText)
 * into the new dimensionFeedback structure.
 * If existingPoint already has dimensionFeedback, return it as-is.
 */
function initDimensionFeedback(existingPoint) {
  if (!existingPoint) return {};
  if (existingPoint.dimensionFeedback) return existingPoint.dimensionFeedback;
  // Legacy format: scores map + single feedbackText field
  const migrated = {};
  (existingPoint.selectedDimensions || []).forEach(d => {
    migrated[d] = {
      score:        (existingPoint.scores || {})[d] !== undefined ? (existingPoint.scores || {})[d] : null,
      feedbackText: existingPoint.feedbackText || '',
    };
  });
  return migrated;
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * FeedbackPointEditor
 *
 * Props:
 *   turn          – full turn object ({ turnNumber, teacher: { message }, ... })
 *   existingPoint – existing feedback point object, or null for a new one
 *   sessionId     – conversationId (stored in each feedback point for global uniqueness)
 *   onSave        – called with the validated feedback point object
 *   onCancel      – called when user cancels
 */
export default function FeedbackPointEditor({ turn, existingPoint, sessionId, onSave, onCancel }) {
  const [selectedDimensions, setSelectedDimensions] = useState(
    existingPoint ? (existingPoint.selectedDimensions || []) : []
  );
  const [dimensionFeedback, setDimensionFeedback] = useState(() => initDimensionFeedback(existingPoint));
  const [internalNote,      setInternalNote]      = useState(existingPoint ? (existingPoint.internalNote || '') : '');
  const [showNote,          setShowNote]          = useState(!!(existingPoint && existingPoint.internalNote));
  const [validationError,   setValidationError]   = useState('');

  const toggleDimension = (id) => {
    setSelectedDimensions(prev => {
      if (prev.includes(id)) {
        setDimensionFeedback(s => { const ns = { ...s }; delete ns[id]; return ns; });
        return prev.filter(d => d !== id);
      }
      // Add: initialize entry only if not already present (preserved when toggling back on)
      setDimensionFeedback(s => s[id] ? s : { ...s, [id]: { score: null, feedbackText: '' } });
      return [...prev, id];
    });
  };

  const updateDimension = (dimId, field, value) => {
    setDimensionFeedback(prev => ({
      ...prev,
      [dimId]: { ...(prev[dimId] || {}), [field]: value },
    }));
  };

  const handleSave = () => {
    setValidationError('');

    if (selectedDimensions.length === 0) {
      setValidationError('יש לבחור לפחות ממד PCK אחד.');
      return;
    }

    for (const d of selectedDimensions) {
      const skill    = PCK_SKILLS.find(s => s.id === d);
      const dimLabel = skill ? skill.label : d;
      const df       = dimensionFeedback[d] || {};

      if (df.score == null) {
        setValidationError(`יש להגדיר ציון עבור: ${dimLabel}.`);
        return;
      }
      if (!df.feedbackText || !df.feedbackText.trim()) {
        setValidationError(`יש לכתוב משוב עבור: ${dimLabel}.`);
        return;
      }
    }

    const now = new Date().toISOString();
    const cleanedDimensionFeedback = {};
    selectedDimensions.forEach(d => {
      cleanedDimensionFeedback[d] = {
        score:        dimensionFeedback[d].score,
        feedbackText: dimensionFeedback[d].feedbackText.trim(),
      };
    });

    const point = {
      feedbackPointId:        existingPoint ? existingPoint.feedbackPointId : crypto.randomUUID(),
      turnNumber:             turn.turnNumber,
      sessionId,
      teacherMessageSnapshot: existingPoint
        ? existingPoint.teacherMessageSnapshot
        : (turn.teacher && turn.teacher.message) || '',
      selectedDimensions,
      dimensionFeedback:      cleanedDimensionFeedback,
      internalNote:           internalNote.trim(),
      createdAt:              existingPoint ? existingPoint.createdAt : now,
      updatedAt:              now,
    };

    onSave(point);
  };

  return (
    <div style={{ direction: 'rtl', padding: '0' }}>
      {/* Teacher message preview */}
      <div style={{
        background: '#f8f9fa', borderRight: '4px solid #6c5ce7',
        borderRadius: '6px', padding: '10px 14px', marginBottom: '16px',
        fontSize: '0.88rem', color: '#444',
      }}>
        <span style={{ fontWeight: 600, color: '#6c5ce7', marginLeft: '6px' }}>תור {turn.turnNumber} — מורה:</span>
        {(turn.teacher && turn.teacher.message) || '—'}
      </div>

      {/* PCK Dimensions */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#333', marginBottom: '10px' }}>
          ממדי PCK רלוונטיים:
        </div>

        {PCK_SKILLS.map(skill => {
          const isSelected  = selectedDimensions.includes(skill.id);
          const df          = dimensionFeedback[skill.id] || {};
          const missingScore = isSelected && df.score == null;
          const missingText  = isSelected && !(df.feedbackText && df.feedbackText.trim());

          return (
            <div
              key={skill.id}
              style={{
                marginBottom: '10px',
                border:       isSelected ? '1px solid #b39ddb' : '1px solid transparent',
                borderRadius: '8px',
                padding:      isSelected ? '10px 12px' : '2px 0',
                background:   isSelected ? '#faf8ff'   : 'transparent',
                transition:   'all 0.15s',
              }}
            >
              {/* Dimension checkbox row */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: isSelected ? '10px' : 0 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleDimension(skill.id)}
                />
                <span style={{
                  background: isSelected ? '#6c5ce7' : '#e9ecef',
                  color:      isSelected ? '#fff'     : '#555',
                  borderRadius: '4px', padding: '2px 8px',
                  fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s',
                }}>
                  {skill.id.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#333' : '#666' }}>
                  {skill.label}
                </span>
              </label>

              {/* Expanded section for this dimension */}
              {isSelected && (
                <div>
                  {/* Score row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <ScoreButtons
                      value={df.score !== undefined ? df.score : null}
                      onChange={v => updateDimension(skill.id, 'score', v)}
                    />
                    <ScoreLegend />
                    {missingScore && (
                      <span style={{ fontSize: '0.78rem', color: '#e17055', marginRight: '4px' }}>נדרש ציון</span>
                    )}
                  </div>

                  {/* Dimension-specific feedback textarea */}
                  <textarea
                    style={{
                      width: '100%', minHeight: '72px', resize: 'vertical',
                      padding: '7px 10px', borderRadius: '6px',
                      border: missingText ? '1px solid #fab1a0' : '1px solid #ced4da',
                      fontFamily: 'inherit', fontSize: '0.88rem', direction: 'rtl',
                      background: '#fff',
                    }}
                    placeholder={`משוב עבור ${skill.label}...`}
                    value={df.feedbackText || ''}
                    onChange={e => updateDimension(skill.id, 'feedbackText', e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Internal note (collapsible, optional, general) */}
      <div style={{ marginBottom: '16px' }}>
        <button
          type="button"
          style={{ background: 'none', border: 'none', color: '#6c5ce7', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
          onClick={() => setShowNote(v => !v)}
        >
          {showNote ? '▲ הסתר הערה פנימית' : '▼ הוסף הערה פנימית (לא תוצג למורה)'}
        </button>
        {showNote && (
          <textarea
            style={{
              width: '100%', minHeight: '60px', resize: 'vertical',
              padding: '8px 12px', borderRadius: '6px', border: '1px solid #ced4da',
              fontFamily: 'inherit', fontSize: '0.88rem', direction: 'rtl',
              marginTop: '8px', background: '#fffde7',
            }}
            placeholder="הערה פנימית למחקר (לא תוצג למורה)..."
            value={internalNote}
            onChange={e => setInternalNote(e.target.value)}
          />
        )}
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="alert alert-danger py-2" style={{ fontSize: '0.88rem', marginBottom: '0' }}>
          {validationError}
        </div>
      )}

      {/* Action buttons — sticky at the bottom of the scrollable modal body */}
      <div style={{
        position: 'sticky', bottom: 0,
        background: '#fff',
        paddingTop: '12px', paddingBottom: '16px',
        marginTop: '12px',
        borderTop: '1px solid #e9ecef',
        display: 'flex', gap: '10px', justifyContent: 'flex-end',
      }}>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel} style={{ borderRadius: '20px' }}>
          ביטול
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ background: '#6c5ce7', borderColor: '#6c5ce7', borderRadius: '20px' }}
          onClick={handleSave}
        >
          שמור נקודה
        </button>
      </div>
    </div>
  );
}
