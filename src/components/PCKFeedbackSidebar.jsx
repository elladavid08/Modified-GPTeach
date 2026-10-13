import React from 'react';
import { buildPckDisplayRows } from '../services/pckDisplayRows';

const SKILL_NAMES_HE = {
  'error-identification':           'זיהוי השגיאה',
  'error-characterization':         'אפיון סוג השגיאה',
  'diagnostic-interpretation':      'פרשנות אבחונית של חשיבת התלמיד',
  'adapted-pedagogical-response':   'תגובה פדגוגית מותאמת',
  'error-leveraging':               'מינוף השגיאה ללמידה',
};

const SCORE_CONFIG = {
  2: { color: '#28a745', label: 'קיים היטב' },
  1: { color: '#ffc107', label: 'קיים באופן חלקי' },
  0: { color: '#c9b8d8', label: 'חסר' },
};

const LEGEND_ORDER = [2, 1, 0];

function SkillDot({ color }) {
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

// 1.4.3 display contract (src/services/pckDisplayRows.js): the main text is the positive part for score 1/2 and
// the improvement for score 0; score 1 adds its improvement on a second line. All text comes from the PCK output.
function SkillRow({ skillId, score, positive, improvement }) {
  const config = SCORE_CONFIG[score] !== undefined ? SCORE_CONFIG[score] : SCORE_CONFIG[0];
  const name = SKILL_NAMES_HE[skillId] || skillId;
  const text = score === 1 || score === 2 ? positive : improvement;
  const secondLine = score === 1 ? improvement : null;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      padding: '8px 0',
      borderBottom: '1px solid #e9ecef',
      direction: 'rtl',
    }}>
      <SkillDot color={config.color} />
      <span style={{ fontSize: '0.88rem', color: '#333', lineHeight: '1.5' }}>
        <strong>{name}</strong>
        {text ? ': ' + text : ''}
        {secondLine ? (
          <span data-testid="pck-row-improvement" style={{ display: 'block', marginTop: '2px' }}>
            {'לשיפור: ' + secondLine}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Legend() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginBottom: '14px',
      padding: '8px 10px',
      backgroundColor: '#ebebeb',
      borderRadius: '6px',
      fontSize: '0.78rem',
      color: '#555',
      direction: 'rtl',
    }}>
      {LEGEND_ORDER.map(function(score) {
        var color = SCORE_CONFIG[score].color;
        var label = SCORE_CONFIG[score].label;
        return (
          <div key={score} style={{ display: 'flex', alignItems: 'center' }}>
            <SkillDot color={color} />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

const SIDEBAR_STYLE = {
  position: 'fixed',
  right: 0,
  top: '60px',
  height: 'calc(100vh - 60px)',
  width: '22%',
  backgroundColor: '#f8f9fa',
  borderLeft: '2px solid #dee2e6',
  padding: '20px',
  overflowY: 'auto',
  direction: 'rtl',
  textAlign: 'right',
  fontFamily: 'Arial, sans-serif',
  zIndex: 100,
};

export const PCKFeedbackSidebar = ({ feedback, isVisible, errorMessage }) => {
  if (!isVisible || !feedback) {
    return (
      <div style={{
        position: 'fixed',
        right: 0,
        top: '60px',
        height: 'calc(100vh - 60px)',
        width: '22%',
        backgroundColor: '#f8f9fa',
        borderLeft: '2px solid #dee2e6',
        padding: '20px',
        direction: 'rtl',
        textAlign: 'right',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6c757d',
      }}>
        <div>
          <h5>💡 משוב מומחה PCK</h5>
          {errorMessage ? (
            <p role="alert" data-testid="pck-error" style={{ color: '#856404', backgroundColor: '#fff3cd', borderRadius: '6px', padding: '8px 10px' }}>
              {errorMessage}
            </p>
          ) : (
            <p className="text-muted">בהמתנה לתגובת המורה...</p>
          )}
        </div>
      </div>
    );
  }

  // Per-skill rows from the display view-model (1.4.3; legacy feedback without skills_assessment included)
  var skillRows = buildPckDisplayRows(feedback);

  return (
    <div style={SIDEBAR_STYLE}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ color: '#495057', borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>
          💡 משוב מומחה PCK
        </h4>
      </div>

      {/* Per-skill rows — each carries its own explanatory text */}
      {skillRows.length > 0 && (
        <div>
          <Legend />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {skillRows.map(function(row) {
              return (
                <SkillRow
                  key={row.skillId}
                  skillId={row.skillId}
                  score={row.score}
                  positive={row.positive}
                  improvement={row.improvement}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div style={{
        marginTop: '20px',
        fontSize: '0.8em',
        color: '#6c757d',
        textAlign: 'center',
        borderTop: '1px solid #dee2e6',
        paddingTop: '10px',
      }}>
        עודכן: {new Date().toLocaleTimeString('he-IL')}
      </div>
    </div>
  );
};

export default PCKFeedbackSidebar;
