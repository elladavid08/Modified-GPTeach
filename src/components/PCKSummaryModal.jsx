import React from 'react';

export const PCKSummaryModal = ({ summary, onClose, isLoading }) => {
  if (!summary && !isLoading) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '30px',
          direction: 'rtl',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
            <h3>מנתח את השיחה...</h3>
            <p style={{ color: '#6c757d' }}>
              זה עשוי לקחת מספר שניות. אנא המתן.
            </p>
            <div style={{
              width: '100px',
              height: '4px',
              backgroundColor: '#e0e0e0',
              margin: '20px auto',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: '30%',
                height: '100%',
                backgroundColor: '#007bff',
                animation: 'loading 1.5s ease-in-out infinite'
              }} />
            </div>
            <style>{`
              @keyframes loading {
                0% { margin-left: 0%; }
                50% { margin-left: 70%; }
                100% { margin-left: 0%; }
              }
            `}</style>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '15px',
              borderBottom: '2px solid #007bff'
            }}>
              <h2 style={{ margin: 0, color: '#007bff' }}>
                📊 ניתוח מקיף PCK
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6c757d',
                  padding: '5px 10px'
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div 
              style={{
                lineHeight: '1.8',
                fontSize: '16px',
                whiteSpace: 'pre-wrap'
              }}
              className="pck-summary-content"
              dangerouslySetInnerHTML={{
                __html: summary
                  .replace(/# (.*)/g, '<h1 style="color: #007bff; margin-top: 30px; margin-bottom: 15px; font-size: 28px;">$1</h1>')
                  .replace(/## (.*)/g, '<h2 style="color: #28a745; margin-top: 25px; margin-bottom: 12px; font-size: 24px;">$1</h2>')
                  .replace(/### (.*)/g, '<h3 style="color: #ffc107; margin-top: 20px; margin-bottom: 10px; font-size: 20px;">$1</h3>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #495057; font-weight: 600;">$1</strong>')
                  .replace(/\n\n/g, '<p style="margin-bottom: 12px;"></p>')
                  .replace(/\n/g, '<br/>')
              }}
            />

            <div style={{
              marginTop: '30px',
              paddingTop: '20px',
              borderTop: '1px solid #dee2e6',
              textAlign: 'center'
            }}>
              <button
                onClick={onClose}
                className="btn btn-primary"
                style={{ padding: '10px 30px', fontSize: '16px' }}
              >
                סגור
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PCKSummaryModal;

