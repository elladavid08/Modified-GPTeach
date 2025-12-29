# Dynamic Student Selection for PCK Scenarios

## Philosophy

Student personas describe **general cognitive and personality profiles**, not hard-coded misconceptions. The AI dynamically decides which student should express which misconception based on:

1. **Scenario's target PCK skills** (`target_pck_skills`)
2. **Scenario's misconception focus** (`misconception_focus`)
3. **Each student's thinking style** (from persona descriptions)
4. **Current conversation context**

## Student Cognitive Profiles

### נועה (Noa) - Visual, Appearance-Based Thinker

**Thinking Style:**
- Strong visual learner
- Categorizes by "what the eye sees"
- Relies on appearance, not formal definitions
- Struggles with abstract/hierarchical relationships
- Prefers concrete, visual thinking over property lists

**When to Use Noa:**
- Scenarios involving classification and categorization
- When misconception relates to "looks different = is different"
- When visual representations are key
- When discussing hierarchical relationships (inclusion, subset)

**Example Misconceptions She Might Express:**
- "ריבוע נראה שונה ממלבן, אז זה לא אותו דבר"
- "אלכסונים שנראים שווים אז הם שווים"
- Difficulty seeing square as special case of rectangle

---

### תמר (Tamar) - Impulsive, Overgeneralizing Reasoner

**Thinking Style:**
- Jumps to conclusions quickly
- Overgeneralizes from few examples
- Confuses direction of implications (A→B vs B→A)
- Doesn't distinguish necessary vs. sufficient conditions
- Doesn't spontaneously seek counterexamples
- Says things with confidence even when uncertain

**When to Use Tamar:**
- Scenarios involving converse statements
- When misconception involves overgeneralization
- When discussing necessary vs. sufficient conditions
- When counterexample thinking is needed

**Example Misconceptions She Might Express:**
- "אם באלכסונים מאונכים אז זה מעויין" (converse)
- "ראיתי שני דלתונים עם אלכסונים מאונכים, אז תמיד ככה"
- Claims about "all" based on observing "some"

---

### יובל (Yuval) - Surface Learner, Fact Memorizer

**Thinking Style:**
- Memorizes lists of facts and properties
- Weak understanding of logical relationships between concepts
- Confuses defining vs. derived properties
- Thinks of geometry as rules to memorize, not logical system
- Good intentions but spreads partial understanding
- Needs prompting to explain "why"

**When to Use Yuval:**
- Scenarios involving property relationships
- When misconception relates to defining vs. derived properties
- When discussing what makes something "sufficient" to define
- When logical structure of definitions matters

**Example Misconceptions They Might Express:**
- "אלכסונים שחוצים זוויות זה מה שהופך אותו לריבוע" (confusing necessary with defining)
- Listing properties without understanding which are fundamental
- "אני די בטוח שזה נכון כי למדנו את זה"

---

## How the AI Decides

### Example Scenario: Perpendicular Diagonals

```javascript
{
  text: "אלכסונים במרובעים...",
  target_pck_skills: ["identify-diagonal-misconception-perpendicular"],
  misconception_focus: "התלמידים יטענו שאם האלכסונים מאונכים אז המרובע הוא בהכרח מעויין"
}
```

**AI Reasoning Process:**
1. Reads `misconception_focus`: converse statement error (perpendicular → rhombus)
2. Checks student profiles:
   - **נועה**: Visual thinker → not best fit for logical implication
   - **תמר**: Confuses A→B with B→A → **PERFECT FIT**
   - **יובל**: Memorizes facts → could fit but less natural
3. **Decision**: תמר expresses this misconception

**Result in Conversation:**
```
תמר: "אז אם האלכסונים מאונכים, זה אומר שזה מעויין, נכון?"
```

---

### Example Scenario: Inclusion Relationships

```javascript
{
  text: "סיווג מרובעים ויחסי הכלה...",
  target_pck_skills: ["identify-inclusion-misconception-square"],
  misconception_focus: "התלמידים יראו את המרובעים כקטגוריות נפרדות"
}
```

**AI Reasoning Process:**
1. Reads `misconception_focus`: category separation based on appearance
2. Checks student profiles:
   - **נועה**: Categorizes by appearance, struggles with hierarchical thinking → **PERFECT FIT**
   - **תמר**: Overgeneralizes → not primary pattern
   - **יובל**: Memorizes → could work but not as natural
3. **Decision**: נועה expresses this misconception

**Result in Conversation:**
```
נועה: "אני לא בטוחה... ריבוע נראה שונה ממלבן. זה באמת אותו דבר?"
```

---

### Example Scenario: Defining vs. Derived Properties

```javascript
{
  text: "ריבוע ומעויין - השוואת תכונות...",
  target_pck_skills: ["identify-diagonal-misconception-angle-bisectors"],
  misconception_focus: "התלמידים יחשבו שחציית זוויות מספיקה לריבוע"
}
```

**AI Reasoning Process:**
1. Reads `misconception_focus`: confusion about sufficient conditions, defining properties
2. Checks student profiles:
   - **נועה**: Visual thinker → not about properties
   - **תמר**: Overgeneralizes → not main pattern here
   - **יובל**: Confuses defining vs. derived properties → **PERFECT FIT**
3. **Decision**: יובל expresses this misconception

**Result in Conversation:**
```
יובל: "אני חושב שאם אלכסונים חוצים זוויות אז זה ריבוע... זאת אחת התכונות, לא?"
```

---

## Integration with Chain-of-Thought

The AI's "thinking" field will show this reasoning:

```json
{
  "thinking": {
    "teacher_message_summary": "המורה שואל על תכונות מעויין",
    "context_analysis": "תרחיש ממוקד על בלבול בין כיווני טענות",
    "who_should_respond": [
      {
        "student": "נועה",
        "should_respond": false,
        "reason": "היא חושבת ויזואלית, זה לא מתאים לטעות לוגית בכיוון הסקה",
        "confidence": "low"
      },
      {
        "student": "תמר",
        "should_respond": true,
        "reason": "היא נוטה לבלבל בין כיווני הסקה - מתאים מאוד לבטא את התפיסה השגויה הזאת",
        "confidence": "high"
      },
      {
        "student": "יובל",
        "should_respond": false,
        "reason": "לא מעורב ישירות בנושא הזה כרגע",
        "confidence": "low"
      }
    ]
  },
  "responses": [
    {"student": "תמר", "message": "אז אם אלכסונים מאונכים זה בטח מעויין, נכון?"}
  ]
}
```

## Benefits of This Approach

### ✅ Flexibility
- Same students can express different misconceptions in different scenarios
- AI adapts to conversation flow
- Not rigidly scripted

### ✅ Authenticity
- Students express misconceptions that match their thinking styles
- Natural, not forced
- Consistent characterization across scenarios

### ✅ Pedagogical Variety
- Teachers face different combinations of student + misconception
- Multiple students could potentially express same misconception (with different flavors)
- Rich teaching practice

### ✅ Research Value
- Can analyze: which thinking styles lead to which misconceptions?
- Which teaching approaches work for which cognitive profiles?
- Patterns across student types

## Prompt Instructions for AI

The system prompt should include:

```
STUDENT SELECTION GUIDELINES:
- Review each student's cognitive profile and thinking style
- Match the scenario's misconception_focus to the student whose thinking pattern naturally leads there
- נועה: Use for visual/appearance-based misconceptions, classification issues
- תמר: Use for overgeneralization, converse confusion, impulsive reasoning errors
- יובל: Use for property confusion, memorization without understanding
- Choose the student whose cognitive style makes the misconception most natural
- Not every student needs to speak - only those whose thinking patterns fit the current discussion
```

## Example Scenario-Student Matching

| Scenario Focus | Best Student | Why |
|----------------|--------------|-----|
| Inclusion relationships (square is rectangle) | **נועה** | Visual categorization |
| Perpendicular diagonals → rhombus | **תמר** | Converse confusion |
| Equal diagonals → rectangle | **תמר** | Overgeneralization |
| Angle bisectors → square | **יובל** | Property confusion |
| "Looks like" reasoning | **נועה** | Appearance-based |
| "I saw 2 examples" → "always true" | **תמר** | Overgeneralization |
| Lists properties without understanding | **יובל** | Memorization style |

## For Future: Adding More Students

When adding more students, define their:
- **Cognitive style** (visual, verbal, hands-on, abstract, etc.)
- **Reasoning patterns** (deductive, inductive, analogical, etc.)
- **Common error types** (calculation, conceptual, procedural, etc.)
- **Learning approach** (memorization, understanding, pattern-seeking, etc.)

Then the AI can match them to appropriate scenarios dynamically.

## Summary

**Old Approach:** "נועה always triggers inclusion misconceptions"  
**New Approach:** "נועה is a visual thinker → AI decides she should express inclusion misconception in that context"

**Result:** Natural, flexible, pedagogically authentic conversations that serve your research goals! 🎯

