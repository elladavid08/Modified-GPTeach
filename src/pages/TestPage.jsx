import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PRE_TEST, POST_TEST } from "../config/testConfig";
import { submitTest, checkTestSubmitted } from "../services/testService";

// ── helpers ──────────────────────────────────────────────────────────────────

function buildEmptyAnswers(scenarios) {
  const answers = {};
  for (const s of scenarios) {
    answers[s.id] = {
      choice: "",           // "correct" | "incorrect"
      correctExplanation: "",
      q1: "", q2: "", q3: "", q4: "", q5: "",
    };
  }
  return answers;
}

// ── sub-components ───────────────────────────────────────────────────────────

function ClaimBox({ scenario }) {
  const { claim, image, imageAlt } = scenario;

  return (
    <div
      style={{
        background: "#f0ebf8",
        borderRight: "4px solid #6c5ce7",
        borderRadius: "6px",
        padding: "14px 18px",
        marginBottom: "18px",
        direction: "rtl",
      }}
    >
      {claim.type === "single" && (
        <p style={{ margin: 0, fontSize: "1.05rem" }}>
          <strong>{claim.prefix}:</strong>{" "}
          <span style={{ fontStyle: "italic" }}>"{claim.text}"</span>
        </p>
      )}

      {claim.type === "dialog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {claim.exchanges.map((ex, i) => (
            <p key={i} style={{ margin: 0, fontSize: "1.05rem" }}>
              <strong>{ex.student}:</strong>{" "}
              <span style={{ fontStyle: "italic" }}>"{ex.text}"</span>
            </p>
          ))}
        </div>
      )}

      {image && (
        <div style={{ marginTop: "14px", textAlign: "center" }}>
          <img
            src={image}
            alt={imageAlt || "תמונה לתרחיש"}
            style={{ maxWidth: "160px", border: "1px solid #ccc", borderRadius: "6px" }}
          />
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario, index, answer, onChange }) {
  const isCorrect = answer.choice === "correct";
  const isIncorrect = answer.choice === "incorrect";

  function handleChoice(val) {
    onChange(scenario.id, "choice", val);
  }

  function handleField(field, val) {
    onChange(scenario.id, field, val);
  }

  const textareaStyle = {
    width: "100%",
    minHeight: "80px",
    resize: "vertical",
    direction: "rtl",
    padding: "8px",
    borderRadius: "4px",
    border: "1px solid #ced4da",
    fontFamily: "inherit",
    fontSize: "0.95rem",
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #dee2e6",
        borderRadius: "10px",
        padding: "24px",
        marginBottom: "28px",
        direction: "rtl",
      }}
    >
      {/* Scenario header */}
      <h5 style={{ color: "#6c5ce7", marginBottom: "14px", fontWeight: 700 }}>
        תרחיש {index + 1}
      </h5>

      <ClaimBox scenario={scenario} />

      {/* Main question */}
      <p style={{ fontWeight: 600, marginBottom: "14px" }}>{scenario.questionText}</p>

      {/* Option A – correct */}
      <div style={{ marginBottom: "10px" }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
          <input
            type="radio"
            name={`choice-${scenario.id}`}
            value="correct"
            checked={isCorrect}
            onChange={() => handleChoice("correct")}
            style={{ marginTop: "4px", accentColor: "#6c5ce7" }}
          />
          <span style={{ fontWeight: 500 }}>א. הטענה נכונה</span>
        </label>

        {isCorrect && (
          <div style={{ marginTop: "8px", marginRight: "28px" }}>
            <label style={{ display: "block", marginBottom: "4px", color: "#555", fontSize: "0.9rem" }}>
              נימוק:
            </label>
            <textarea
              style={textareaStyle}
              value={answer.correctExplanation}
              onChange={(e) => handleField("correctExplanation", e.target.value)}
              placeholder="הסבר את נימוקך..."
            />
          </div>
        )}
      </div>

      {/* Option B – incorrect */}
      <div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
          <input
            type="radio"
            name={`choice-${scenario.id}`}
            value="incorrect"
            checked={isIncorrect}
            onChange={() => handleChoice("incorrect")}
            style={{ marginTop: "4px", accentColor: "#6c5ce7" }}
          />
          <span style={{ fontWeight: 500 }}>ב. הטענה לא נכונה (שגויה)</span>
        </label>

        {isIncorrect && (
          <div style={{ marginTop: "12px", marginRight: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {scenario.questionsIncorrect.map((q, qi) => (
              <div key={qi}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "0.95rem" }}>
                  {qi + 1}. {q}
                </label>
                <textarea
                  style={textareaStyle}
                  value={answer[`q${qi + 1}`]}
                  onChange={(e) => handleField(`q${qi + 1}`, e.target.value)}
                  placeholder="תשובתך..."
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function TestPage({ testType }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const testConfig = testType === "pre" ? PRE_TEST : POST_TEST;
  const hasScenarios = testConfig.scenarios && testConfig.scenarios.length > 0;

  const [answers, setAnswers] = useState(() =>
    hasScenarios ? buildEmptyAnswers(testConfig.scenarios) : {}
  );
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Check on mount whether this test was already submitted
  useEffect(() => {
    if (!currentUser) return;
    checkTestSubmitted(currentUser.uid, testType).then(({ submitted }) => {
      setAlreadySubmitted(submitted);
      setChecking(false);
    });
  }, [currentUser, testType]);

  function handleChange(scenarioId, field, value) {
    setAnswers((prev) => ({
      ...prev,
      [scenarioId]: { ...prev[scenarioId], [field]: value },
    }));
  }

  function validate() {
    for (const s of testConfig.scenarios) {
      if (!answers[s.id] || !answers[s.id].choice) {
        return `נא לבחור א או ב עבור תרחיש ${testConfig.scenarios.indexOf(s) + 1}`;
      }
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    const validationMsg = validate();
    if (validationMsg) {
      setSubmitError(validationMsg);
      return;
    }

    setSubmitting(true);
    const { error } = await submitTest(currentUser.uid, testType, answers);
    setSubmitting(false);

    if (error === "already_submitted") {
      setAlreadySubmitted(true);
      return;
    }
    if (error) {
      setSubmitError("אירעה שגיאה בשמירת הנתונים. נסה שוב.");
      return;
    }
    setSubmitSuccess(true);
  }

  // ── render ───────────────────────────────────────────────────────────────

  if (checking) {
    return (
      <div className="container mt-5 text-center" dir="rtl">
        <p>טוען...</p>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="container mt-5" dir="rtl" style={{ maxWidth: "680px" }}>
        <div className="alert alert-info" style={{ borderRadius: "10px", fontSize: "1.05rem" }}>
          <strong>כבר מילאת שאלון זה.</strong>
          <br />
          תשובותיך נשמרו במערכת.
        </div>
        <button className="btn btn-outline-secondary" onClick={() => navigate("/")}>
          חזרה לדף הבית
        </button>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="container mt-5" dir="rtl" style={{ maxWidth: "680px" }}>
        <div className="alert alert-success" style={{ borderRadius: "10px", fontSize: "1.05rem" }}>
          <strong>השאלון נשמר בהצלחה!</strong>
          <br />
          תודה על השתתפותך.
        </div>
        <button className="btn btn-outline-secondary" onClick={() => navigate("/")}>
          חזרה לדף הבית
        </button>
      </div>
    );
  }

  if (!hasScenarios) {
    return (
      <div className="container mt-5" dir="rtl" style={{ maxWidth: "680px" }}>
        <div className="alert alert-warning">שאלון זה אינו זמין עדיין.</div>
        <button className="btn btn-outline-secondary" onClick={() => navigate("/")}>
          חזרה לדף הבית
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f7fc",
        paddingTop: "80px",
        paddingBottom: "60px",
      }}
    >
      <div
        className="container"
        style={{ maxWidth: "760px", direction: "rtl" }}
      >
        {/* Header */}
        <div style={{ marginBottom: "32px", textAlign: "center" }}>
          <h2 style={{ color: "#6c5ce7", fontWeight: 700 }}>{testConfig.titleHe}</h2>
          <p style={{ color: "#666", fontSize: "0.95rem", marginTop: "8px" }}>
            לכל תרחיש, קרא את הטענה ובחר האם היא נכונה או שגויה לדעתך. לאחר מכן ענה על השאלות הרלוונטיות.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {testConfig.scenarios.map((scenario, idx) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              index={idx}
              answer={answers[scenario.id]}
              onChange={handleChange}
            />
          ))}

          {submitError && (
            <div className="alert alert-danger" style={{ direction: "rtl", borderRadius: "8px" }}>
              {submitError}
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: "8px" }}>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={submitting}
              style={{
                background: "#6c5ce7",
                borderColor: "#6c5ce7",
                minWidth: "180px",
                borderRadius: "8px",
              }}
            >
              {submitting ? "שומר..." : "שלח שאלון"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
