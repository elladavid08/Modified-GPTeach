# Random Student Selection Implementation Guide

## Overview

This guide explains how to implement random student selection from the pool of 9 diverse student personas, allowing for variety across sessions.

---

## 🎯 Current vs. Future State

### Current State (Fixed Students)
Currently, the system likely uses the first N students from the personas object:
```javascript
// Simplified current approach
const allStudents = Object.values(personas);
const selectedStudents = allStudents.slice(0, NUM_STUDENTS);  // Always the same
```

### Future State (Random Selection)
With random selection:
```javascript
// Random approach
const allStudents = Object.values(personas);
const selectedStudents = shuffleArray(allStudents).slice(0, NUM_STUDENTS);
```

This means each session will have a different combination of students.

---

## 📁 Where to Implement

### Primary File: `src/objects/Student.js`

Look for where students are initialized in the app. This is likely in `Student.js` or wherever the `students` array is created.

**Current code might look like:**
```javascript
// Example of fixed student creation
export function createStudents() {
  const allPersonas = Object.values(personas);
  return allPersonas.slice(0, Constants.NUM_STUDENTS).map(persona => 
    new Student(persona.name, persona.description, persona.keywords, persona.voice)
  );
}
```

**Modified for random selection:**
```javascript
import { shuffleArray } from '../utils/helpers';  // utility function

export function createStudents() {
  const allPersonas = Object.values(personas);
  
  // Random selection
  const selectedPersonas = shuffleArray(allPersonas).slice(0, Constants.NUM_STUDENTS);
  
  return selectedPersonas.map(persona => 
    new Student(persona.name, persona.description, persona.keywords, persona.voice)
  );
}
```

---

## 🔧 Helper Function: Shuffle Array

Create a utility function for randomization.

### File: `src/utils/helpers.js`

```javascript
/**
 * Fisher-Yates shuffle algorithm
 * Returns a new shuffled array without modifying the original
 */
export function shuffleArray(array) {
  const shuffled = [...array];  // Create copy
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

**Why Fisher-Yates?**
- Unbiased random shuffle
- Each permutation equally likely
- Efficient O(n) time complexity

---

## 🎲 Example Outputs

Given 9 students and `NUM_STUDENTS = 3`:

**Session 1:**
```javascript
["נועה", "יונתן", "עדי"]
```

**Session 2:**
```javascript
["תמר", "הילה", "רועי"]
```

**Session 3:**
```javascript
["יובל", "דנה", "מעיין"]
```

**Session 4:**
```javascript
["נועה", "מעיין", "יונתן"]  // Different combination
```

---

## 🔢 Adjusting Number of Students

### Change in `src/config/constants.js`

```javascript
export const Constants = {
  // ... other constants ...
  
  NUM_STUDENTS: 3,  // Change this to 4, 5, etc.
};
```

**Examples:**
- `NUM_STUDENTS: 3` → 3 random students per session (84 possible combinations)
- `NUM_STUDENTS: 4` → 4 random students per session (126 possible combinations)
- `NUM_STUDENTS: 5` → 5 random students per session (126 possible combinations)

**Math:** C(9,3) = 84, C(9,4) = 126, C(9,5) = 126

---

## 🎯 Optional: Seeded Randomization

For **research reproducibility**, you might want deterministic "random" selection based on a seed.

### File: `src/utils/helpers.js`

```javascript
/**
 * Seeded random number generator (LCG algorithm)
 * Allows reproducible "random" selections for research
 */
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

/**
 * Shuffle with optional seed for reproducibility
 */
export function shuffleArray(array, seed = null) {
  const shuffled = [...array];
  
  if (seed !== null) {
    const rng = new SeededRandom(seed);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  } else {
    // True random (standard Fisher-Yates)
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  
  return shuffled;
}
```

**Usage for reproducible research:**
```javascript
// Session ID or timestamp as seed
const seed = sessionId;  // e.g., 12345
const students = shuffleArray(allPersonas, seed).slice(0, NUM_STUDENTS);

// Same seed = same student selection
```

---

## 🎓 Advanced: Balanced Selection

For research, you might want to ensure all students appear roughly equally over time.

### File: `src/utils/student_selection.js`

```javascript
/**
 * Track student appearances and balance selection
 */
export class BalancedStudentSelector {
  constructor(allPersonas) {
    this.allPersonas = allPersonas;
    this.appearanceCounts = {};
    
    // Initialize counts
    allPersonas.forEach(persona => {
      this.appearanceCounts[persona.name] = 0;
    });
  }
  
  /**
   * Select N students, preferring less-frequently used ones
   */
  selectStudents(numStudents) {
    // Sort by appearance count (least used first)
    const sorted = [...this.allPersonas].sort((a, b) => 
      this.appearanceCounts[a.name] - this.appearanceCounts[b.name]
    );
    
    // Take least-used students
    const selected = sorted.slice(0, numStudents);
    
    // Update counts
    selected.forEach(persona => {
      this.appearanceCounts[persona.name]++;
    });
    
    return selected;
  }
  
  /**
   * Get appearance statistics
   */
  getStats() {
    return this.appearanceCounts;
  }
}
```

**Usage:**
```javascript
const selector = new BalancedStudentSelector(Object.values(personas));

// Session 1
const session1Students = selector.selectStudents(3);
// ["נועה", "תמר", "יובל"] (first 3, all count = 0)

// Session 2
const session2Students = selector.selectStudents(3);
// ["דנה", "יונתן", "הילה"] (next 3, all count = 0)

// Session 3
const session3Students = selector.selectStudents(3);
// ["מעיין", "עדי", "רועי"] (last 3, all count = 0)

// Session 4 (now all have count = 1, cycles back)
const session4Students = selector.selectStudents(3);
// Starts from beginning again

console.log(selector.getStats());
// { נועה: 1, תמר: 1, יובל: 1, דנה: 1, ... }
```

---

## 🎨 UI Enhancement: Show Selected Students

Display which students are in the current session.

### File: `src/pages/Chat.jsx`

Add a header showing active students:

```javascript
function Chat() {
  const [students, setStudents] = useState([]);
  
  // ... existing code ...
  
  return (
    <div className="chat-container">
      {/* Active Students Display */}
      <div className="active-students-bar">
        <span>תלמידים בשיחה:</span>
        {students.map(student => (
          <span key={student.name} className="student-chip">
            {student.name}
          </span>
        ))}
      </div>
      
      {/* Rest of chat interface */}
      {/* ... */}
    </div>
  );
}
```

**CSS:**
```css
.active-students-bar {
  padding: 10px;
  background: #f0f0f0;
  border-bottom: 1px solid #ddd;
  display: flex;
  gap: 10px;
  align-items: center;
}

.student-chip {
  background: #4CAF50;
  color: white;
  padding: 5px 10px;
  border-radius: 15px;
  font-size: 14px;
}
```

---

## 📊 Research Data: Track Combinations

For thesis research, track which student combinations were used in each session.

### File: `src/utils/session_logger.js`

```javascript
export function logSessionStudents(sessionId, students) {
  const studentNames = students.map(s => s.name);
  
  const sessionData = {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    students: studentNames,
    student_count: studentNames.length,
    combination_hash: generateCombinationHash(studentNames)
  };
  
  // Store in database or local storage
  saveToDatabase(sessionData);
  
  return sessionData;
}

function generateCombinationHash(names) {
  // Sort to ensure same combination = same hash
  return names.sort().join('-');
  // e.g., "דנה-נועה-תמר"
}
```

**Research Questions This Helps Answer:**
- Which student combinations are most challenging for teachers?
- Do teachers demonstrate different PCK skills with different combinations?
- Are some student profiles overlooked when combined with others?

---

## 🔄 Implementation Checklist

- [ ] Create `shuffleArray()` helper in `src/utils/helpers.js`
- [ ] Modify student initialization to use random selection
- [ ] Test with different `NUM_STUDENTS` values (3, 4, 5)
- [ ] Add UI display of active students
- [ ] (Optional) Implement seeded randomization for reproducibility
- [ ] (Optional) Implement balanced selection for research
- [ ] (Optional) Add session logging for combination tracking
- [ ] Update documentation for teachers/researchers

---

## 🎯 Testing Commands

After implementation:

```bash
# Run multiple sessions and verify different combinations
npm start

# Check console logs for student names
# Should see different combinations each session
```

---

## 📝 Summary

✅ **Random selection** adds variety and realism  
✅ **Flexible NUM_STUDENTS** allows scaling (3, 4, 5+ students)  
✅ **Research-friendly** with optional seeding and tracking  
✅ **Simple implementation** with Fisher-Yates shuffle  
✅ **Balanced options** for ensuring all students get equal use  

This creates a more dynamic, varied teaching practice environment! 🎓

