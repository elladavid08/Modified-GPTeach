# PCK-First Agent Architecture

## Overview

This document describes the new two-agent architecture where **PCK analysis happens FIRST**, followed by student simulation that reacts based on the pedagogical quality assessment.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Teacher sends message                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 1: PCK Expert Agent Analysis                   │
│                                                                   │
│  Analyzes:                                                        │
│  • Teacher's message                                              │
│  • Conversation history                                           │
│  • Scenario goals & misconception focus                           │
│  • Target PCK skills                                              │
│  • Optimal response patterns                                      │
│  • Common teacher mistakes                                        │
│                                                                   │
│  Returns structured impact_analysis JSON:                         │
│  {                                                                │
│    pedagogical_quality: "positive" | "neutral" | "problematic",  │
│    addressed_misconception: boolean,                              │
│    misconception_risk: "low" | "medium" | "high",                │
│    demonstrated_skills: [...],                                    │
│    missed_opportunities: [...],                                   │
│    predicted_student_state: {                                     │
│      understanding_level: "improved" | "same" | "confused"...,   │
│      who_should_respond: ["student names"],                       │
│      response_tone: "confident" | "hesitant" | "confused"...,    │
│      likely_reactions: ["reaction 1", "reaction 2"]               │
│    },                                                             │
│    feedback_message_hebrew: "משוב למורה",                        │
│    scenario_alignment: { moving_toward_goals, alignment_score }  │
│  }                                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │  Display PCK     │
                   │  Feedback to     │
                   │  Teacher         │
                   └─────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            STEP 2: Student Simulation Agent                      │
│                                                                   │
│  Receives:                                                        │
│  • Teacher's message                                              │
│  • Conversation history                                           │
│  • Scenario & student personas                                    │
│  • impact_analysis from PCK agent ← KEY INPUT                    │
│                                                                   │
│  Uses impact_analysis to:                                         │
│  • Align student understanding with pedagogical_quality          │
│  • Choose which students respond (who_should_respond)             │
│  • Set appropriate response_tone                                  │
│  • Express misconceptions if misconception_risk is high           │
│  • Show confusion if understanding_level = "more_confused"        │
│  • Show progress if understanding_level = "improved"              │
│                                                                   │
│  Returns: Student responses (JSON)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │  Display Student │
                   │  Responses       │
                   └─────────────────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │  Teacher sees:   │
                   │  • PCK feedback  │
                   │  • Student msgs  │
                   └─────────────────┘
```

## Key Components

### 1. Backend PCK Analysis Endpoint (`server/server.js`)

**Endpoint**: `POST /api/pck-feedback`

**Input**:
```javascript
{
  teacherMessage: string,
  conversationHistory: Array<{role, text, name}>,
  scenario: {
    name, grade_level, lesson_goals, misconception_focus,
    target_pck_skills, optimal_response_pattern, common_teacher_mistakes
  }
}
```

**Output**:
```javascript
{
  success: boolean,
  analysis: {
    pedagogical_quality: "positive" | "neutral" | "problematic",
    addressed_misconception: boolean,
    how_addressed: string (Hebrew),
    misconception_risk: "low" | "medium" | "high",
    demonstrated_skills: [{skill_id, evidence}],
    missed_opportunities: [{skill_id, what_could_have_been_done}],
    predicted_student_state: {
      understanding_level: string,
      likely_reactions: string[],
      who_should_respond: string[],
      response_tone: string
    },
    feedback_message_hebrew: string,
    scenario_alignment: {moving_toward_goals, alignment_score}
  }
}
```

**Implementation**:
- Builds comprehensive prompt with scenario context
- Loads PCK skills from taxonomy
- Formats conversation history
- Requests structured JSON from AI
- Validates and returns parsed analysis

### 2. Frontend Flow (`src/pages/Chat.jsx`)

**Old Flow** (broken):
```javascript
Teacher message → Student responses → PCK feedback (too late)
```

**New Flow** (correct):
```javascript
Teacher message → PCK analysis → Display feedback → Student responses with analysis → Display students
```

**Key Changes**:
- Lines 143-221: Wrapped in async IIFE
- Step 1: Call `getPCKFeedback()` FIRST
- Display PCK feedback immediately
- Step 2: Call `callAI()` with `impact_analysis` parameter
- Students now react based on pedagogical quality

### 3. AI Utilities (`src/utils/ai.js`)

**Updated Function Signatures**:
```javascript
callAI(history, students, scenario, addendum, impact_analysis, onResponse)
callChatModel(model, history, students, scenario, addendum, impact_analysis, onResponse)
callCompletionModel(history, students, scenario, addendum, impact_analysis, onResponse)
makeProsePrompt(students, scenario, addendum, impact_analysis)
```

**Key Change**: Removed `onPCKFeedback` callback and `previousImpactPacket` - no longer needed since PCK analysis is separate

**Prompt Enhancement** (lines 571-628):
- Added large section injecting `impact_analysis` into student agent prompt
- Explains pedagogical quality to students
- Lists demonstrated skills and missed opportunities
- Provides predicted student state with mandatory alignment rules
- Students MUST align responses with PCK analysis

### 4. PCK Taxonomy Backend (`server/pck_taxonomy.js`)

**Updated Skills**:
- Now includes all 4 formal scenarios from education team
- Each skill has: indicators, examples (positive/negative), common_teacher_mistakes
- Added helper functions:
  - `getPCKSkillById(skillId)` - lookup skill details
  - `formatConversationHistory(history)` - format for prompt

### 5. GenAI Service (`src/services/genai.js`)

**Updated `getPCKFeedback()`**:
- Return type changed from `Promise<string>` to `Promise<Object>`
- Now returns full structured analysis object
- Logs key fields for debugging

## Benefits

### 1. Pedagogically Accurate Student Behavior
- Students react authentically to teaching quality
- Good teaching → understanding improves
- Poor teaching → confusion increases
- Missed opportunities → misconceptions persist

### 2. Clear Cause-and-Effect
- Teacher sees their move's impact immediately
- PCK feedback explains what happened
- Student reactions demonstrate the consequences
- Creates powerful learning loop

### 3. Rich, Specific Feedback
- Not just "good" or "bad"
- Identifies specific PCK skills demonstrated/missed
- Predicts student state changes
- Provides actionable guidance

### 4. Scalable and Maintainable
- Clear separation of concerns
- PCK expert focused on pedagogy
- Student agent focused on simulation
- Easy to enhance either independently

## Testing the Architecture

### Test Case 1: Good Teaching Move
**Teacher**: "מעניין! למה את חושבת שריבוע אינו מלבן? בואי נבדוק - מה ההגדרה של מלבן?"

**Expected PCK Analysis**:
- pedagogical_quality: "positive"
- addressed_misconception: true
- demonstrated_skills: ["kcs-square-rectangle-inclusion-7th"]
- predicted_student_state.understanding_level: "improved"

**Expected Student Response**:
- Student shows understanding progress
- Tone is "confident" or "thoughtful"
- Engages with the definition check

### Test Case 2: Problematic Teaching Move
**Teacher**: "ריבוע הוא מלבן, ככה זה במתמטיקה"

**Expected PCK Analysis**:
- pedagogical_quality: "problematic"
- addressed_misconception: false
- missed_opportunities: ["Should have asked about definition"]
- predicted_student_state.understanding_level: "same" or "confused"

**Expected Student Response**:
- Student doesn't progress in understanding
- May express confusion or passively accept
- Misconception not resolved

### Test Case 3: Missed Opportunity
**Teacher**: "זה בסדר לקרוא לו מלבן"

**Expected PCK Analysis**:
- pedagogical_quality: "neutral"
- missed_opportunities: ["Didn't address visual prototype issue"]
- misconception_risk: "medium"

**Expected Student Response**:
- Student may remain confused about "long" requirement
- Understanding stays at similar level
- May ask follow-up question

## Files Modified

1. `server/server.js` - Lines 278-349 (PCK feedback endpoint)
2. `server/pck_taxonomy.js` - Updated skills + helper functions
3. `src/services/genai.js` - Lines 114-165 (getPCKFeedback)
4. `src/pages/Chat.jsx` - Lines 143-221 (reversed flow)
5. `src/utils/ai.js` - Multiple sections:
   - Function signatures (lines 24-51, 53-105, 108-117)
   - Removed PCK feedback extraction (lines 291-295)
   - Added impact_analysis to prompt (lines 571-628)
   - Updated persona usage instructions (lines 611-616)
   - Removed impact_packet generation instructions (lines 619-665)

## Important Notes

### No Backward Compatibility
This is a breaking change. The old architecture no longer works.

### AI Model Requirements
- PCK agent needs good JSON generation capability (Gemini 2.5 Flash works well)
- Student agent must follow complex conditional logic based on impact_analysis
- Both agents need Hebrew language support

### Error Handling
- If PCK analysis fails, system continues with `impact_analysis = null`
- Student agent still generates responses, just without pedagogical guidance
- Frontend displays error but doesn't block conversation

### Future Enhancements
- Add caching for similar teacher moves
- Include teacher history/patterns in PCK analysis
- Generate visualizations of PCK trajectory over conversation
- Support multi-turn PCK analysis (analyzing entire conversation segments)

## Debugging

### Check PCK Analysis
Look for logs:
```
🎯 STEP 1: Analyzing teacher's pedagogical move...
💡 Requesting PCK feedback for teacher message...
✅ PCK analysis received:
   - Quality: positive
   - Addressed misconception: true
   - Predicted understanding: improved
```

### Check Student Agent Receipt
Look for logs:
```
🎯 STEP 2: Generating student responses based on PCK analysis...
```

### Check Prompt Inclusion
Set `IS_PRODUCTION = false` in constants.js to see full prompts

Look for section:
```
🎯🎯🎯 CRITICAL: PCK EXPERT ANALYSIS OF TEACHER'S LAST MOVE 🎯🎯🎯
```

This confirms impact_analysis was included in student agent prompt.

## Conclusion

The PCK-First architecture ensures that student simulation authentically reflects pedagogical quality. By analyzing teaching moves BEFORE generating student responses, we create a realistic classroom dynamic where students react naturally to good or poor instruction. This provides teachers with immediate, actionable feedback and demonstrates the consequences of their pedagogical choices.

