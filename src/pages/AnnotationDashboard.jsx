import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getSubmissions } from "../services/annotationService";

const STATUS_LABELS = {
  pending:   { he: "ממתין להערכה", cls: "bg-warning text-dark" },
  completed: { he: "הוערך",        cls: "bg-success text-white" },
};

const TYPE_LABELS = {
  pre:  { he: "לפני", cls: "bg-primary text-white" },
  post: { he: "אחרי", cls: "bg-info text-dark" },
};

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
  // isAdminView prop lets the route explicitly control which view to render,
  // so an admin accessing /admin/annotate sees the annotator view instead of the admin view.
  const isAdmin = isAdminView !== undefined ? isAdminView : !!(userProfile && userProfile.isAdmin);

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [filterType, setFilterType]   = useState("all");   // all | pre | post
  const [filterStatus, setFilterStatus] = useState("all"); // all | pending | completed

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

  const pending   = submissions.filter(s => s.annotationStatus === "pending").length;
  const completed = submissions.filter(s => s.annotationStatus === "completed").length;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7fc", paddingTop: "80px", paddingBottom: "60px" }}>
      <div className="container" style={{ maxWidth: "1000px", direction: "rtl" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h2 style={{ color: "#6c5ce7", fontWeight: 700 }}>לוח בקרה – הערכת שאלונים</h2>
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
            <span className="badge bg-secondary fs-6">סה"כ: {submissions.length}</span>
            <span className="badge bg-warning text-dark fs-6">ממתינים: {pending}</span>
            <span className="badge bg-success fs-6">הוערכו: {completed}</span>
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
                {v === "all" ? "הכל" : v === "pre" ? "לפני" : "אחרי"}
              </button>
            ))}
          </div>
          <div>
            <label style={{ fontWeight: 600, marginLeft: "8px" }}>סטטוס:</label>
            {["all", "pending", "completed"].map(v => (
              <button
                key={v}
                onClick={() => setFilterStatus(v)}
                className={`btn btn-sm ms-1 ${filterStatus === v ? "btn-primary" : "btn-outline-secondary"}`}
                style={{ borderRadius: "20px" }}
              >
                {v === "all" ? "הכל" : STATUS_LABELS[v].he}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading && <p style={{ textAlign: "center", color: "#888" }}>טוען...</p>}
        {error   && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && submissions.length === 0 && (
          <div className="alert alert-info">לא נמצאו שאלונים עם הסינון הנוכחי.</div>
        )}

        {!loading && !error && submissions.length > 0 && (
          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #dee2e6", overflow: "hidden" }}>
            <table className="table table-hover mb-0" style={{ direction: "rtl" }}>
              <thead style={{ background: "#6c5ce7", color: "#fff" }}>
                <tr>
                  {isAdmin ? (
                    <>
                      <th>מורה</th>
                      <th>אימייל</th>
                      <th>שאלון</th>
                      <th>תאריך הגשה</th>
                      <th>סטטוס</th>
                      <th style={{ textAlign: "center" }}>מעריכים</th>
                    </>
                  ) : (
                    <>
                      <th>#</th>
                      <th>שאלון</th>
                      <th>סטטוס</th>
                    </>
                  )}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, idx) => (
                  <tr key={s.id}>
                    {isAdmin ? (
                      <>
                        <td style={{ fontWeight: 500 }}>{s.teacherName || "—"}</td>
                        <td style={{ color: "#666", fontSize: "0.9rem" }}>{s.teacherEmail || "—"}</td>
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
                        <td style={{ fontWeight: 600, color: "#6c5ce7" }}>{idx + 1}</td>
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
                            {s.annotatedByMe ? "הערכת" : "טרם הוערך"}
                          </span>
                        </td>
                      </>
                    )}
                    <td>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        style={{ borderRadius: "20px" }}
                        onClick={() => navigate(`/admin/annotate/${s.id}`)}
                      >
                        {isAdmin ? "צפה בהערכה" : s.annotatedByMe ? "ערוך הערכה" : "הערך"}
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
