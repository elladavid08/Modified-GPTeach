import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PRE_TEST, POST_TEST, PCK_SKILLS } from "../config/testConfig";
import { getSubmission, getAnnotation, getAllAnnotations, saveAnnotation } from "../services/annotationService";

// ── constants ──────────────────────────────────────────────────────────────

const SCENARIO_IDS = ["scenario1", "scenario2", "scenario3"];

function buildEmptyScores() {
  const scores = {};
  for (const sid of SCENARIO_IDS) {
    scores[sid] = {};
    for (const skill of PCK_SKILLS) {
      scores[sid][skill.id] = { score: null, explanation: "" };
    }
  }
  return scores;
}

// ── Score selector ─────────────────────────────────────────────────────────

function ScoreButtons({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      {[0, 1, 2].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            width: "38px", height: "38px", borderRadius: "50%",
            border: `2px solid ${value === n ? scoreColor(n) : "#ced4da"}`,
            background: value === n ? scoreColor(n) : "#fff",
            color: value === n ? "#fff" : "#555",
            fontWeight: 700, fontSize: "1rem", cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function scoreColor(n) {
  if (n === 0) return "#e17055";
  if (n === 1) return "#fdcb6e";
  return "#00b894";
}

// ── Live summary matrix ────────────────────────────────────────────────────

function SummaryMatrix({ scores }) {
  const cellStyle = (val) => ({
    textAlign: "center", padding: "6px 10px", fontWeight: 700,
    background: val === null ? "#f0f0f0" : val === 0 ? "#ffeaa7" : val === 1 ? "#81ecec" : "#55efc4",
    color: "#2d3436", borderRadius: "4px", minWidth: "36px",
  });

  return (
    <div style={{
      background: "#fff", border: "1px solid #dee2e6", borderRadius: "10px",
      padding: "16px 20px", marginBottom: "28px", direction: "rtl",
    }}>
      <p style={{ fontWeight: 700, marginBottom: "10px", color: "#6c5ce7" }}>
        מטריצת ציונים – עדכון בזמן אמת
      </p>
      <table style={{ borderCollapse: "separate", borderSpacing: "4px", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "right", paddingLeft: "12px", color: "#555", fontWeight: 600 }}></th>
            {PCK_SKILLS.map(skill => (
              <th key={skill.id} style={{ textAlign: "center", color: "#555", fontWeight: 600, fontSize: "0.85rem", minWidth: "80px" }}>
                {skill.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCENARIO_IDS.map((sid, idx) => (
            <tr key={sid}>
              <td style={{ paddingLeft: "12px", color: "#555", fontWeight: 600, whiteSpace: "nowrap" }}>
                תרחיש {idx + 1}
              </td>
              {PCK_SKILLS.map(skill => {
                const val = scores[sid] && scores[sid][skill.id] ? scores[sid][skill.id].score : null;
                return (
                  <td key={skill.id} style={cellStyle(val)}>
                    {val === null ? "—" : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "0.8rem", color: "#999", marginTop: "8px", marginBottom: 0 }}>
        0 = חסר &nbsp;|&nbsp; 1 = חלקי &nbsp;|&nbsp; 2 = מלא
      </p>
    </div>
  );
}

// ── Claim display (reused from test config) ────────────────────────────────

function ClaimBox({ scenario }) {
  if (!scenario) return null;
  const { claim, image, imageAlt } = scenario;

  return (
    <div style={{
      background: "#f0ebf8", borderRight: "4px solid #6c5ce7",
      borderRadius: "6px", padding: "12px 16px", marginBottom: "12px",
    }}>
      {claim.type === "single" && (
        <p style={{ margin: 0 }}>
          <strong>{claim.prefix}:</strong>{" "}
          <span style={{ fontStyle: "italic" }}>"{claim.text}"</span>
        </p>
      )}
      {claim.type === "dialog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {claim.exchanges.map((ex, i) => (
            <p key={i} style={{ margin: 0 }}>
              <strong>{ex.student}:</strong>{" "}
              <span style={{ fontStyle: "italic" }}>"{ex.text}"</span>
            </p>
          ))}
        </div>
      )}
      {image && (
        <div style={{ marginTop: "10px", textAlign: "center" }}>
          <img src={image} alt={imageAlt || ""} style={{ maxWidth: "140px", borderRadius: "6px", border: "1px solid #ccc" }} />
        </div>
      )}
    </div>
  );
}

// ── Skill row ──────────────────────────────────────────────────────────────

function SkillRow({ skill, questionText, teacherAnswer, cellScore, onScoreChange, onExplanationChange, readOnly }) {
  const answerStyle = {
    background: "#f8f9fa", border: "1px solid #e9ecef", borderRadius: "6px",
    padding: "10px 14px", marginBottom: readOnly ? 0 : "10px", fontSize: "0.9rem", color: "#2d3436",
    direction: "rtl", minHeight: "40px",
  };

  return (
    <div style={{ borderBottom: "1px solid #f0f0f0", paddingBottom: "16px", marginBottom: "16px" }}>
      {/* Skill label + question */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
        <span style={{
          background: "#6c5ce7", color: "#fff", borderRadius: "4px",
          padding: "2px 8px", fontSize: "0.8rem", fontWeight: 700, whiteSpace: "nowrap",
        }}>
          {skill.id.toUpperCase()} – {skill.label}
        </span>
        <span style={{ color: "#666", fontSize: "0.85rem" }}>{questionText}</span>
      </div>

      {/* Teacher's answer */}
      <div style={answerStyle}>
        {teacherAnswer || <em style={{ color: "#aaa" }}>לא ענה / לא רלוונטי</em>}
      </div>

      {/* Score + explanation (hidden for admin/read-only) */}
      {!readOnly && (
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap", marginTop: "10px" }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "4px" }}>ציון:</div>
            <ScoreButtons value={cellScore.score} onChange={onScoreChange} />
          </div>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "4px" }}>נימוק הציון:</div>
            <textarea
              style={{
                width: "100%", minHeight: "64px", resize: "vertical", direction: "rtl",
                padding: "8px", borderRadius: "4px", border: "1px solid #ced4da",
                fontFamily: "inherit", fontSize: "0.9rem",
              }}
              value={cellScore.explanation}
              onChange={e => onExplanationChange(e.target.value)}
              placeholder="הסבר קצר לציון שנתת..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scenario panel ─────────────────────────────────────────────────────────

function ScenarioPanel({ index, scenarioConfig, scenarioAnswer, scenarioScores, onScoreChange, onExplanationChange, readOnly }) {
  const chosenCorrect = scenarioAnswer && scenarioAnswer.choice === "correct";

  return (
    <div style={{
      background: "#fff", border: "1px solid #dee2e6", borderRadius: "10px",
      padding: "22px 24px", marginBottom: "28px", direction: "rtl",
    }}>
      <h5 style={{ color: "#6c5ce7", fontWeight: 700, marginBottom: "14px" }}>
        תרחיש {index + 1}
      </h5>

      {scenarioConfig && <ClaimBox scenario={scenarioConfig} />}

      {/* Teacher's main choice */}
      <div style={{
        background: chosenCorrect ? "#fff0f0" : "#f0fff4",
        border: `1px solid ${chosenCorrect ? "#fab1a0" : "#00b894"}`,
        borderRadius: "6px", padding: "8px 14px", marginBottom: "16px", fontSize: "0.9rem",
      }}>
        <strong>בחירת המורה: </strong>
        {chosenCorrect
          ? <>א. הטענה נכונה — <span>{scenarioAnswer.correctExplanation || <em>ללא נימוק</em>}</span></>
          : "ב. הטענה לא נכונה (שגויה)"}
      </div>

      {/* One row per PCK skill */}
      {PCK_SKILLS.map((skill, si) => {
        const questionText = scenarioConfig
          ? scenarioConfig.questionsIncorrect[si]
          : "";
        const teacherAnswer = chosenCorrect
          ? null
          : scenarioAnswer && scenarioAnswer[skill.questionKey];
        const cellScore = scenarioScores[skill.id];

        return (
          <SkillRow
            key={skill.id}
            skill={skill}
            questionText={questionText}
            teacherAnswer={teacherAnswer}
            cellScore={cellScore}
            onScoreChange={val => onScoreChange(skill.id, val)}
            onExplanationChange={val => onExplanationChange(skill.id, val)}
            readOnly={readOnly}
          />
        );
      })}
    </div>
  );
}

// ── Admin: single annotator matrix (clickable cells) ──────────────────────

function AnnotatorMatrix({ annotation }) {
  // selectedCell: { sid, skillId } | null
  const [selectedCell, setSelectedCell] = useState(null);

  function handleCellClick(sid, skillId) {
    if (selectedCell && selectedCell.sid === sid && selectedCell.skillId === skillId) {
      setSelectedCell(null); // toggle off
    } else {
      setSelectedCell({ sid, skillId });
    }
  }

  const selectedExplanation = selectedCell
    ? (annotation.scores &&
       annotation.scores[selectedCell.sid] &&
       annotation.scores[selectedCell.sid][selectedCell.skillId] &&
       annotation.scores[selectedCell.sid][selectedCell.skillId].explanation) || ""
    : "";

  const selectedScore = selectedCell
    ? (annotation.scores &&
       annotation.scores[selectedCell.sid] &&
       annotation.scores[selectedCell.sid][selectedCell.skillId] &&
       annotation.scores[selectedCell.sid][selectedCell.skillId].score)
    : null;

  const selectedSkillLabel = selectedCell
    ? (PCK_SKILLS.find(s => s.id === selectedCell.skillId) || {}).label || ""
    : "";
  const selectedScenarioIdx = selectedCell
    ? SCENARIO_IDS.indexOf(selectedCell.sid) + 1
    : null;

  return (
    <div style={{ marginBottom: "28px" }}>
      {/* Matrix */}
      <table style={{ borderCollapse: "separate", borderSpacing: "4px", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "right", paddingLeft: "12px", color: "#555", fontWeight: 600, minWidth: "80px" }}></th>
            {PCK_SKILLS.map(skill => (
              <th key={skill.id} style={{ textAlign: "center", color: "#555", fontWeight: 600, fontSize: "0.85rem", minWidth: "80px" }}>
                {skill.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCENARIO_IDS.map((sid, idx) => (
            <tr key={sid}>
              <td style={{ paddingLeft: "12px", color: "#555", fontWeight: 600, whiteSpace: "nowrap", fontSize: "0.9rem" }}>
                תרחיש {idx + 1}
              </td>
              {PCK_SKILLS.map(skill => {
                const cell  = annotation.scores && annotation.scores[sid] && annotation.scores[sid][skill.id];
                const score = cell ? cell.score : null;
                const isSelected = selectedCell && selectedCell.sid === sid && selectedCell.skillId === skill.id;
                const hasExplanation = cell && cell.explanation;

                return (
                  <td
                    key={skill.id}
                    onClick={() => handleCellClick(sid, skill.id)}
                    title={hasExplanation ? "לחץ לנימוק" : ""}
                    style={{
                      textAlign: "center", padding: "8px 6px", fontWeight: 700,
                      borderRadius: "6px", cursor: hasExplanation ? "pointer" : "default",
                      background: isSelected
                        ? "#6c5ce7"
                        : score === null ? "#f0f0f0"
                        : score === 0    ? "#ffeaa7"
                        : score === 1    ? "#81ecec"
                        :                  "#55efc4",
                      color: isSelected ? "#fff" : "#2d3436",
                      outline: isSelected ? "2px solid #4a00e0" : "none",
                      transition: "all 0.15s",
                      position: "relative",
                    }}
                  >
                    {score === null ? "—" : score}
                    {/* dot indicator when explanation exists */}
                    {hasExplanation && !isSelected && (
                      <span style={{
                        position: "absolute", top: "4px", left: "4px",
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: "#6c5ce7", display: "block",
                      }} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Explanation panel — shown when a cell is selected */}
      {selectedCell && (
        <div style={{
          marginTop: "10px", background: "#f0ebf8",
          borderRight: "4px solid #6c5ce7", borderRadius: "6px",
          padding: "12px 16px", direction: "rtl",
        }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.85rem", color: "#6c5ce7" }}>
            תרחיש {selectedScenarioIdx} · {selectedSkillLabel} · ציון: {selectedScore === null ? "—" : selectedScore}
          </p>
          {selectedExplanation
            ? <p style={{ margin: 0, fontSize: "0.9rem", color: "#2d3436" }}>{selectedExplanation}</p>
            : <p style={{ margin: 0, fontSize: "0.9rem", color: "#aaa", fontStyle: "italic" }}>לא נכתב נימוק לציון זה.</p>
          }
        </div>
      )}

      <p style={{ fontSize: "0.78rem", color: "#aaa", marginTop: "8px", marginBottom: 0 }}>
        0 = חסר &nbsp;|&nbsp; 1 = חלקי &nbsp;|&nbsp; 2 = מלא &nbsp;|&nbsp;
        <span style={{ color: "#6c5ce7" }}>●</span> = יש נימוק — לחץ לצפייה
      </p>
    </div>
  );
}

// ── Admin comparison panel ─────────────────────────────────────────────────

function ComparisonPanel({ allAnnotations }) {
  if (!allAnnotations || allAnnotations.length === 0) {
    return (
      <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: "10px", padding: "16px 20px", marginBottom: "28px", direction: "rtl" }}>
        <p style={{ margin: 0, color: "#888" }}>עדיין אין הערכות שמורות לשאלון זה.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "2px solid #6c5ce7", borderRadius: "10px", padding: "20px 24px", marginBottom: "28px", direction: "rtl" }}>
      <h5 style={{ color: "#6c5ce7", fontWeight: 700, marginBottom: "20px" }}>
        הערכות מעריכים ({allAnnotations.length})
      </h5>

      {allAnnotations.map((ann, idx) => (
        <div key={ann.id}>
          {/* Annotator label */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            marginBottom: "12px", paddingBottom: "8px",
            borderBottom: "1px solid #f0f0f0",
          }}>
            <span style={{
              background: "#6c5ce7", color: "#fff", borderRadius: "50%",
              width: "28px", height: "28px", lineHeight: "28px",
              textAlign: "center", fontWeight: 700, fontSize: "0.85rem",
              flexShrink: 0,
            }}>
              {idx + 1}
            </span>
            <span style={{ fontWeight: 600, color: "#2d3436" }}>{ann.annotatorName}</span>
          </div>

          <AnnotatorMatrix annotation={ann} />

          {idx < allAnnotations.length - 1 && (
            <hr style={{ borderColor: "#dee2e6", margin: "8px 0 24px" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AnnotationView() {
  const { submissionId } = useParams();
  const { currentUser, userProfile } = useAuth();
  const navigate                     = useNavigate();
  const isAdmin = userProfile && userProfile.isAdmin;

  const [submission, setSubmission]       = useState(null);
  const [scores, setScores]               = useState(buildEmptyScores);
  const [allAnnotations, setAllAnnotations] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState("");
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState("");
  const [saveSuccess, setSaveSuccess]     = useState(false);

  // Load submission + own annotation + (admin only) all annotations
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);

    const fetches = [
      getSubmission(submissionId, currentUser.uid),
      getAnnotation(submissionId, currentUser.uid),
    ];
    if (isAdmin) {
      fetches.push(getAllAnnotations(submissionId, currentUser.uid));
    }

    Promise.all(fetches)
      .then(([sub, ann, allAnns]) => {
        setSubmission(sub);
        if (ann && ann.scores) {
          setScores(prev => {
            const merged = { ...prev };
            for (const sid of SCENARIO_IDS) {
              if (ann.scores[sid]) {
                merged[sid] = { ...prev[sid] };
                for (const skill of PCK_SKILLS) {
                  if (ann.scores[sid][skill.id]) {
                    merged[sid][skill.id] = ann.scores[sid][skill.id];
                  }
                }
              }
            }
            return merged;
          });
        }
        if (allAnns) setAllAnnotations(allAnns);
        setLoading(false);
      })
      .catch(err => {
        setFetchError(err.message);
        setLoading(false);
      });
  }, [submissionId, currentUser, isAdmin]);

  const handleScoreChange = useCallback((scenarioId, skillId, value) => {
    setScores(prev => ({
      ...prev,
      [scenarioId]: {
        ...prev[scenarioId],
        [skillId]: { ...prev[scenarioId][skillId], score: value },
      },
    }));
  }, []);

  const handleExplanationChange = useCallback((scenarioId, skillId, value) => {
    setScores(prev => ({
      ...prev,
      [scenarioId]: {
        ...prev[scenarioId],
        [skillId]: { ...prev[scenarioId][skillId], explanation: value },
      },
    }));
  }, []);

  function countMissingScores() {
    let missing = 0;
    for (const sid of SCENARIO_IDS) {
      for (const skill of PCK_SKILLS) {
        if (scores[sid][skill.id].score === null) missing++;
      }
    }
    return missing;
  }

  async function handleSave() {
    setSaveError("");
    setSaveSuccess(false);
    const missing = countMissingScores();
    if (missing > 0) {
      const ok = window.confirm(`יש ${missing} תאים ללא ציון. האם לשמור בכל זאת?`);
      if (!ok) return;
    }
    setSaving(true);
    try {
      await saveAnnotation({
        submissionId,
        userId: submission.userId,
        testType: submission.testType,
        annotatorId: currentUser.uid,
        scores,
      });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container mt-5 text-center" dir="rtl">
        <div className="spinner-border text-primary" />
        <p className="mt-3">טוען...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="container mt-5" dir="rtl">
        <div className="alert alert-danger">{fetchError}</div>
        <button className="btn btn-outline-secondary" onClick={() => navigate("/admin/annotate")}>
          חזרה ללוח הבקרה
        </button>
      </div>
    );
  }

  if (!submission) return null;

  const testConfig = submission.testType === "pre" ? PRE_TEST : POST_TEST;
  const testLabel  = submission.testType === "pre"  ? "לפני הסימולציה" : "אחרי הסימולציה";
  const missing    = countMissingScores();

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7fc", paddingTop: "80px", paddingBottom: "80px" }}>
      <div className="container" style={{ maxWidth: "860px", direction: "rtl" }}>

        {/* Header */}
        <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ marginBottom: "10px" }}
              onClick={() => navigate("/admin/annotate")}
            >
              ← חזרה ללוח הבקרה
            </button>
            <h3 style={{ color: "#6c5ce7", fontWeight: 700, marginBottom: "4px" }}>
              {isAdmin ? "צפייה בהערכות שאלון" : "הערכת שאלון"} – {testLabel}
            </h3>
            {/* Admin sees teacher info; annotators see nothing identifying */}
            {isAdmin && (
              <p style={{ color: "#555", marginBottom: 0, fontSize: "0.95rem" }}>
                {submission.teacherName || "מורה לא ידוע"} &nbsp;|&nbsp; {submission.teacherEmail || ""}
              </p>
            )}
          </div>
          {!isAdmin && saveSuccess && (
            <div className="alert alert-success py-2 px-3 mb-0" style={{ borderRadius: "8px" }}>
              ✓ ההערכה נשמרה בהצלחה
            </div>
          )}
        </div>

        {/* Live matrix — shown only to annotators (their own in-progress scores) */}
        {!isAdmin && <SummaryMatrix scores={scores} />}

        {/* Admin-only: all annotators' comparison */}
        {isAdmin && (
          <ComparisonPanel allAnnotations={allAnnotations} />
        )}

        {/* Scenario panels — always shown; read-only for admin */}
        {SCENARIO_IDS.map((sid, idx) => {
          const scenarioConfig = testConfig.scenarios && testConfig.scenarios[idx];
          const scenarioAnswer = submission.answers && submission.answers[sid];
          return (
            <ScenarioPanel
              key={sid}
              index={idx}
              scenarioConfig={scenarioConfig}
              scenarioAnswer={scenarioAnswer}
              scenarioScores={scores[sid]}
              onScoreChange={(skillId, val) => handleScoreChange(sid, skillId, val)}
              onExplanationChange={(skillId, val) => handleExplanationChange(sid, skillId, val)}
              readOnly={isAdmin}
            />
          );
        })}

        {/* Save bar — annotators only */}
        {!isAdmin && (
          <div style={{
            position: "sticky", bottom: "16px", background: "#fff",
            border: "1px solid #dee2e6", borderRadius: "10px",
            padding: "14px 20px", display: "flex",
            justifyContent: "space-between", alignItems: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)", flexWrap: "wrap", gap: "10px",
          }}>
            {missing > 0 ? (
              <span style={{ color: "#e17055", fontSize: "0.9rem" }}>
                {missing} תאים עוד ללא ציון
              </span>
            ) : (
              <span style={{ color: "#00b894", fontSize: "0.9rem", fontWeight: 600 }}>
                כל הציונים מלאים ✓
              </span>
            )}
            {saveError && <span style={{ color: "#d63031", fontSize: "0.9rem" }}>{saveError}</span>}
            <button
              className="btn btn-primary btn-lg"
              style={{ background: "#6c5ce7", borderColor: "#6c5ce7", borderRadius: "8px", minWidth: "140px" }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "שומר..." : "שמור הערכה"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
