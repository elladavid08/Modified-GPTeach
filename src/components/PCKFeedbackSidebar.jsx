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
      {/* Main Feedback Message - Only show the feedback text to teacher */}
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
