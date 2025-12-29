# How to Add PCK-Focused Scenarios

## 📁 Where to Add Your Scenarios

**File:** `src/config/scenarios/geometry_scenarios.js`

**Location:** Inside the `scenarios` array

## 📋 Complete Scenario Structure

Each scenario should follow this exact structure:

```javascript
{
  text: "השיעור של השבוע הוא על [נושא]",
  keywords: ["מילה1", "מילה2", "מילה3"],
  initiated_by: "students",  // or "teacher"
  initial_prompt: "תיאור המצב ההתחלתי",
  target_pck_skills: ["skill-id-1", "skill-id-2"],
  misconception_focus: "איזו תפיסה שגויה התלמידים יציגו",
  pck_guidance: "הדרכה למורה"  // optional but recommended
}
```

## 📝 Field-by-Field Explanation

### Required Fields

#### 1. `text` (string)
**What it is:** Description of the lesson topic  
**Format:** Hebrew sentence starting with "השיעור של השבוע הוא על..."  
**Example:** `"השיעור של השבוע הוא על אלכסונים במרובעים"`

#### 2. `keywords` (array of strings)
**What it is:** Key terms related to the topic  
**Format:** Array of 3-6 Hebrew words  
**Example:** `["אלכסונים", "מעויין", "דלתון", "ניצבים"]`

#### 3. `initiated_by` (string)
**What it is:** Who starts the conversation  
**Options:** `"students"` or `"teacher"`  
**Choose "students" when:** Students should come with a question/confusion  
**Choose "teacher" when:** Teacher should introduce the topic  
**Example:** `"students"`

#### 4. `initial_prompt` (string)
**What it is:** Context for the opening of the conversation  
**Format:** Hebrew sentence describing the situation  
**For students:** What confusion/question they have  
**For teacher:** How to introduce the topic  
**Example:** `"התלמידים מגיעים עם בלבול לגבי הקשר בין אלכסונים מאונכים למעויין"`

#### 5. `target_pck_skills` (array of strings)
**What it is:** IDs of PCK skills this scenario targets  
**Format:** Array of skill_id values from pck_taxonomy.js  
**Must match:** Skill IDs you defined in your taxonomy  
**Example:** `["identify-diagonal-misconception-perpendicular"]`

To find your skill IDs, look in `pck_taxonomy.js` for the `skill_id` field:
```javascript
{
  skill_id: "identify-diagonal-misconception-perpendicular",  // ← Use this exact string
  // ...
}
```

#### 6. `misconception_focus` (string)
**What it is:** Specific misconception students will express  
**Format:** Hebrew sentence describing what students will say/think  
**Should match:** The `student_scenario.misconception` from your PCK taxonomy  
**Example:** `"התלמידים יטענו שאם האלכסונים מאונכים אז המרובע הוא בהכרח מעויין"`

#### 7. `pck_guidance` (string) - Optional but Recommended
**What it is:** Hint for teacher about what to look for  
**Format:** Hebrew sentence with pedagogical guidance  
**Example:** `"חפש הזדמנות לזהות בלבול בין טענה לטענה ההפוכה"`

## 🎯 Templates for Your 4 Skills

### Template 1: Perpendicular Diagonals Misconception

```javascript
{
  text: "השיעור של השבוע הוא על אלכסונים במרובעים: מעויין, דלתון, ריבוע ומלבן",
  keywords: ["אלכסונים", "מעויין", "דלתון", "ניצבים", "מאונכים"],
  initiated_by: "students",
  initial_prompt: "התלמידים מגיעים עם בלבול לגבי הקשר בין אלכסונים מאונכים למעויין",
  target_pck_skills: ["identify-diagonal-misconception-perpendicular"],
  misconception_focus: "התלמידים יטענו שאם האלכסונים מאונכים אז המרובע הוא בהכרח מעויין",
  pck_guidance: "חפש הזדמנות לזהות בלבול בין טענה לטענה ההפוכה ולבקש דוגמה נגדית"
}
```

### Template 2: Equal Diagonals Misconception

```javascript
{
  text: "השיעור של השבוע הוא על תכונות מלבן ודלתון - אלכסונים שווים וחוצים",
  keywords: ["מלבן", "דלתון", "אלכסונים", "שווים", "חוצים"],
  initiated_by: "students",
  initial_prompt: "התלמידים חושבים שאלכסונים שווים מספיקים כדי להגדיר מלבן",
  target_pck_skills: ["identify-diagonal-misconception-equal"],
  misconception_focus: "התלמידים יטענו שאם האלכסונים שווים אז המרובע הוא בהכרח מלבן",
  pck_guidance: "זהה הנחה שגויה שתכונה הכרחית היא גם מספיקה ובקש דוגמה נגדית"
}
```

### Template 3: Angle Bisectors Misconception

```javascript
{
  text: "השיעור של השבוע הוא על ריבוע ומעויין - השוואה בין התכונות",
  keywords: ["ריבוע", "מעויין", "אלכסונים", "חוצה זווית", "תכונות"],
  initiated_by: "teacher",
  initial_prompt: "הצג שאלה: מה ההבדל בין ריבוע למעויין? שניהם בעלי אלכסונים החוצים זוויות",
  target_pck_skills: ["identify-diagonal-misconception-angle-bisectors"],
  misconception_focus: "התלמידים יבלבלו בין ריבוע למעויין ויחשבו שחציית זוויות מספיקה לריבוע",
  pck_guidance: "השווה בין צורות קרובות וחדד את ההבחנה בין תכונות משותפות לייחודיות"
}
```

### Template 4: Inclusion Relationships Misconception

```javascript
{
  text: "השיעור של השבוע הוא על סיווג מרובעים ויחסי הכלה: ריבוע, מלבן, מעויין",
  keywords: ["סיווג", "הכלה", "ריבוע", "מלבן", "מעויין", "יחס"],
  initiated_by: "students",
  initial_prompt: "התלמידים חושבים שריבוע, מלבן ומעויין הם שלוש צורות נפרדות לגמרי",
  target_pck_skills: ["identify-inclusion-misconception-square"],
  misconception_focus: "התלמידים יראו את המרובעים כקטגוריות נפרדות ולא כהיררכיה עם יחסי הכלה",
  pck_guidance: "זהה הזדמנות ללמד על יחסי הכלה באמצעות שפה של 'כל' ו'חלק מ'"
}
```

## 📄 Complete File Structure

Here's how your `geometry_scenarios.js` should look:

```javascript
const scenarios = [
  // Keep your existing non-PCK scenarios if you want them
  {
    text: "השיעור של השבוע הוא על משולשים: סוגי משולשים, תכונות משולשים, ומשפט אי-השוויון במשולש.",
    keywords: ["משולשים", "שווה צלעות", "שווה שוקיים", "שונה צלעות", "אי-שוויון במשולש"],
    initiated_by: "students",
    initial_prompt: "התלמידים מגיעים לשיעור עזר עם שאלות על משולשים ומשפט אי-השוויון"
  },
  
  // Add your 4 new PCK-focused scenarios here:
  
  // SCENARIO 1: Perpendicular Diagonals
  {
    text: "השיעור של השבוע הוא על אלכסונים במרובעים: מעויין, דלתון, ריבוע ומלבן",
    keywords: ["אלכסונים", "מעויין", "דלתון", "ניצבים", "מאונכים"],
    initiated_by: "students",
    initial_prompt: "התלמידים מגיעים עם בלבול לגבי הקשר בין אלכסונים מאונכים למעויין",
    target_pck_skills: ["identify-diagonal-misconception-perpendicular"],
    misconception_focus: "התלמידים יטענו שאם האלכסונים מאונכים אז המרובע הוא בהכרח מעויין",
    pck_guidance: "חפש הזדמנות לזהות בלבול בין טענה לטענה ההפוכה ולבקש דוגמה נגדית"
  },
  
  // SCENARIO 2: Equal Diagonals
  {
    text: "השיעור של השבוע הוא על תכונות מלבן ודלתון - אלכסונים שווים וחוצים",
    keywords: ["מלבן", "דלתון", "אלכסונים", "שווים", "חוצים"],
    initiated_by: "students",
    initial_prompt: "התלמידים חושבים שאלכסונים שווים מספיקים כדי להגדיר מלבן",
    target_pck_skills: ["identify-diagonal-misconception-equal"],
    misconception_focus: "התלמידים יטענו שאם האלכסונים שווים אז המרובע הוא בהכרח מלבן",
    pck_guidance: "זהה הנחה שגויה שתכונה הכרחית היא גם מספיקה ובקש דוגמה נגדית"
  },
  
  // SCENARIO 3: Angle Bisectors
  {
    text: "השיעור של השבוע הוא על ריבוע ומעויין - השוואה בין התכונות",
    keywords: ["ריבוע", "מעויין", "אלכסונים", "חוצה זווית", "תכונות"],
    initiated_by: "teacher",
    initial_prompt: "הצג שאלה: מה ההבדל בין ריבוע למעויין? שניהם בעלי אלכסונים החוצים זוויות",
    target_pck_skills: ["identify-diagonal-misconception-angle-bisectors"],
    misconception_focus: "התלמידים יבלבלו בין ריבוע למעויין ויחשבו שחציית זוויות מספיקה לריבוע",
    pck_guidance: "השווה בין צורות קרובות וחדד את ההבחנה בין תכונות משותפות לייחודיות"
  },
  
  // SCENARIO 4: Inclusion Relationships
  {
    text: "השיעור של השבוע הוא על סיווג מרובעים ויחסי הכלה: ריבוע, מלבן, מעויין",
    keywords: ["סיווג", "הכלה", "ריבוע", "מלבן", "מעויין", "יחס"],
    initiated_by: "students",
    initial_prompt: "התלמידים חושבים שריבוע, מלבן ומעויין הם שלוש צורות נפרדות לגמרי",
    target_pck_skills: ["identify-inclusion-misconception-square"],
    misconception_focus: "התלמידים יראו את המרובעים כקטגוריות נפרדות ולא כהיררכיה עם יחסי הכלה",
    pck_guidance: "זהה הזדמנות ללמד על יחסי הכלה באמצעות שפה של 'כל' ו'חלק מ'"
  }
  
  // ← Note: NO comma after the last scenario!
];

export default { scenarios };
```

## ✅ Step-by-Step Instructions

### Step 1: Open the File
Open `src/config/scenarios/geometry_scenarios.js`

### Step 2: Find the Array
Look for the `const scenarios = [` line

### Step 3: Decide What to Keep
- You can keep your existing scenarios OR
- Replace them entirely with the 4 new PCK scenarios

### Step 4: Copy-Paste
Copy each scenario template from above and paste inside the `scenarios` array

### Step 5: Remember Commas!
- Put a **comma** after each scenario `},`
- **NO comma** after the last scenario `}`

### Step 6: Verify Skill IDs
Make sure the `target_pck_skills` values EXACTLY match your skill IDs from `pck_taxonomy.js`:
- `"identify-diagonal-misconception-perpendicular"`
- `"identify-diagonal-misconception-equal"`
- `"identify-diagonal-misconception-angle-bisectors"`
- `"identify-inclusion-misconception-square"`

### Step 7: Save
Save the file!

## 🎨 Customization Tips

### Want to modify a scenario?

**Change the topic focus:**
```javascript
text: "השיעור של השבוע הוא על [הנושא שלך]",
```

**Add more keywords:**
```javascript
keywords: ["מילה1", "מילה2", "מילה3", "מילה4", "מילה5"],
```

**Target multiple skills:**
```javascript
target_pck_skills: [
  "identify-diagonal-misconception-perpendicular",
  "identify-diagonal-misconception-equal"
],
```

**Change who initiates:**
- Students come with problem: `initiated_by: "students"`
- Teacher introduces: `initiated_by: "teacher"`

## ❌ Common Mistakes to Avoid

### ❌ Missing Comma
```javascript
{
  text: "...",
  // ...
}  // ← Missing comma between scenarios!
{
  text: "...",
  // ...
}
```

### ✅ Correct
```javascript
{
  text: "...",
  // ...
},  // ← Comma here!
{
  text: "...",
  // ...
}  // ← No comma on last one
```

### ❌ Wrong Skill ID
```javascript
target_pck_skills: ["identify-diagonal-perpendicular"],  // ← Typo!
```

### ✅ Correct (must match exactly)
```javascript
target_pck_skills: ["identify-diagonal-misconception-perpendicular"],
```

### ❌ Missing Quote Marks
```javascript
text: השיעור של השבוע,  // ← Missing quotes!
```

### ✅ Correct
```javascript
text: "השיעור של השבוע",
```

## 🧪 Testing Your Scenarios

After adding scenarios:

1. **Start the app:** `npm start`
2. **Check console** for any syntax errors
3. **Start a session** and verify scenario loads
4. **Check that:**
   - Topic description appears correctly
   - Students or teacher initiates as specified
   - Students express the expected misconception
   - (Later) Expert agent detects the targeted skills

## 📊 What Happens Next

Once you add these scenarios:

1. **Teachers can select them** from the scenario list
2. **Students will express** the specified misconceptions
3. **Expert agent** (when built) will watch for the targeted PCK skills
4. **Feedback will be provided** based on teacher's response

## 💡 Quick Reference

**Minimum scenario:**
```javascript
{
  text: "השיעור...",
  keywords: ["..."],
  initiated_by: "students",
  initial_prompt: "..."
}
```

**PCK-enhanced scenario:**
```javascript
{
  text: "השיעור...",
  keywords: ["..."],
  initiated_by: "students",
  initial_prompt: "...",
  target_pck_skills: ["skill-id"],
  misconception_focus: "...",
  pck_guidance: "..."
}
```

## 🎯 Your Task Checklist

- [ ] Open `src/config/scenarios/geometry_scenarios.js`
- [ ] Copy the 4 scenario templates from this document
- [ ] Paste them into the scenarios array
- [ ] Verify skill IDs match your taxonomy
- [ ] Check all commas are in place
- [ ] Save the file
- [ ] Test by starting the app
- [ ] Verify scenarios appear in the interface

You're now ready to add your PCK-focused scenarios! 🚀

