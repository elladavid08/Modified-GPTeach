# Quick Reference: Scenario Configuration

## Scenario Structure

```javascript
{
  text: "תיאור הנושא של השיעור",
  keywords: ["מילה1", "מילה2", "מילה3"],
  initiated_by: "students",  // or "teacher"
  initial_prompt: "הקשר או הדרכה"
}
```

## Fields Explained

| Field | Required? | Options | Purpose |
|-------|-----------|---------|---------|
| `text` | ✅ Yes | Hebrew text | Topic description shown to teacher |
| `keywords` | ✅ Yes | Array of strings | Topic keywords for focus |
| `initiated_by` | ✅ Yes | `"students"` or `"teacher"` | Who starts the conversation |
| `initial_prompt` | ⚠️ Recommended | Hebrew text | Context/guidance for scenario |

## When to Use Each Initiation Mode

### `initiated_by: "students"` 
**Students arrive with questions**

✅ Use when:
- Students have homework problems
- Students show misconceptions
- Diagnostic teaching practice
- Office hours simulation
- Formative assessment

📝 Example `initial_prompt`:
```
"התלמידים מבולבלים בין היקף לשטח"
"תלמידה הביאה שאלה מהשיעורי בית"
"הקבוצה לא הבינה את משפט פיתגורס"
```

### `initiated_by: "teacher"`
**Teacher introduces the topic**

✅ Use when:
- Starting a new lesson
- Direct instruction practice
- Presenting a problem
- Guided discovery
- Review sessions

📝 Example `initial_prompt`:
```
"התחל עם בעיה על חישוב זוויות"
"הסבר מה זה מלבן ושאל שאלות"
"הצג דיאגרמה ושאל מה התלמידים רואים"
```

## Complete Examples

### Example 1: Students Initiate (Misconception)
```javascript
{
  text: "השיעור של השבוע הוא על מרובעים: תכונות וסיווג",
  keywords: ["מרובעים", "ריבוע", "מלבן", "מעויין", "הכלה"],
  initiated_by: "students",
  initial_prompt: "התלמידים חושבים שריבוע אינו מלבן - יש להם תפיסה שגויה על יחסי הכלה"
}
```

### Example 2: Teacher Initiates (New Concept)
```javascript
{
  text: "השיעור של השבוע הוא על משוואות לינאריות",
  keywords: ["משוואות", "לינארי", "פתרון", "גרף"],
  initiated_by: "teacher",
  initial_prompt: "הצג משוואה פשוטה (2x + 3 = 7) ושאל איך פותרים אותה"
}
```

### Example 3: Students Initiate (Homework Help)
```javascript
{
  text: "השיעור של השבוע הוא על שטח משולשים",
  keywords: ["שטח", "משולש", "בסיס", "גובה", "נוסחה"],
  initiated_by: "students",
  initial_prompt: "התלמידים תקועים בתרגיל על מציאת שטח משולש עם מידע חסר"
}
```

### Example 4: Teacher Initiates (Problem-Based)
```javascript
{
  text: "השיעור של השבוע הוא על אחוזים בחיי היומיום",
  keywords: ["אחוזים", "הנחה", "מע״מ", "יישומים"],
  initiated_by: "teacher",
  initial_prompt: "תאר מצב של קנייה בחנות עם 20% הנחה ושאל כמה ישלמו"
}
```

## Tips for Writing Good `initial_prompt`

### ✅ DO:
- Be specific about the situation
- Include the confusion/question/topic
- Mention specific concepts or examples
- Keep it 1-2 sentences
- Write in Hebrew (for Hebrew scenarios)

### ❌ DON'T:
- Be too vague ("התחל את השיעור")
- Give step-by-step instructions
- Make it too long (>3 sentences)
- Contradict the `text` field
- Leave it empty (always provide context!)

## Common Patterns

### Pattern 1: Conceptual Confusion
```javascript
initiated_by: "students"
initial_prompt: "התלמידים מבלבלים בין [מושג A] ל-[מושג B]"
```

### Pattern 2: Procedural Difficulty
```javascript
initiated_by: "students"
initial_prompt: "התלמידים לא יודעים איך [פעולה מסוימת]"
```

### Pattern 3: Worked Example
```javascript
initiated_by: "teacher"
initial_prompt: "הצג דוגמה פתורה של [בעיה] ובדוק הבנה"
```

### Pattern 4: Discovery Learning
```javascript
initiated_by: "teacher"
initial_prompt: "שאל שאלה פתוחה: [שאלה] והנח לתלמידים לחקור"
```

### Pattern 5: Misconception Challenge
```javascript
initiated_by: "teacher"
initial_prompt: "הצג טענה לא נכונה: [טענה] ובקש מהתלמידים להגיב"
```

## Validation Checklist

Before adding a new scenario, check:

- [ ] `text` describes the topic clearly
- [ ] `keywords` cover main concepts (3-6 keywords)
- [ ] `initiated_by` is either `"students"` or `"teacher"`
- [ ] `initial_prompt` provides specific context
- [ ] Initiation mode matches pedagogical goal
- [ ] All text in Hebrew (for Hebrew scenarios)
- [ ] No syntax errors (commas, brackets, quotes)

## Testing Your Scenario

1. **Load the scenario** in the app
2. **Check initiation:**
   - Students mode: Do they automatically greet + present problem?
   - Teacher mode: Is prompt box shown? Is guidance clear?
3. **Check topic focus:** Do students stay on the specified topic?
4. **Check context:** Does AI behavior match your `initial_prompt`?

## Need Help?

If scenario doesn't work as expected:
- Check browser console for errors
- Verify JSON syntax is correct
- Ensure scenario is in the scenarios array
- Test with both initiation modes
- Refine `initial_prompt` wording

## Quick Copy-Paste Template

```javascript
{
  text: "השיעור של השבוע הוא על ___________",
  keywords: ["___", "___", "___"],
  initiated_by: "students", // or "teacher"
  initial_prompt: "___________"
},
```

Replace the underscores with your content!

