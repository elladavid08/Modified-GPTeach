import React from 'react';

export const LessonTargetsSidebar = ({ scenario }) => {
  if (!scenario) return null;

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: '60px',
      height: 'calc(100vh - 60px)',
      width: '300px',
      backgroundColor: '#f8f9fa',
      borderRight: '2px solid #dee2e6',
      padding: '20px',
      overflowY: 'auto',
      direction: 'rtl',
      textAlign: 'right',
      fontFamily: 'Arial, sans-serif',
      zIndex: 100
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ 
          color: '#495057', 
          borderBottom: '2px solid #007bff', 
          paddingBottom: '10px',
          marginBottom: '15px',
          marginTop: 0,
          lineHeight: '1.2',
          fontSize: '24px'
        }}>
          🎯 יעדי השיעור
        </h4>
      </div>

      {/* Lesson Description */}
      {scenario.text && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#e7f3ff',
          borderRadius: '8px',
          borderRight: '4px solid #007bff'
        }}>
          <h6 style={{ color: '#0056b3', marginBottom: '10px', fontWeight: 'bold' }}>
            📖 תיאור השיעור
          </h6>
          <p style={{ margin: 0, lineHeight: '1.6', color: '#495057' }}>
            {scenario.text}
          </p>
        </div>
      )}

      {/* Lesson Goals */}
      {scenario.lesson_goals && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#fff3cd',
          borderRadius: '8px',
          borderRight: '4px solid #ffc107'
        }}>
          <h6 style={{ color: '#856404', marginBottom: '10px', fontWeight: 'bold' }}>
            🎓 מטרות הלמידה
          </h6>
          <div style={{ 
            whiteSpace: 'pre-wrap', 
            lineHeight: '1.8', 
            color: '#495057',
            fontSize: '0.95rem'
          }}>
            {typeof scenario.lesson_goals === 'string' 
              ? scenario.lesson_goals 
              : scenario.lesson_goals.join('\n')}
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonTargetsSidebar;

