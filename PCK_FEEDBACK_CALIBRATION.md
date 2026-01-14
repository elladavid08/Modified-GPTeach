# PCK Real-Time Feedback Calibration Improvements

## Overview
This document describes the enhanced calibration rules implemented for the real-time PCK feedback agent to improve pedagogical assessment accuracy without modifying the core architecture, student personas, scenarios, or summary analysis.

## Changes Made

### 1. Feedback History Tracking
**Files Modified:**
- `src/pages/Chat.jsx`
- `src/services/genai.js`
- `server/server.js`

**Implementation:**
- Added `feedbackHistory` state in Chat component
- Tracks last 5 feedback items with quality, message, and predicted student state
- Passes last 3 items to PCK analysis for context
- Enables persistence rule enforcement

### 2. Right Idea, Soft Execution Detection
**Purpose:** Prevent marking incomplete explanations as fully positive

**Criteria for "neutral" instead of "positive":**
- Teacher says correct things but doesn't use formal definitions
- Teacher points in right direction but doesn't request systematic logical checking
- Teacher gives partial explanation without precise completion

**Examples:**
- ❌ "יש לו את התכונות של מלבן" (correct, but no formal definition)
- ❌ "נראה שזה מתאים" (intuition, not systematic checking)
- ❌ "נכון, יש פה משהו דומה" (right direction, but not precise)

**Criteria for "positive" (requires explicit repair move):**
- ✅ "מה ההגדרה של מלבן?" (returns to formal definition)
- ✅ "בואו נבדוק האם מקיים כל תנאי ההגדרה" (requests systematic checking)
- ✅ "איזה תנאים חייבים להתקיים?" (guides logical discovery)

### 3. Feedback Persistence Rules
**Purpose:** Prevent premature improvement of feedback when problems persist

**Rules:**
- If the same methodological problem repeats without explicit teacher repair, feedback severity MUST NOT improve from "problematic" to "neutral" or "positive"
- Feedback should only soften after explicit pedagogical correction (e.g., returning to formal definition, systematic checking)
- System tracks feedback history to enforce this

**Repair Moves That Allow Feedback Improvement:**
- Explicit return to formal definition
- Request for systematic condition checking
- Guided logical discovery through questions

### 4. Epistemic Abdication Detection
**Purpose:** Reliably detect and penalize language that undermines mathematical precision

**Problematic Patterns (trigger "problematic" feedback):**
- "לא צריך להיתקע על זה" (downplaying precision)
- "זה רק רעיון כללי" (replacing logic with intuition)
- "זה לא כל כך חשוב" (treating correctness as optional)
- "סתם תסמכו עליי" (authority instead of explanation)
- "זה יותר תחושה" (relativism in mathematics)
- "אל תחשבו על זה יותר מדי" (suppressing critical thinking)
- "זה סבבה גם ככה" (treating precision as desirable, not necessary)

**Impact:**
- These are not mere mistakes—they contradict the nature of mathematics
- Must trigger `pedagogical_quality: "problematic"`
- `feedback_message` must address this explicitly
- `missed_opportunities` should include relevant skill

### 5. Student Response Escalation
**Purpose:** Prevent endless confusion loops after repeated poor teaching

**Implementation:**
- After 2+ consecutive `pedagogical_quality: "problematic"` feedbacks
- `predicted_student_state.response_tone` includes "frustrated" or "challenging"
- `likely_reactions` includes expressions like:
  - "אני לא בטוח שהבנתי את מה שאמרת"
  - "זה לא ממש עונה על השאלה שלי"
  - "רגע, איך זה קשור למה ששאלתי?"

**Important:** Does NOT change student selection rules or personas—only increases expression intensity.

### 6. Understanding Level Refinement
**Updated Criteria:**

**"improved"** - Only when teacher performs explicit repair move:
- Returns to formal definition explicitly
- Requests systematic condition checking
- Guides logical discovery through directed questions
- Explanation is age-appropriate, precise, and answers the question

**"same"** - When teacher has right idea but soft execution:
- Says correct things but without formal definitions
- Points in right direction but doesn't request systematic checking
- Gives partial explanation ("right idea, soft execution")
- Continues without directly addressing the question

**"confused" / "more_confused"** - When teaching is problematic:
- Exhibits "epistemic abdication" (see section 4)
- Gives confusing or vague explanation
- Uses age-inappropriate language
- Corrects authoritatively without explanation
- Continues methodological problem from previous turn

## Balancing Principles

### What NOT to Change:
1. **Don't weaken positive feedback when teaching is genuinely strong**
   - If teacher uses formal definitions + systematic checking → must be "improved"
   - Strong teaching deserves strong recognition

2. **Don't assume future repair when evaluating current turn**
   - Evaluate ONLY what happened in this turn
   - Don't give credit for anticipated corrections

3. **Don't prevent loop breaking when teaching is good**
   - If teacher explained well with definitions/systematic checking → must use "improved"
   - Critical for conversation flow

## Expected Behavioral Changes

### Before Calibration:
- "Right direction" responses marked as positive even without precision
- Feedback improved too easily when problems persisted
- Epistemic abdication not consistently detected
- Students stayed confused indefinitely even after repeated poor teaching

### After Calibration:
- Nuanced distinction between "right idea" and "precise execution"
- Feedback stays critical until explicit repair moves
- Mathematical precision violations reliably detected
- Student frustration increases naturally after repeated poor teaching
- Balance maintained: strong teaching still gets strong positive feedback

## Technical Implementation

### Frontend (src/pages/Chat.jsx):
```javascript
const [feedbackHistory, setFeedbackHistory] = useState([]);

// After receiving PCK feedback:
setFeedbackHistory(prev => {
  const newHistory = [...prev, {
    pedagogical_quality: impact_analysis.pedagogical_quality,
    feedback_message_hebrew: impact_analysis.feedback_message_hebrew,
    predicted_student_state: impact_analysis.predicted_student_state
  }];
  return newHistory.slice(-5); // Keep last 5 for performance
});

// When requesting feedback:
impact_analysis = await getPCKFeedback(
  lastTeacherMessage.text,
  history.getMessages(),
  scenario,
  feedbackHistory.slice(-3) // Pass last 3 for context
);
```

### Backend (server/server.js):
```javascript
const { teacherMessage, conversationHistory, scenario, feedbackHistory } = req.body;

// Feedback history included in prompt:
// - Shows last 2-3 feedback items
// - Enables persistence rule checking
// - Triggers escalation after 2+ problematic feedbacks
```

## Testing Recommendations

1. **Test "Right Idea, Soft Execution":**
   - Teacher gives correct but informal explanations
   - Expect "neutral" feedback, not "positive"
   - After formal definition use, expect "positive"

2. **Test Persistence:**
   - Teacher makes same mistake 2-3 turns in a row
   - Feedback should NOT improve
   - After explicit repair, feedback should improve

3. **Test Epistemic Abdication:**
   - Use phrases like "לא צריך להיתקע על זה"
   - Expect consistent "problematic" feedback
   - Check that feedback message addresses this

4. **Test Escalation:**
   - Give 2-3 poor responses in a row
   - Student responses should show frustration
   - Should not repeat endlessly

5. **Test Positive Preservation:**
   - Give genuinely strong teaching (formal definition + systematic checking)
   - Should still get "positive" feedback and "improved" understanding
   - Conversation should progress normally

## Summary

These calibration improvements make the PCK feedback agent more pedagogically accurate and responsive to teaching quality patterns, while maintaining the balance needed for productive conversations and not undermining genuinely strong teaching. The system now better distinguishes between "right direction" and "precise execution," persists in critical feedback when needed, detects mathematical precision violations, and naturally escalates student responses when teaching remains problematic.
