import React, { useState } from 'react';

/**
 * Extracts the lesson context paragraph from teacher_briefing,
 * stopping before the simulation instructions sentence.
 */
function extractBriefingDescription(teacherBriefing) {
  if (!teacherBriefing) return null;
  const cutoff = teacherBriefing.indexOf('אתם עומדים להתנסות בסימולציה');
  if (cutoff === -1) return teacherBriefing.trim();
  return teacherBriefing.substring(0, cutoff).trim();
}

export const ScenarioSelector = ({ scenarios, onSelect }) => {
  const [activeIndex, setActiveIndex] = useState(null);

  const activeScenario = activeIndex !== null ? scenarios[activeIndex] : null;
  const description = activeScenario ? extractBriefingDescription(activeScenario.teacher_briefing) : null;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f4f8',
      direction: 'rtl',
      fontFamily: 'Arial, sans-serif',
      padding: '40px 24px',
    }}>

      {/* Welcome header */}
      <div style={{ maxWidth: 900, margin: '0 auto 36px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12, paddingTop: 16 }}>🏫</div>
        <h1 style={{ fontSize: 28, fontWeight: 'bold', color: '#1a3a5c', marginBottom: 10 }}>
          ברוכים הבאים לסימולטור ההוראה
        </h1>
        <p style={{ fontSize: 16, color: '#4a5568', maxWidth: 560, margin: '0 auto' }}>
          בחרו שיעור מהרשימה כדי להתחיל.<br />
          בלחיצה על שיעור תוכלו לקרוא את תיאורו המלא, ולאחר מכן להתחיל את הסימולציה.
        </p>
      </div>

      {/* Scenario grid */}
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        {scenarios.map((scenario, idx) => {
          const isActive = activeIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => setActiveIndex(isActive ? null : idx)}
              style={{
                backgroundColor: isActive ? '#1a3a5c' : '#ffffff',
                color: isActive ? '#ffffff' : '#1a3a5c',
                border: isActive ? '2px solid #1a3a5c' : '2px solid #cbd5e0',
                borderRadius: 10,
                padding: '18px 16px',
                textAlign: 'right',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 4px 12px rgba(26,58,92,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 'bold', lineHeight: 1.4 }}>
                {scenario.text}
              </span>
            </button>
          );
        })}
      </div>

      {/* Description panel — shown when a scenario is selected */}
      {activeScenario && (
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          backgroundColor: '#ffffff',
          border: '2px solid #1a3a5c',
          borderRadius: 12,
          padding: '28px 32px',
          boxShadow: '0 4px 20px rgba(26,58,92,0.12)',
        }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', color: '#718096', letterSpacing: '0.5px' }}>
              נושא השיעור
            </span>
            <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#1a3a5c', margin: '4px 0 0 0' }}>
              {activeScenario.text}
            </h2>
          </div>

          {description && (
            <p style={{
              fontSize: 15,
              color: '#2d3748',
              lineHeight: 1.8,
              margin: '0 0 24px 0',
              whiteSpace: 'pre-line',
              backgroundColor: '#f7fafc',
              borderRadius: 8,
              padding: '14px 16px',
              borderRight: '4px solid #4299e1',
            }}>
              {description}
            </p>
          )}

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => onSelect(activeScenario)}
              style={{
                backgroundColor: '#1a3a5c',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '12px 36px',
                fontSize: 16,
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(26,58,92,0.3)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2a5298'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#1a3a5c'}
            >
              התחל בשיעור ←
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioSelector;
