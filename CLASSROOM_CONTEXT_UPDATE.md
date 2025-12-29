# Classroom Context Update

## Overview

Updated the system to reflect a **classroom lesson** context instead of a **tutoring session**. The user is now a teacher conducting a geometry lesson with a grade 8 (כיתה ח') class, not a tutor in a tutoring session.

---

## 🔄 Changes Made

### 1. **`src/config/constants.js`**

#### SYSTEM_PROMPT (line 6-7)
**Before:**
```javascript
"The user is a tutor, and you are playing multiple middle-school students 
coming to tutoring sessions with geometry questions or problems..."
```

**After:**
```javascript
"The user is a geometry teacher, and you are playing multiple students in 
a grade 8 (כיתה ח') middle-school classroom during a geometry lesson..."
```

#### RESPONSE_INSTRUCTIONS (line 8-9)
**Before:**
```javascript
"...give the tutor opportunities to teach and correct. The students interact 
to try to help each other...When the tutor includes a drawing..."
```

**After:**
```javascript
"...give the teacher opportunities to teach and correct. The students interact 
with each other during the lesson...When the teacher includes a drawing..."
```

#### DEFAULT_TA_NAME (line 26)
**Before:**
```javascript
DEFAULT_TA_NAME: "Tutor",
```

**After:**
```javascript
DEFAULT_TA_NAME: "Teacher",
```

---

### 2. **`src/utils/ai.js`**

#### Stop Tokens (lines 63, 165)
**Before:**
```javascript
stop: ["Tutor: "]
stop: ["Tutor:"]
```

**After:**
```javascript
stop: ["Teacher: "]
stop: ["Teacher:"]
```

#### HTML Tags Context (line 440)
**Before:**
```javascript
action="${student.name}-goes-to-tutoring-session"
```

**After:**
```javascript
action="${student.name}-participates-in-lesson"
```

---

### 3. **`src/pages/Chat.jsx`**

#### Comment (line 20)
**Before:**
```javascript
/** Add the tutor's message and wait for a response */
```

**After:**
```javascript
/** Add the teacher's message and wait for a response */
```

#### First Message Instructions (lines 49-53)
**Before:**
```javascript
"This is the VERY FIRST message of the tutoring session. The students are 
arriving for help. They should greet the tutor warmly...the students are 
coming TO the tutor FOR HELP with a SPECIFIC PROBLEM. Example: 'שלום! 
אנחנו צריכים עזרה עם שאלה...'"
```

**After:**
```javascript
"This is the VERY FIRST message of today's geometry lesson. The students are 
in class and should IMMEDIATELY present a specific geometry problem...students 
initiate by bringing up a problem or question. Example: 'מורה, יש לנו שאלה. 
אנחנו לא מבינים למה...'"
```

#### Teacher-Initiated Response (line 53)
**Before:**
```javascript
"The teacher just started the conversation..."
```

**After:**
```javascript
"The teacher just started the lesson..."
```

#### Page Header (line 103-106)
**Before:**
```html
<span role="img" aria-label="chat bubble">
    💬
</span>{" "}
Online Tutoring Session
```

**After:**
```html
<span role="img" aria-label="classroom">
    🏫
</span>{" "}
Geometry Lesson - Grade 8
```

---

## 📚 Context Changes Summary

### Old Context: Tutoring Session
- Students **come to** a tutor for help
- One-on-one or small group tutoring
- Students "arrive" with problems
- Greeting: "שלום! אנחנו צריכים עזרה..."

### New Context: Classroom Lesson
- Students **are in** a classroom with their teacher
- Full class participating in a lesson
- Students raise problems during the lesson
- Greeting: "מורה, יש לנו שאלה..."

---

## 🎯 Why This Matters

### For the Simulation:
- More authentic classroom dynamics
- Students interact as classmates, not tutoring clients
- Teacher-student relationship is different (authority, classroom management)
- Questions and discussions feel more natural to classroom context

### For PCK Assessment:
- Classroom PCK skills differ from tutoring PCK skills
- Teachers need to manage multiple students in a class setting
- More authentic context for research on teacher education
- Better ecological validity for thesis

### For User Experience:
- Teachers think of themselves as classroom teachers, not tutors
- More familiar mental model
- Consistent terminology throughout the system

---

## 🔍 What Stayed the Same

- All student personas (still grades 7-8)
- Scenario structure
- PCK taxonomy
- Chain-of-Thought prompting
- JSON response format
- Hebrew language requirement
- Core teaching challenges

---

## ✅ Testing Checklist

- [ ] Start a new session
- [ ] Verify header says "Geometry Lesson - Grade 8" with 🏫
- [ ] Check that students refer to "מורה" (teacher) not "מורה פרטי" (tutor)
- [ ] Verify first messages sound like classroom questions
- [ ] Confirm students interact as classmates
- [ ] Check that responses feel natural to classroom context

---

## 📝 Grade Level Choice

**Why Grade 8 (כיתה ח')?**
- Most students in personas are in grades 7-8
- Grade 8 is a typical level for advanced geometry topics (quadrilaterals, properties)
- Allows for both struggling 7th graders and advanced 8th graders
- Consistent with middle school context (grades 7-9 in Israel)
- Maintains age-appropriate language and behaviors (12-14 years old)

---

All changes maintain consistency with the existing codebase structure and do not break any functionality! 🎓✨

