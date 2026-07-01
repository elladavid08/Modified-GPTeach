import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getSubmissions } from "../services/annotationService";

const STATUS_LABELS = {
  pending:     { he: "ממתין להערכה", cls: "bg-warning text-dark" },
  in_progress: { he: "בתהליך",       cls: "bg-warning text-dark" },
  completed:   { he: "הוערך",        cls: "bg-success text-white" },
};

const TYPE_LABELS = {
  pre:  { he: "שאלון פתיחה", cls: "bg-primary text-white" },
  post: { he: "שאלון סיום",  cls: "bg-info text-white" },
};

// pre sorts before post
const TYPE_ORDER = { pre: 0, post: 1 };

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AnnotationDashboard({ isAdminView }) {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminView !== undefined ? isAdminView : !!(userProfile && userProfile.isAdmin);

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [filterType, setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    const filters = {};
    if (filterType !== "all")   filters.testType = filterType;
    if (filterStatus !== "all") filters.status   = filterStatus;

    getSubmissions(currentUser.uid, filters)
      .then(data => { setSubmissions(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, [currentUser, filterType, filterStatus]);

  // Annotator view: only research participants; sorted by label then pre→post
  const visibleSubmissions = React.useMemo(() => {
    const base = isAdmin
      ? submissions
      : submissions.filter(s => s.showInResearchConversations);

    if (isAdmin) return base;

    return [...base].sort((a, b) => {
      const labelCmp = (a.researchParticipantLabel || "").localeCompare(
        b.researchParticipantLabel || "", "he"
      );
      if (labelCmp !== 0) return labelCmp;
      return (TYPE_ORDER[a.testType] || 0) - (TYPE_ORDER[b.testType] || 0);
    });
  }, [submissions, isAdmin]);

  const pending   = visibleSubmissions.filter(s => !s.annotatedByMe).length;
  const completed = visibleSubmissions.filter(s =>  s.annotatedByMe).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7fc", paddingTop: "80px", paddingBottom: "60px" }}>
      <div className="container" style={{ maxWidth: "1000px", direction: "rtl" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h2 style={{ color: "#6c5ce7", fontWeight: 700 }}>
            {isAdmin ? "לוח בקרה – שאלונים" : "הערכת שאלונים"}
          </h2>
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
            <span className="badge bg-secondary text-white fs-6">סה"כ: {visibleSubmissions.length}</span>
            {!isAdmin && (
              <>
                <span className="badge bg-warning text-white fs-6">ממתינים להערכה: {pending}</span>
                <span className="badge bg-success text-white fs-6">הוערכו: {completed}</span>
              </>
            )}
            {isAdmin && (
              <>
                <span className="badge bg-warning text-white fs-6">
                  ממתינים: {visibleSubmissions.filter(s => s.annotationStatus === "pending").length}
                </span>
                <span className="badge bg-success text-white fs-6">
                  הוערכו: {visibleSubmissions.filter(s => s.annotationStatus === "completed").length}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            background: "#fff", borderRadius: "10px", padding: "16px 20px",
            marginBottom: "20px", display: "flex", gap: "24px", flexWrap: "wrap",
            border: "1px solid #dee2e6",
          }}
        >
          <div>
            <label style={{ fontWeight: 600, marginLeft: "8px" }}>סוג שאלון:</label>
            {["all", "pre", "post"].map(v => (
              <button
                key={v}
                onClick={() => setFilterType(v)}
                className={`btn btn-sm ms-1 ${filterType === v ? "btn-primary" : "btn-outline-secondary"}`}
                style={{ borderRadius: "20px" }}
              >
                {v === "all" ? "הכל" : TYPE_LABELS[v].he}
              </button>
            ))}
          </div>
          {isAdmin && (
            <div>
              <label style={{ fontWeight: 600, marginLeft: "8px" }}>סטטוס:</label>
              {["all", "pending", "completed"].map(v => (
                <button
                  key={v}
                  onClick={() => setFilterStatus(v)}
                  className={`btn btn-sm ms-1 ${filterStatus === v ? "btn-primary" : "btn-outline-secondary"}`}
                  style={{ borderRadius: "20px" }}
                >
                  {v === "all" ? "הכל" : STATUS_LABELS[v] ? STATUS_LABELS[v].he : v}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {loading && <p style={{ textAlign: "center", color: "#888" }}>טוען...</p>}
        {error   && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && visibleSubmissions.length === 0 && (
          <div className="alert alert-info">לא נמצאו שאלונים.</div>
        )}

        {!loading && !error && visibleSubmissions.length > 0 && (
          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #dee2e6", overflow: "hidden" }}>
            <table className="table table-hover mb-0" style={{ direction: "rtl" }}>
              <thead style={{ background: "#6c5ce7", color: "#fff" }}>
                <tr>
                  {isAdmin ? (
                    <>
                      <th>שם מורה</th>
                      <th>משתתף מחקר</th>
                      <th>שאלון</th>
                      <th>תאריך הגשה</th>
                      <th>סטטוס</th>
                      <th style={{ textAlign: "center" }}>מעריכים</th>
                    </>
                  ) : (
                    <>
                      <th>משתתף מחקר</th>
                      <th>שאלון</th>
                      <th>סטטוס הערכה</th>
                    </>
                  )}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleSubmissions.map((s) => (
                  <tr key={s.id}>
                    {isAdmin ? (
                      <>
                        <td style={{ fontWeight: 500 }}>{s.teacherName || "—"}</td>
                        <td>
                          {s.researchParticipantLabel
                            ? (
                              <span
                                className="badge"
                                style={{ background: "#6c5ce7", color: "#fff", fontSize: "0.82rem" }}
                              >
                                {s.researchParticipantLabel}
                              </span>
                            )
                            : <span style={{ color: "#aaa", fontSize: "0.85rem" }}>—</span>}
                        </td>
                        <td>
                          <span
                            className={`badge ${TYPE_LABELS[s.testType] ? TYPE_LABELS[s.testType].cls : "bg-secondary"}`}
                            style={{ fontSize: "0.85rem" }}
                          >
                            {TYPE_LABELS[s.testType] ? TYPE_LABELS[s.testType].he : s.testType}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.9rem" }}>{formatDate(s.submittedAt)}</td>
                        <td>
                          <span
                            className={`badge ${STATUS_LABELS[s.annotationStatus] ? STATUS_LABELS[s.annotationStatus].cls : "bg-secondary"}`}
                            style={{ fontSize: "0.85rem" }}
                          >
                            {STATUS_LABELS[s.annotationStatus] ? STATUS_LABELS[s.annotationStatus].he : s.annotationStatus}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className={`badge ${s.annotationCount >= 2 ? "bg-success" : s.annotationCount === 1 ? "bg-warning text-dark" : "bg-secondary"}`}
                            style={{ fontSize: "0.85rem", minWidth: "28px", display: "inline-block" }}
                            title={`${s.annotationCount || 0} מעריכים הגישו הערכה`}
                          >
                            {s.annotationCount || 0}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          {s.researchParticipantLabel
                            ? (
                              <span
                                className="badge fs-6"
                                style={{ background: "#6c5ce7", color: "#fff" }}
                              >
                                {s.researchParticipantLabel}
                              </span>
                            )
                            : <span style={{ color: "#aaa" }}>—</span>}
                        </td>
                        <td>
                          <span
                            className={`badge ${TYPE_LABELS[s.testType] ? TYPE_LABELS[s.testType].cls : "bg-secondary"}`}
                            style={{ fontSize: "0.85rem" }}
                          >
                            {TYPE_LABELS[s.testType] ? TYPE_LABELS[s.testType].he : s.testType}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${s.annotatedByMe ? "bg-success text-white" : "bg-warning text-dark"}`}
                            style={{ fontSize: "0.85rem" }}
                          >
                            {s.annotatedByMe ? "הוערך" : "ממתין להערכה"}
                          </span>
                        </td>
                      </>
                    )}
                    <td>
                      <button
                        className={`btn btn-sm ${s.annotatedByMe ? "btn-outline-success" : "btn-outline-primary"}`}
                        style={{ borderRadius: "20px" }}
                        onClick={() => navigate(`/admin/annotate/${s.id}`)}
                      >
                        {isAdmin ? "צפה בהערכה" : s.annotatedByMe ? "צפייה" : "הערך"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
