import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getAllUsersApi, updateUserResearchStatusApi } from '../services/researchService';
import { getAllConversations } from '../services/firestoreService';

function formatDate(val) {
  if (!val) return '—';
  try {
    const d = typeof val === 'string' || typeof val === 'number' ? new Date(val) : val;
    return d.toLocaleDateString('he-IL');
  } catch {
    return '—';
  }
}

export default function ResearchManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [convStats, setConvStats] = useState({}); // { [userId]: { count, lastActivity } }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState({}); // { [userId]: true }

  useEffect(() => {
    if (currentUser) loadData();
  }, [currentUser]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [fetchedUsers, convsResult] = await Promise.all([
        getAllUsersApi(currentUser.uid),
        getAllConversations(500),
      ]);
      setUsers(fetchedUsers);
      if (!convsResult.error) {
        const stats = {};
        (convsResult.conversations || []).forEach((c) => {
          const uid = c.userId;
          if (!uid) return;
          if (!stats[uid]) stats[uid] = { count: 0, lastActivity: null };
          stats[uid].count += 1;
          const rawTs = c.lastUpdated || c.startTime || c.startedAt;
          if (rawTs) {
            const d = rawTs.toDate ? rawTs.toDate() : new Date(rawTs);
            if (!stats[uid].lastActivity || d > stats[uid].lastActivity) {
              stats[uid].lastActivity = d;
            }
          }
        });
        setConvStats(stats);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Next sequential order considers ALL users who ever received an order,
  // even if currently disabled, so labels are never reused.
  const nextOrder = useMemo(() => {
    const orders = users
      .filter((u) => u.researchParticipantOrder != null)
      .map((u) => u.researchParticipantOrder);
    return orders.length > 0 ? Math.max(...orders) + 1 : 1;
  }, [users]);

  const handleToggle = async (user) => {
    const uid = user.id;
    setSaving((prev) => ({ ...prev, [uid]: true }));

    let updates;
    if (!user.showInResearchConversations) {
      // First-time enable: assign a stable label; re-enable: reuse existing label
      const order =
        user.researchParticipantOrder != null ? user.researchParticipantOrder : nextOrder;
      const label =
        user.researchParticipantLabel != null
          ? user.researchParticipantLabel
          : `משתתף ${String(order).padStart(2, '0')}`;
      updates = {
        showInResearchConversations: true,
        researchParticipantOrder: order,
        researchParticipantLabel: label,
      };
    } else {
      // Disable: keep label so it remains stable if re-enabled later
      updates = { showInResearchConversations: false };
    }

    try {
      await updateUserResearchStatusApi(uid, currentUser.uid, updates);
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, ...updates } : u)));
    } catch (err) {
      alert('שגיאה בשמירה: ' + err.message);
    }
    setSaving((prev) => ({ ...prev, [uid]: false }));
  };

  // Enabled participants first (sorted by order), then disabled alphabetically
  const sortedUsers = useMemo(() => {
    const enabled = users
      .filter((u) => u.showInResearchConversations)
      .sort((a, b) => (a.researchParticipantOrder || 0) - (b.researchParticipantOrder || 0));
    const disabled = users
      .filter((u) => !u.showInResearchConversations)
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'he'));
    return [...enabled, ...disabled];
  }, [users]);

  const enabledCount = users.filter((u) => u.showInResearchConversations).length;

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">טוען...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7fc', paddingTop: '80px', paddingBottom: '60px' }}>
      <div className="container" style={{ maxWidth: '1100px', direction: 'rtl' }}>

        {/* Header */}
        <div
          style={{
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h2 style={{ color: '#6c5ce7', fontWeight: 700, marginBottom: '4px' }}>ניהול מחקר</h2>
            <p className="text-muted mb-0">
              בחר אילו משתמשים יוצגו לצוות הצפייה בעמוד "שיחות מחקר".
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className="badge bg-primary fs-6">{enabledCount} משתתפים פעילים</span>
            <button className="btn btn-outline-secondary btn-sm" onClick={loadData}>
              רענן
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {/* Table */}
        <div
          style={{
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #dee2e6',
            overflow: 'hidden',
          }}
        >
          <table className="table table-hover mb-0" style={{ direction: 'rtl' }}>
            <thead style={{ background: '#6c5ce7', color: '#fff' }}>
              <tr>
                <th>שם</th>
                <th>אימייל</th>
                <th>תווית מחקר</th>
                <th style={{ textAlign: 'center' }}>שיחות</th>
                <th>פעילות אחרונה</th>
                <th style={{ textAlign: 'center' }}>הצג לצוות</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => {
                const stats = convStats[user.id] || {};
                const isEnabled = !!user.showInResearchConversations;
                return (
                  <tr key={user.id} style={{ background: isEnabled ? '#f0eeff' : undefined }}>
                    <td style={{ fontWeight: 500 }}>{user.fullName || '—'}</td>
                    <td style={{ fontSize: '0.9rem', color: '#666' }}>{user.email || '—'}</td>
                    <td>
                      {user.researchParticipantLabel ? (
                        <span className="badge" style={{ background: '#6c5ce7' }}>
                          {user.researchParticipantLabel}
                        </span>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                          טרם הוקצה
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge bg-secondary">{stats.count || 0}</span>
                    </td>
                    <td style={{ fontSize: '0.9rem', color: '#555' }}>
                      {stats.lastActivity ? formatDate(stats.lastActivity) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="form-check form-switch d-flex justify-content-center mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          checked={isEnabled}
                          disabled={!!saving[user.id]}
                          onChange={() => handleToggle(user)}
                          style={{
                            cursor: saving[user.id] ? 'wait' : 'pointer',
                            transform: 'scale(1.25)',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sortedUsers.length === 0 && (
            <div className="text-center text-muted p-4">לא נמצאו משתמשים.</div>
          )}
        </div>

        <p className="text-muted mt-3" style={{ fontSize: '0.82rem' }}>
          הפעלת המתג תוסיף את המשתמש לרשימת משתתפי המחקר ותשמור עבורו תווית אנונימית קבועה.
          כיבוי המתג יסיר אותו מהתצוגה אך ישמר את התווית לשימוש עתידי.
        </p>
      </div>
    </div>
  );
}
