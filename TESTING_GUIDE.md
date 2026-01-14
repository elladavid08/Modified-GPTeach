# Testing Guide: PCK-First Architecture

## Prerequisites

1. **Start the backend server**:
   ```bash
   cd server
   npm start
   ```
   Should see: `✅ Vertex AI initialized successfully` and `Server listening on port 3001`

2. **Start the frontend**:
   ```bash
   npm start
   ```
   Should open browser at `http://localhost:3000`

3. **Select a scenario** from the main page (one of the 4 new formal scenarios)

## What to Test

### Test 1: Good Teacher Response (Elicitation)
**Scenario**: יחסי הכלה בין ריבוע למלבן (7th grade)

**Student says**: "אבל זה ריבוע, לא מלבן"

**Good teacher response**: "שאלה טובה! בואו נבדוק - מה ההגדרה של מלבן?"

**What to look for**:
1. **PCK Feedback sidebar** should show:
   - Positive feedback
   - Skill demonstrated: "זיהוי תפיסה שגויה על יחסי הכלה"
   - Green/positive indicator

2. **Student responses** should show:
   - Student thinking about the definition
   - Engaged tone (not confused)
   - Progress toward understanding

3. **Console logs** should show:
   ```
   🎯 STEP 1: Analyzing teacher's pedagogical move...
   ✅ PCK analysis received:
      - Quality: positive
      - Addressed misconception: true
   🎯 STEP 2: Generating student responses based on PCK analysis...
   ✅ X student response(s) generated
   ```

### Test 2: Problematic Teacher Response (Authoritative Correction)
**Scenario**: יחסי הכלה בין ריבוע למלבן (7th grade)

**Student says**: "אבל זה ריבוע, לא מלבן"

**Problematic teacher response**: "ריבוע הוא מלבן, ככה זה במתמטיקה"

**What to look for**:
1. **PCK Feedback sidebar** should show:
   - Warning or negative feedback
   - Missed opportunity mentioned
   - Common mistake identified: "תיקון סמכותי"
   - Yellow/red indicator

2. **Student responses** should show:
   - Passive acceptance OR continued confusion
   - No real understanding progress
   - May express "אוקיי..." without conviction

3. **Console logs** should show:
   ```
   ✅ PCK analysis received:
      - Quality: problematic
      - Addressed misconception: false
   ```

### Test 3: Perpendicular Diagonals Scenario (9th grade)
**Scenario**: זיהוי מרובע על סמך תכונת האלכסונים

**Student says**: "זה חייב להיות מעוין, כי האלכסונים מאונכים"

**Good teacher response**: "נכון, במעוין באמת האלכסונים מאונכים. אבל בואו נחשוב - האם זו הצורה היחידה עם התכונה הזו?"

**What to look for**:
1. **PCK Feedback** should praise:
   - Acknowledging the correct part
   - Gentle challenge with question
   - Avoiding formal logic terminology

2. **Student responses** should:
   - Think about other shapes
   - Maybe mention "דלתון" if prompted further
   - Show cognitive engagement

### Test 4: Rectangle Visual Prototype (7th grade)
**Scenario**: מלבן חייב להיות ארוך

**Student says**: "זה לא מלבן, זה נראה ריבוע"

**Good teacher response**: "בואו נבדוק - מה ההגדרה של מלבן? ההגדרה אומרת משהו על כמה הצלעות צריכות להיות ארוכות?"

**What to look for**:
1. **PCK Feedback** should identify:
   - Addressing visual prototype misconception
   - Redirecting to formal definition
   - Separating appearance from properties

2. **Student responses** should:
   - Consider the definition
   - Question their visual assumption
   - Move toward concept-based understanding

## Console Debugging

### Enable Full Prompt Logging
In `src/config/constants.js`, set:
```javascript
export const IS_PRODUCTION = false;
```

This will log full prompts including the impact_analysis section.

### Key Log Patterns to Look For

**Successful Flow**:
```
💡 Requesting structured PCK feedback analysis...
📥 PCK feedback response status: 200
✅ PCK feedback successful
   Quality: positive
   Misconception addressed: true
   Predicted understanding: improved
📊 PCK feedback displayed to teacher
🎯 STEP 2: Generating student responses based on PCK analysis...
✅ 1 student response(s) generated
🎉 Turn complete: PCK analysis → Student responses → Display
```

**Error in PCK Analysis**:
```
❌ Error getting PCK feedback: ...
🎯 STEP 2: Generating student responses based on PCK analysis...
(continues with null impact_analysis)
```

**Backend Errors**:
```
❌ Network error - is the backend running on http://localhost:3001?
```

## Testing Checklist

- [ ] Backend starts without errors
- [ ] Frontend connects to backend
- [ ] Can select a scenario
- [ ] Teacher can send first message
- [ ] PCK analysis completes before students respond
- [ ] PCK feedback displays in sidebar
- [ ] Student responses align with PCK quality
- [ ] Good teaching → students show understanding
- [ ] Poor teaching → students show confusion
- [ ] Can complete full conversation
- [ ] Finish conversation button works
- [ ] Conversation logs are saved

## Common Issues

### Issue: "Backend server not available"
**Solution**: Make sure backend is running on port 3001
```bash
cd server
npm start
```

### Issue: Students respond before PCK feedback shows
**Solution**: This shouldn't happen with new architecture. Check console for:
```
🎯 STEP 1: Analyzing teacher's pedagogical move...
```
If missing, the flow is wrong.

### Issue: PCK feedback shows but students don't align
**Solution**: 
1. Check if `impact_analysis` is in the prompt (set IS_PRODUCTION=false)
2. Look for section: "🎯🎯🎯 CRITICAL: PCK EXPERT ANALYSIS"
3. If missing, check ai.js makeProsePrompt function

### Issue: JSON parsing errors in backend
**Solution**: The AI might not be returning valid JSON. Check:
1. Backend logs for raw response
2. May need to adjust PCK prompt in server.js
3. May need to increase maxOutputTokens if response is cut off

### Issue: Empty or vague PCK feedback
**Solution**: 
1. Check that scenario has all required fields (target_pck_skills, optimal_response_pattern, etc.)
2. Check that PCK skills exist in server/pck_taxonomy.js
3. May need to adjust PCK prompt to be more specific

## Success Criteria

✅ **Architecture Works** if:
1. PCK analysis always happens BEFORE student responses
2. PCK feedback quality matches teacher's move quality
3. Student understanding aligns with pedagogical quality:
   - Good teaching → understanding improves
   - Poor teaching → confusion or stagnation
4. Specific PCK skills are identified correctly
5. Missed opportunities are flagged appropriately
6. Students respect the "who_should_respond" guidance
7. Response tone matches predicted tone

✅ **Ready for Production** if:
- All 4 scenarios work correctly
- Both good and poor teacher moves produce appropriate results
- System handles errors gracefully
- Performance is acceptable (PCK analysis < 3 seconds)
- Feedback is helpful and specific (not generic)

## Performance Benchmarks

**Expected Timing**:
- PCK Analysis: 1-3 seconds
- Student Response: 1-2 seconds
- Total turn time: 2-5 seconds

If slower, check:
- Backend connection latency
- Vertex AI response time (logged in backend)
- Prompt length (may be too long)

## Next Steps After Testing

1. Gather example conversations
2. Evaluate PCK feedback quality
3. Adjust prompts based on results
4. Fine-tune student persona alignment
5. Add more scenarios
6. Consider caching for common patterns

