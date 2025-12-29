# Flexible Conversation Initiation Guide

## Overview
The system now supports **flexible conversation initiation** where each scenario can specify whether the **teacher** or the **students** should start the tutoring session. This creates pedagogical variety and allows for different teaching approaches.

## Feature Summary

### What's New
- ✅ Scenarios can specify who initiates the conversation
- ✅ Two initiation modes: `"students"` or `"teacher"`
- ✅ Visual prompt shown to teacher when they should start
- ✅ Context-specific guidance for each scenario
- ✅ AI adapts its behavior based on who initiated

## Scenario Configuration

### Required Fields

Each scenario in `src/config/scenarios/geometry_scenarios.js` now includes:

```javascript
{
  text: "השיעור של השבוע הוא על...",  // Topic description
  keywords: [...],                        // Topic keywords
  initiated_by: "students",              // NEW: "students" or "teacher"
  initial_prompt: "הסבר או הקשר..."      // NEW: Guidance text
}
```

### Field Descriptions

#### `initiated_by` (Required)
Specifies who starts the conversation:
- **`"students"`**: Students arrive with questions/problems (they speak first)
- **`"teacher"`**: Teacher introduces the topic/problem (teacher speaks first)

#### `initial_prompt` (Recommended)
Provides context-specific guidance:
- **For students**: Describes the situation/problem they arrive with
- **For teacher**: Suggests how to introduce the topic

This prompt is:
- Shown to teacher in UI (when teacher initiates)
- Passed to AI for context (when students initiate)

## Examples from Current Scenarios

### Example 1: Students Initiate
```javascript
{
  text: "השיעור של השבוע הוא על משולשים: סוגי משולשים, תכונות משולשים, ומשפט אי-השוויון במשולש.",
  keywords: ["משולשים", "שווה צלעות", "שווה שוקיים", "שונה צלעות", "אי-שוויון במשולש"],
  initiated_by: "students",
  initial_prompt: "התלמידים מגיעים לשיעור עזר עם שאלות על משולשים ומשפט אי-השוויון"
}
```

**What happens:**
1. Session starts automatically
2. Students generate first message (greeting + question about triangles)
3. Teacher responds to student question

### Example 2: Teacher Initiates
```javascript
{
  text: "השיעור של השבוע הוא על זוויות: זוויות משלימות, זוויות צמודות, וזוויות קדקוד.",
  keywords: ["זוויות", "משלימות", "צמודות", "זוויות קדקוד"],
  initiated_by: "teacher",
  initial_prompt: "התחל את השיעור על זוויות - אתה יכול להציג בעיה, לשאול שאלה כללית, או להסביר מושג"
}
```

**What happens:**
1. Session waits for teacher
2. Blue prompt box shows: "אתה מתחיל את השיעור" with the `initial_prompt`
3. Teacher types first message
4. Students respond naturally to teacher's opening

## User Experience

### When Students Initiate

**Teacher sees:**
```
💬 Online Tutoring Session
3 student(s) present: נועה, תמר, יובל

[Students' greeting and question appear automatically]
נועה: שלום! יש לנו שאלה על משולשים...
```

**Teacher then:** Responds to the students' question

### When Teacher Initiates

**Teacher sees:**
```
💬 Online Tutoring Session
3 student(s) present: נועה, תמר, יובל

┌─────────────────────────────────┐
│            💡                   │
│     אתה מתחיל את השיעור        │
│                                 │
│ התחל את השיעור על זוויות -    │
│ אתה יכול להציג בעיה, לשאול    │
│ שאלה כללית, או להסביר מושג     │
└─────────────────────────────────┘

[Input field ready for teacher to type]
```

**Teacher then:** Types their opening message

## AI Behavior Adaptation

### Students Initiate Mode
AI receives this instruction:
```
🎯 CRITICAL INSTRUCTION - FIRST MESSAGE: This is the VERY FIRST message 
of the tutoring session. The students are arriving for help. They should 
greet the tutor warmly and then IMMEDIATELY present a specific geometry 
problem or question related to today's topic. Context: [initial_prompt]
```

**AI generates:** Natural student greeting + specific question/problem

### Teacher Initiate Mode
AI receives this instruction:
```
🎯 FIRST RESPONSE TO TEACHER: The teacher just started the conversation. 
Students should respond naturally to what the teacher said - asking 
clarifying questions, showing initial thoughts or confusion, or engaging 
with the problem/topic the teacher introduced. Context: [initial_prompt]
```

**AI generates:** Natural student responses to teacher's opening

## Pedagogical Use Cases

### Students Should Initiate When:
- ✅ Practicing diagnostic questioning (teacher assesses understanding)
- ✅ Responding to student misconceptions (students present confused thinking)
- ✅ Office hours simulation (students come with homework problems)
- ✅ Formative assessment (see what students struggle with)

### Teacher Should Initiate When:
- ✅ Introducing new concepts (teacher sets up lesson)
- ✅ Direct instruction practice (teacher explains then checks understanding)
- ✅ Problem-based learning (teacher presents scenario)
- ✅ Guided discovery (teacher asks leading questions)
- ✅ Review sessions (teacher frames the review topic)

## Technical Implementation

### Files Modified

1. **`src/config/scenarios/geometry_scenarios.js`**
   - Added `initiated_by` and `initial_prompt` fields
   - Configured 3 scenarios (2 students, 1 teacher)

2. **`src/config/scenarios/sample_scenarios.js`**
   - Updated with same fields for consistency
   - Shows examples for other domains

3. **`src/pages/Chat.jsx`**
   - Checks `scenario.initiated_by` on mount
   - Conditionally triggers AI or waits for teacher
   - Displays prompt UI when teacher should start
   - Passes appropriate context to AI

### Logic Flow

```
Session Start
    ↓
Check scenario.initiated_by
    ↓
┌───────────────┬────────────────┐
│   "students"  │    "teacher"   │
├───────────────┼────────────────┤
│ Trigger AI    │ Wait for input │
│ immediately   │ Show prompt UI │
├───────────────┼────────────────┤
│ Students      │ Teacher types  │
│ speak first   │ first message  │
├───────────────┼────────────────┤
│ Teacher       │ Students       │
│ responds      │ respond        │
└───────────────┴────────────────┘
```

## Creating New Scenarios

### Template

```javascript
{
  // Topic description (shown in sidebar)
  text: "השיעור של השבוע הוא על [נושא]...",
  
  // Keywords for topic focus
  keywords: ["מילת מפתח 1", "מילת מפתח 2"],
  
  // Who starts: "students" or "teacher"
  initiated_by: "students", // or "teacher"
  
  // Context/guidance (shown to teacher or passed to AI)
  initial_prompt: "הקשר או הדרכה ספציפית לתרחיש הזה"
}
```

### Decision Guide: Who Should Initiate?

Ask yourself:
- **Does the teacher need to set up context first?** → Teacher initiates
- **Are students bringing a problem to solve?** → Students initiate
- **Is this about diagnosing student thinking?** → Students initiate
- **Is this a structured lesson introduction?** → Teacher initiates
- **Do students have homework questions?** → Students initiate

## Testing

### Test Student Initiation
1. Use scenario with `initiated_by: "students"`
2. Start session
3. ✅ Students should automatically greet and present problem
4. ✅ Teacher input should be ready to respond

### Test Teacher Initiation
1. Use scenario with `initiated_by: "teacher"`
2. Start session
3. ✅ Should see blue prompt box with guidance
4. ✅ No automatic messages - waiting for teacher
5. Type teacher's opening message
6. ✅ Students should respond naturally to it

## Troubleshooting

### Students aren't initiating automatically
- Check `initiated_by: "students"` is set in scenario
- Check browser console for errors
- Verify `scenario` object is loaded correctly

### Prompt box not showing for teacher initiation
- Check `initiated_by: "teacher"` is set
- Verify conversation history is empty (`history.getLength() === 0`)
- Check console - should see "Wait for teacher" logic

### AI generating wrong type of first message
- Check the `addendum` being passed to AI (console log)
- Verify `initial_prompt` provides sufficient context
- May need to adjust prompt wording for clarity

## Future Enhancements

Potential additions:
- **Random initiation**: `initiated_by: "random"` - flips a coin
- **Specific student starts**: `initiated_by: {student: "נועה"}` - only that student greets
- **Timed initiation**: Students arrive "late" (2-3 seconds delay)
- **Multiple phases**: Teacher sets up, students work, teacher circulates
- **Turn-taking patterns**: Structured discussion formats

## Best Practices

### For Scenario Designers

1. **Be specific in `initial_prompt`**
   - ❌ "התחל את השיעור" (too vague)
   - ✅ "הצג בעיה על חישוב שטח מלבן ושאל מה הקשר להיקף"

2. **Match initiation to pedagogical goal**
   - Diagnostic → Students initiate
   - Instructional → Teacher initiates
   - Mixed → Consider creating two scenarios

3. **Vary initiation across scenarios**
   - Don't make all scenarios student-initiated
   - Variety = richer teaching practice

4. **Test both paths**
   - Ensure prompts make sense for both modes
   - Verify AI behavior is natural in each case

### For Researchers

- **Log initiation type** for data analysis
- **Compare teacher behavior** in student-initiated vs teacher-initiated sessions
- **Measure response quality** - does initiation mode affect teaching moves?
- **PCK assessment** - different skills emerge in different modes

## Summary

✅ **Full flexibility implemented**
✅ **Works with existing Chain-of-Thought system**
✅ **No breaking changes** (all scenarios must specify `initiated_by`)
✅ **UI guidance for teachers**
✅ **AI adapts behavior automatically**
✅ **Supports diverse pedagogical approaches**

This feature significantly enhances the realism and pedagogical value of the tutoring simulator!

