import React from 'react';
import { logEvent, beaconEvents } from '../utils/annotationDiagnostics';

/**
 * Error boundary scoped to the annotation editor route.
 *
 * Without a boundary, an uncaught render error unmounts the entire React root
 * (React 18 `createRoot` behavior), producing a blank page that looks like the
 * tab refreshed. This contains the failure to one route, records it, and leaves
 * the localStorage backup untouched so the work can still be recovered.
 */
export default class AnnotationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: (error && error.message) || 'שגיאה לא צפויה' };
  }

  componentDidCatch(error, info) {
    logEvent('error_boundary_caught', {
      message: (error && error.message) || String(error),
      stack: (error && error.stack) ? String(error.stack).slice(0, 1500) : '',
      componentStack: (info && info.componentStack) ? String(info.componentStack).slice(0, 1500) : '',
    });
    beaconEvents();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="container mt-5" dir="rtl" style={{ maxWidth: '720px' }}>
        <div className="alert alert-danger">
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>אירעה שגיאה בעמוד התיוג</div>
          <div style={{ fontSize: '0.9rem' }}>{this.state.message}</div>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#555' }}>
          העבודה שלך נשמרה מקומית בדפדפן. טעינה מחדש של העמוד תציע לך לשחזר אותה.
        </p>
        <button
          className="btn btn-primary"
          style={{ background: '#6c5ce7', borderColor: '#6c5ce7', borderRadius: '20px' }}
          onClick={() => window.location.reload()}
        >
          טען מחדש את העמוד
        </button>
      </div>
    );
  }
}
