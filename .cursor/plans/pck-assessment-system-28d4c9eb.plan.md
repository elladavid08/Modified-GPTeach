---
name: PCK Assessment & Training System
overview: ""
todos:
  - id: 30e5000d-657e-4433-8cbb-6993b4d28fbc
    content: Create PCK taxonomy template and documentation for education team
    status: pending
  - id: f96f076f-5dae-4acd-9afb-8254089d67c9
    content: Implement PCK taxonomy data structure and sample config
    status: pending
  - id: dd32f1b9-d5e2-4432-9226-58cfce7d1aa8
    content: Build PCK analyzer engine with GPT-4 meta-analysis
    status: pending
  - id: 50d0ca90-10cf-41f0-bde6-fe29f5cbd0e1
    content: Create PCKSession and PCKProfile objects for state management
    status: pending
  - id: f82256c2-361e-47c7-bbef-dfe4ad81f4dc
    content: Implement non-blocking PCK analysis service
    status: pending
  - id: 8a8cec28-38af-43d2-84be-0e0945e41f12
    content: Build Phase 2 targeted prompting system
    status: pending
  - id: d7ee81ad-b242-4456-ab40-5bc36d345c1b
    content: Integrate targeted prompting into student generation
    status: pending
  - id: e26bd4f4-9710-43fe-b5c7-086724deb859
    content: Create PCKReport component with visualizations
    status: pending
  - id: a4b82d1c-7b34-493e-91c6-c46bf7732f80
    content: Build ScenarioReview page with annotated transcript
    status: pending
  - id: fbc1c230-7a03-4e8f-9ddc-99d1635eda58
    content: Implement PCKDashboard with progress tracking
    status: pending
  - id: e90f9a44-7602-4d25-ad64-e2bf0c2e50be
    content: Add data persistence and export functionality
    status: pending
  - id: 243ff7be-2d9b-4d49-b359-e6c83a440bab
    content: Integrate PCK features into existing Chat component
    status: pending
  - id: 5a64f042-767c-4a21-8803-3b18b75dde8c
    content: Expand scenario bank with PCK-focused scenarios
    status: pending
  - id: 4663ba9a-7832-4ab4-84e6-febb05c136d4
    content: Build research analytics and export tools
    status: pending
  - id: 40623560-d7b7-4efd-ae5b-e17d8e091e79
    content: Test full system and prepare validation protocol
    status: pending
---

# PCK Assessment & Training System

## Overview

Transform the existing student simulator into a research-grade PCK assessment tool with two phases: (1) Assessment - identify teacher's PCK skill levels through natural conversation, and (2) Targeted Practice - strategically prompt students to create opportunities for missing skills. The system will provide post-scenario feedback reports and longitudinal progress tracking.

## Architecture: Observer Pattern with Dual Phases

```
Teacher <--> Student Simulation (existing)
                ↓ (parallel analysis)
         PCK Analyzer Agent
                ↓
         Skill Tracker & Report Generator
```

## Implementation Plan

### 1. PCK Taxonomy Data Structure & Template

**Create standardized PCK taxonomy format** that the education team will fill in:

**File**: `src/config/pck/pck_taxonomy.js`

- Define schema with:
  - `skill_id`: unique identifier
  - `skill_name`: display name (Hebrew & English)
  - `category`: grouping (e.g., "questioning", "misconceptions", "representations")
  - `description`: what this skill looks like in practice
  - `indicators`: Observable phrases/actions that demonstrate the skill
  - `student_scenarios`: Situations that create opportunities for this skill
  - `priority_level`: foundational/intermediate/advanced
  - `examples`: Positive and negative examples

**File**: `PCK_TAXONOMY_TEMPLATE.md` (documentation for education team)

- Provide clear instructions and examples
- Include a sample filled-in skill for reference
- Explain how this data will be used in the system

### 2. PCK Analysis Engine

**File**: `src/utils/pck_analyzer.js`

- `analyzeTurn()`: Analyze single teacher message against PCK rubric
- `analyzeConversation()`: Analyze full conversation for overall assessment
- Use GPT-4 as meta-analyzer with structured prompts
- Return: `{detected_skills: [{skill_id, confidence, evidence}], missing_opportunities: [skill_id]}`

**File**: `src/services/pck_analysis_service.js`

- Background analysis that doesn't interrupt conversation flow
- Queue-based processing (analyze after student responses generated)
- Accumulate results throughout session

### 3. Phase Detection & Mode System

**Extend**: `src/config/constants.js`

- Add `PCK_MODE`: "assessment" | "targeted_practice"
- Add `PCK_ENABLED`: boolean flag
- Add `ANALYSIS_DETAIL_LEVEL`: for adjusting analyzer sensitivity

**File**: `src/objects/PCKSession.js`

- Track current phase (assessment vs targeted practice)
- Store detected skills and confidence scores
- Identify skills to target in Phase 2
- Manage session metadata (duration, turn count, scenario)

### 4. Targeted Student Prompting (Phase 2)

**File**: `src/utils/targeted_prompting.js`

- `generateTargetedPrompt()`: Create student system prompts that elicit specific PCK skills
- Use PCK taxonomy's `student_scenarios` to craft situations
- Example: To elicit "addressing misconceptions" → student expresses common misconception
- Subtle integration: students behave naturally while creating opportunities

**Extend**: `src/utils/gpt.js`

- Modify `makeProsePrompt()` to include targeted prompting when in Phase 2
- Add skill-specific instructions to student agent prompts
- Keep targeting invisible to teacher

### 5. Post-Scenario Feedback Report

**File**: `src/components/PCKReport.jsx`

- Visual skill breakdown (demonstrated vs missed opportunities)
- Specific examples from conversation with explanations
- Comparison to baseline (if multiple sessions exist)
- Actionable recommendations for improvement
- Charts/visualizations of skill distribution

**File**: `src/pages/ScenarioReview.jsx`

- Full conversation transcript with annotations
- Highlight moments where skills were demonstrated or missed
- Allow teachers to reflect on their choices
- "What if?" suggestions for alternative approaches

### 6. Progress Dashboard

**File**: `src/pages/PCKDashboard.jsx`

- Longitudinal view of skill development across sessions
- Skill heatmap/radar chart showing current levels
- Session history with key metrics
- Recommended next scenarios based on skill gaps
- Export data for research analysis

**File**: `src/objects/PCKProfile.js`

- Store teacher's PCK profile over time
- Track skill progression across sessions
- Calculate growth metrics
- Manage historical data

### 7. Data Persistence & Storage

**File**: `src/utils/pck_storage.js`

- Save session transcripts with PCK annotations
- Store analysis results for each session
- Enable longitudinal tracking
- Export capabilities for research (JSON/CSV)
- Privacy-conscious design (anonymization options)

**Consider**: Firebase integration or local storage initially

- Firebase for multi-device access and cloud backup
- Local storage for privacy-sensitive pilot testing

### 8. Integration with Existing System

**Extend**: `src/pages/Chat.jsx`

- Add PCK analysis hooks (non-blocking background process)
- Track session start/end for report generation
- Add "End Session & View Report" button
- Preserve existing functionality when PCK disabled

**Extend**: `src/objects/ChatHistory.js`

- Add PCK annotation capability to messages
- Store analyzer results alongside conversation
- Enable replay with PCK insights

**File**: `src/components/PCKToggle.jsx`

- Settings panel to enable/disable PCK features
- Choose between Assessment vs Targeted Practice mode
- Select specific skills to focus on (for Phase 2)

### 9. Configuration & Scenarios

**Extend**: `src/config/scenarios/geometry_scenarios.js`

- Add PCK-specific metadata to scenarios
- Tag scenarios with relevant PCK skills they can elicit
- Difficulty levels aligned with teacher experience
- Clear teaching objectives for each scenario

**File**: `src/config/pck/scenario_bank.js`

- Expanded scenario library specifically designed for PCK assessment
- Each scenario optimized to create opportunities for different skill clusters
- Progression pathway through scenarios

### 10. Research Analytics & Export

**File**: `src/utils/research_export.js`

- Export anonymized data for thesis analysis
- Generate statistical summaries
- Inter-rater reliability tools (compare human coding to AI analysis)
- Timestamp all events for detailed analysis

**File**: `src/components/ResearchDashboard.jsx`

- Aggregate view across all participants (for researchers)
- Compare PCK development patterns
- Identify which scenarios best elicit which skills
- Validate analyzer accuracy

## Key Technical Decisions

1. **Non-intrusive Analysis**: PCK analysis happens in parallel; doesn't slow conversation
2. **Flexible Taxonomy**: Easy for education team to modify skills without code changes
3. **Privacy-First**: Teachers control data sharing; option for local-only storage
4. **Validation Built-in**: Allow human expert coding for AI validation
5. **Hebrew Support**: All feedback and reports support Hebrew/English

## Information Needed from Education Team

Provide them with `PCK_TAXONOMY_TEMPLATE.md` requesting:

- **Complete skill list** with descriptions and indicators
- **Priority/sequencing** of skills (which to assess first)
- **Example conversations** showing each skill in action
- **Common misconceptions** in geometry (for realistic scenarios)
- **Feedback preferences** (tone, detail level, format)
- **Validation**: How they'll verify AI analysis accuracy

## Next Steps After Implementation

1. **Pilot with education team**: Validate analyzer accuracy
2. **Calibration**: Tune analyzer prompts based on expert feedback
3. **Teacher pilot**: Small group testing with real teachers
4. **Iterate on feedback reports**: Refine based on teacher preferences
5. **Scale**: Deploy for thesis research data collection

## Files to Create/Modify Summary

**New Files** (11):

- `src/config/pck/pck_taxonomy.js`
- `src/config/pck/scenario_bank.js`
- `src/utils/pck_analyzer.js`
- `src/utils/targeted_prompting.js`
- `src/utils/pck_storage.js`
- `src/utils/research_export.js`
- `src/services/pck_analysis_service.js`
- `src/objects/PCKSession.js`
- `src/objects/PCKProfile.js`
- `src/components/PCKReport.jsx`
- `src/components/PCKToggle.jsx`

**New Pages** (3):

- `src/pages/PCKDashboard.jsx`
- `src/pages/ScenarioReview.jsx`
- `src/components/ResearchDashboard.jsx`

**Modified Files** (5):

- `src/config/constants.js` (add PCK settings)
- `src/config/scenarios/geometry_scenarios.js` (add metadata)
- `src/utils/gpt.js` (targeted prompting integration)
- `src/pages/Chat.jsx` (PCK hooks)
- `src/objects/ChatHistory.js` (annotation support)

**Documentation** (1):

- `PCK_TAXONOMY_TEMPLATE.md` (for education team)