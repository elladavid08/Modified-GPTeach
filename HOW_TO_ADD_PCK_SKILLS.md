# How to Add Your PCK Skills Data

## File Location

**Your skills data goes here:**
```
src/config/pck/pck_taxonomy.js
```

## Where to Add Your Skills

Open `src/config/pck/pck_taxonomy.js` and find this section:

```javascript
// ==================== YOUR SKILLS GO HERE ====================
// Add your PCK skills below.
```

Replace the commented placeholders with your actual skill objects.

## Quick Steps

1. **Open** `src/config/pck/pck_taxonomy.js`

2. **Find** the section marked "YOUR SKILLS GO HERE" (around line 110)

3. **Paste** each of your skill objects there

4. **Remove** the example skill once you've added your real skills (optional)

5. **Save** the file

## Important Rules

### ✅ DO:
- Put a **comma** after each skill object (except the last one)
- Use **unique** `skill_id` for each skill
- Keep all Hebrew text in **Hebrew**
- Test by importing: `import { getAllSkills } from './config/pck/pck_taxonomy'`

### ❌ DON'T:
- Forget the comma between skills
- Use duplicate `skill_id` values
- Leave any fields empty (all are required)
- Put skills outside the `pckSkills` array

## Example Structure

```javascript
export const pckSkills = [
  // Remove this example skill once you add your real skills
  {
    skill_id: "example-identify-misconception",
    // ... example skill data
  },

  // YOUR SKILL 1
  {
    skill_id: "identify-diagonal-misconception-1",
    skill_name: {
      en: "Identifying Converse Statement Misconception (Diagonals)",
      he: "זיהוי תפיסה שגויה על הטענה ההפוכה (אלכסונים)"
    },
    category: "student_thinking_knowledge",
    subcategory: "misconceptions_about_quadrilaterals",
    description: {
      en: "Teacher identifies when student confuses statement with its converse",
      he: "המורה מזהה כאשר התלמיד מבלבל בין טענה לטענה ההפוכה"
    },
    indicators: [
      "מזהה במפורש את התפיסה השגויה",
      "שואל שאלות הבהרה על האלכסונים",
      // ... your indicators
    ],
    student_scenario: {
      context: "דיון על תכונות של מעוינים",
      student_says: "אם האלכסונים מאונכים אז זה בטח מעויין",
      misconception: "חוסר הבחנה בין טענה לטענה הפוכה"
    },
    examples: {
      positive: [
        {
          student: "אם האלכסונים מאונכים אז זה בטח מעויין",
          teacher_good: "רגע, בואו נבדוק. נכון שבמעויין האלכסונים מאונכים...",
          why_good: "המורה זיהה את התפיסה השגויה והוביל לבדיקה"
        }
      ],
      negative: [
        {
          student: "אם האלכסונים מאונכים אז זה בטח מעויין",
          teacher_bad: "נכון! כל הכבוד!",
          why_bad: "המורה לא זיהה את התפיסה השגויה"
        }
      ]
    },
    feedback_templates: {
      detected: "יפה מאוד! זיהית את הבלבול בין הטענה לטענה ההפוכה",
      missed: "שים לב - התלמיד הציג תפיסה שגויה לגבי הכיוון ההפוך של הטענה"
    },
    priority_level: "high"
  },

  // YOUR SKILL 2
  {
    skill_id: "identify-diagonal-misconception-2",
    // ... your second skill
  },

  // YOUR SKILL 3 (no comma after the last one!)
  {
    skill_id: "address-inclusion-misconception",
    // ... your third skill
  }

];
```

## Testing Your Skills

After adding your skills, test that they load correctly:

### Option 1: Check in Console
Add this temporarily in `Chat.jsx`:
```javascript
import { getAllSkills } from '../config/pck/pck_taxonomy';
console.log("PCK Skills loaded:", getAllSkills().length);
```

### Option 2: Node Test
Create a test file:
```javascript
// test-pck.js
const pck = require('./src/config/pck/pck_taxonomy.js');
console.log("Total skills:", pck.getAllSkills().length);
pck.getAllSkills().forEach(skill => {
  console.log(`- ${skill.skill_id}: ${skill.skill_name.he}`);
});
```

Run: `node test-pck.js`

## Common Mistakes

### ❌ Missing Comma
```javascript
{
  skill_id: "skill-1",
  // ...
}  // ← Missing comma!
{
  skill_id: "skill-2",
  // ...
}
```

### ✅ Correct
```javascript
{
  skill_id: "skill-1",
  // ...
},  // ← Comma here
{
  skill_id: "skill-2",
  // ...
}  // ← No comma on last one
```

### ❌ Duplicate IDs
```javascript
{ skill_id: "identify-misconception", ... },
{ skill_id: "identify-misconception", ... },  // ← Duplicate!
```

### ✅ Correct
```javascript
{ skill_id: "identify-diagonal-misconception-1", ... },
{ skill_id: "identify-diagonal-misconception-2", ... },  // ← Unique
```

## Field Requirements

All fields shown in the structure are **required**:
- `skill_id` ✅
- `skill_name` (en + he) ✅
- `category` ✅
- `subcategory` ✅
- `description` (can be string or {en, he}) ✅
- `indicators` (array) ✅
- `student_scenario` (context, student_says, misconception) ✅
- `examples` (positive + negative arrays) ✅
- `feedback_templates` (detected + missed) ✅
- `priority_level` ✅

## Helper Functions Available

Once your skills are added, you can use:

```javascript
import { 
  getAllSkills,           // Get all skills
  getSkillsByCategory,    // Filter by category
  getSkillById,           // Get specific skill
  getSkillsByPriority,    // Filter by priority
  formatTaxonomyForPrompt // Format for AI prompt
} from './config/pck/pck_taxonomy';

// Examples:
const allSkills = getAllSkills();
const foundational = getSkillsByPriority('foundational');
const skill = getSkillById('identify-diagonal-misconception-1');
```

## Need Help?

If you encounter errors:
1. Check browser/Node console for syntax errors
2. Verify all commas are in place
3. Ensure all strings are properly quoted
4. Make sure all required fields are filled
5. Test with just 1-2 skills first, then add more

## Next Steps

After adding your skills:
1. Save the file
2. Test that it loads without errors
3. The expert agent will automatically use this taxonomy
4. You can add more skills anytime by following the same structure

Your PCK taxonomy is now ready to power the expert feedback agent! 🎉

