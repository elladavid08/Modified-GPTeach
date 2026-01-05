import React from 'react';

export const PCKFeedbackSidebar = ({ feedback, isVisible }) => {
  if (!isVisible || !feedback) {
    return (
      <div className="pck-sidebar-placeholder" style={{
        position: 'fixed',
        right: 0,
        top: '60px',
        height: 'calc(100vh - 60px)',
        width: '300px',
        backgroundColor: '#f8f9fa',
        borderLeft: '2px solid #dee2e6',
        padding: '20px',
        direction: 'rtl',
        textAlign: 'right',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6c757d'
      }}>
        <div>
          <h5>💡 משוב מומחה PCK</h5>
          <p className="text-muted">בהמתנה לתגובת המורה...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pck-sidebar" style={{
      position: 'fixed',
      right: 0,
      top: '60px',
      height: 'calc(100vh - 60px)',
      width: '300px',
      backgroundColor: '#f8f9fa',
      borderLeft: '2px solid #dee2e6',
      padding: '20px',
      overflowY: 'auto',
      direction: 'rtl',
      textAlign: 'right',
      fontFamily: 'Arial, sans-serif',
      zIndex: 100
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ color: '#495057', borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>
          💡 משוב מומחה PCK
        </h4>
      </div>
      
      {/* Detected Skills */}
      {feedback.detected_skills && feedback.detected_skills.length > 0 && (
        <div className="detected-skills" style={{ marginBottom: '20px' }}>
          <h6 style={{ color: '#28a745', marginBottom: '10px' }}>✅ כישורים שזוהו:</h6>
          {feedback.detected_skills.map((skill, index) => (
            <div key={index} style={{
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '5px',
              padding: '10px',
              marginBottom: '8px',
              borderRight: '4px solid #28a745'
            }}>
              <div style={{ fontSize: '0.85em', color: '#155724', fontWeight: 'bold', marginBottom: '5px' }}>
                {skill.skill_id}
              </div>
              <div style={{ fontSize: '0.9em', color: '#155724' }}>
                {skill.evidence}
              </div>
              {skill.confidence && (
                <div style={{ fontSize: '0.8em', color: '#6c757d', marginTop: '5px' }}>
                  רמת ביטחון: {Math.round(skill.confidence * 100)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Missed Opportunities */}
      {feedback.missed_opportunities && feedback.missed_opportunities.length > 0 && (
        <div className="missed-opportunities" style={{ marginBottom: '20px' }}>
          <h6 style={{ color: '#ffc107', marginBottom: '10px' }}>💭 הזדמנויות לשיפור:</h6>
          {feedback.missed_opportunities.map((miss, index) => (
            <div key={index} style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeaa7',
              borderRadius: '5px',
              padding: '10px',
              marginBottom: '8px',
              borderRight: '4px solid #ffc107'
            }}>
              <div style={{ fontSize: '0.85em', color: '#856404', fontWeight: 'bold', marginBottom: '5px' }}>
                {miss.skill_id}
                {miss.priority && (
                  <span style={{
                    backgroundColor: miss.priority === 'high' ? '#dc3545' : miss.priority === 'medium' ? '#ffc107' : '#6c757d',
                    color: 'white',
                    fontSize: '0.75em',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    marginRight: '8px'
                  }}>
                    {miss.priority}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.9em', color: '#856404' }}>
                {miss.suggestion}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Feedback Message */}
      {feedback.feedback_message && (
        <div style={{
          backgroundColor: 
            feedback.feedback_type === 'positive' ? '#28a745' :
            feedback.feedback_type === 'suggestion' ? '#ffc107' :
            '#17a2b8',
          color: feedback.feedback_type === 'suggestion' ? '#212529' : 'white',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '1rem',
          fontWeight: '500',
          lineHeight: '1.4',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          {feedback.feedback_message}
        </div>
      )}

      {/* Timestamp */}
      <div style={{
        marginTop: '20px',
        fontSize: '0.8em',
        color: '#6c757d',
        textAlign: 'center',
        borderTop: '1px solid #dee2e6',
        paddingTop: '10px'
      }}>
        עודכן: {new Date().toLocaleTimeString('he-IL')}
      </div>
    </div>
  );
};

export default PCKFeedbackSidebar;
