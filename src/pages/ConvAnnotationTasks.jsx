import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyAssignments } from '../services/convAnnotationService';

const STATUS_LABELS = {
  not_started: { he: 'טרם התחיל',   cls: 'bg-secondary text-white' },
  draft:       { he: 'טיוטה',       cls: 'bg-warning text-white' },
  completed:   { he: 'הושלם',       cls: 'bg-success text-white' },
};

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function getScenarioTitle(assignment) {
  const meta = assignment.convMeta;
  if (!meta) return assignment.conversationId ? assignment.conversationId.slice(0, 16) + '...' : '—';
  const t = meta.scenario && meta.scenario.text;
  if (!t) return '—';
  return t.length > 70 ? t.slice(0, 70) + '...' : t;
}

export default function ConvAnnotationTasks() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    getMyAssignments(currentUser.uid)
      .then(data => { setAssignments(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [currentUser]);

  const notStarted = assignments.filter(a => a.status === 'not_started').length;
  const inDraft    = assignments.filter(a => a.status === 'draft').length;
  const done       = assignments.filter(a => a.status === 'completed').length;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7fc', paddingTop: '80px', paddingBottom: '60px' }}>
      <div className="container" style={{ maxWidth: '900px', direction: 'rtl' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ color: '#6c5ce7', fontWeight: 700 }}>משימות תיוג שיחות</h2>
          {!loading && !error && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
              <span className="badge bg-secondary text-white fs-6">סה"כ: {assignments.length}</span>
              <span className="badge bg-warning text-white fs-6">טרם התחיל: {notStarted}</span>
              <span className="badge bg-info text-white fs-6">טיוטה: {inDraft}</span>
              <span className="badge bg-success text-white fs-6">הושלם: {done}</span>
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status" />
            <p className="mt-3" style={{ color: '#888' }}>טוען משימות...</p>
          </div>
        )}

        {!loading && error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {!loading && !error && assignments.length === 0 && (
          <div className="alert alert-info">
            לא הוקצו לך עדיין משימות תיוג. פנה למנהל המחקר לתיאום.
          </div>
        )}

        {!loading && !error && assignments.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
            <table className="table table-hover mb-0" style={{ direction: 'rtl' }}>
              <thead style={{ background: '#6c5ce7', color: '#fff' }}>
                <tr>
                  <th>#</th>
                  <th>תרחיש</th>
                  <th style={{ textAlign: 'center' }}>סטטוס</th>
                  <th>עדכון אחרון</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a, idx) => {
                  const st = STATUS_LABELS[a.status] || { he: a.status, cls: 'bg-secondary' };
                  const isCompleted = a.status === 'completed';
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, color: '#6c5ce7' }}>{idx + 1}</td>
                      <td style={{ fontSize: '0.88rem', color: '#333', maxWidth: '380px' }}>
                        {getScenarioTitle(a)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${st.cls}`} style={{ fontSize: '0.8rem' }}>{st.he}</span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: '#666' }}>
                        {formatDate(a.updatedAt || a.createdAt)}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          style={{ borderRadius: '20px' }}
                          onClick={() => navigate(`/annotation/conv-tasks/${a.id}`)}
                        >
                          {isCompleted ? 'צפייה' : a.status === 'draft' ? 'המשך תיוג' : 'התחל תיוג'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
