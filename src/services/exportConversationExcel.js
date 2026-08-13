/**
 * Export a single research conversation to a styled Hebrew Excel file.
 *
 * Data model assumptions (verified against the codebase):
 *  - conversation.turns[]  – array of turn objects
 *  - turn.turnNumber       – 1-based integer
 *  - turn.teacher.message  – teacher text
 *  - turn.students[]       – [{ name, message }]
 *  - turn.pckFeedback      – object | null
 *    - .feedback_message             Hebrew summary string
 *    - .skills_assessment[]          [{ skill_id, is_relevant, score, evidence, what_could_be_better }]
 *    - .detected_skills[]            fallback – [{ skill_id, evidence }]
 *    - .missed_opportunities[]       fallback – [{ skill_id, what_could_have_been_done }]
 *  - conversation.summaryFeedback – plain Hebrew markdown string | null
 */

import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';

// ─── Hebrew PCK skill name mapping (matches ConversationLogs.jsx) ──────────────
const SKILL_NAMES_HE = {
  'error-identification':         'זיהוי השגיאה',
  'error-characterization':       'אפיון סוג השגיאה',
  'diagnostic-interpretation':    'פרשנות אבחונית של חשיבת התלמיד',
  'adapted-pedagogical-response': 'תגובה פדגוגית מותאמת',
  'error-leveraging':             'מינוף השגיאה ללמידה',
};

// Score labels matching the website legend
const SCORE_LABELS = { 2: 'קיים היטב', 1: 'קיים באופן חלקי', 0: 'חסר' };

// ─── Column layout (5 columns A-E, 0-based) ──────────────────────────────────
const NUM_COLS = 5;
const COL_WIDTHS = [
  { wch: 6  },  // A: תור / פרמטר label column
  { wch: 46 },  // B: מורה / value / תוכן הניתוח
  { wch: 38 },  // C: תלמידים / (merged with B for analysis content)
  { wch: 46 },  // D: משוב PCK / הערות לניתוח איכותני
  { wch: 40 },  // E: הערות לניתוח איכותני / (merged with D for notes)
];

// ─── Cell styles ─────────────────────────────────────────────────────────────

const RTL = 2; // readingOrder: RTL for Hebrew

// Shared border definitions — declared first so all style objects can reference them
const HEADER_BORDER = {
  top:    { style: 'thin', color: { rgb: '888888' } },
  bottom: { style: 'thin', color: { rgb: '888888' } },
  left:   { style: 'thin', color: { rgb: '888888' } },
  right:  { style: 'thin', color: { rgb: '888888' } },
};
const DATA_BORDER = {
  top:    { style: 'thin', color: { rgb: 'DDDDDD' } },
  bottom: { style: 'thin', color: { rgb: 'DDDDDD' } },
  left:   { style: 'thin', color: { rgb: 'DDDDDD' } },
  right:  { style: 'thin', color: { rgb: 'DDDDDD' } },
};

const sectionHeaderStyle = {
  font:      { bold: true, sz: 13, color: { rgb: 'FFFFFF' } },
  fill:      { patternType: 'solid', fgColor: { rgb: '6C5CE7' } },
  alignment: { horizontal: 'right', vertical: 'center', readingOrder: RTL },
};

const tableHeaderStyle = {
  font:      { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill:      { patternType: 'solid', fgColor: { rgb: '5A4FC9' } },
  alignment: { horizontal: 'right', vertical: 'center', wrapText: true, readingOrder: RTL },
  border: HEADER_BORDER,
};

const metaLabelStyle = {
  font:      { bold: true, sz: 11 },
  fill:      { patternType: 'solid', fgColor: { rgb: 'F0EEFF' } },
  alignment: { horizontal: 'right', vertical: 'top', readingOrder: RTL },
};

const metaValueStyle = {
  alignment: { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: RTL },
};

const turnNumStyle = {
  font:      { bold: true, sz: 11, color: { rgb: '6C5CE7' } },
  alignment: { horizontal: 'center', vertical: 'top', readingOrder: RTL },
  border:    DATA_BORDER,
};

const teacherCellStyle = {
  fill:      { patternType: 'solid', fgColor: { rgb: 'F8F9FA' } },
  alignment: { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: RTL },
  border:    DATA_BORDER,
};

const studentCellStyle = {
  fill:      { patternType: 'solid', fgColor: { rgb: 'E7F3FF' } },
  alignment: { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: RTL },
  border:    DATA_BORDER,
};

const pckCellStyle = {
  fill:      { patternType: 'solid', fgColor: { rgb: 'D4EDDA' } },
  alignment: { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: RTL },
  border:    DATA_BORDER,
};

const notesCellStyle = {
  fill:      { patternType: 'solid', fgColor: { rgb: 'FFFCE8' } },
  alignment: { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: RTL },
  border:    DATA_BORDER,
};

const analysisHeaderStyle = {
  font:      { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill:      { patternType: 'solid', fgColor: { rgb: '5A4FC9' } },
  alignment: { horizontal: 'right', vertical: 'center', readingOrder: RTL },
  border:    HEADER_BORDER,
};

const analysisParamStyle = {
  font:      { bold: true, sz: 11 },
  fill:      { patternType: 'solid', fgColor: { rgb: 'EDE8FF' } },
  alignment: { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: RTL },
  border:    DATA_BORDER,
};

const analysisContentStyle = {
  alignment: { horizontal: 'right', vertical: 'top', wrapText: true, readingOrder: RTL },
  border:    DATA_BORDER,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(val) {
  if (!val) return '—';
  try {
    const d = val.toDate ? val.toDate() : new Date(val);
    return d.toLocaleString('he-IL');
  } catch {
    return '—';
  }
}

/**
 * Formats a pckFeedback object into a readable multi-line Hebrew string.
 * Mirrors the logic in PCKFeedbackBullets in ConversationLogs.jsx.
 */
function formatPCKFeedback(pckFeedback) {
  if (!pckFeedback) return '';

  const lines = [];

  if (pckFeedback.feedback_message) {
    lines.push(pckFeedback.feedback_message);
    lines.push('');
  }

  const assessedSkills = (pckFeedback.skills_assessment || []).filter(s => s.is_relevant);

  if (assessedSkills.length > 0) {
    assessedSkills.forEach(s => {
      const name  = SKILL_NAMES_HE[s.skill_id] || s.skill_id;
      const label = SCORE_LABELS[s.score] !== undefined ? SCORE_LABELS[s.score] : '';
      const text  = s.score > 0 ? (s.evidence || '') : (s.what_could_be_better || '');
      lines.push(`${name} [${label}]`);
      if (text) lines.push(text);
      lines.push('');
    });
  } else {
    // Fallback to detected_skills / missed_opportunities
    (pckFeedback.detected_skills || []).forEach(s => {
      const name = SKILL_NAMES_HE[s.skill_id] || s.skill_id;
      lines.push(`${name} [${SCORE_LABELS[2]}]`);
      if (s.evidence) lines.push(s.evidence);
      lines.push('');
    });
    (pckFeedback.missed_opportunities || []).forEach(s => {
      const name = SKILL_NAMES_HE[s.skill_id] || s.skill_id;
      lines.push(`${name} [${SCORE_LABELS[0]}]`);
      if (s.what_could_have_been_done) lines.push(s.what_could_have_been_done);
      lines.push('');
    });
  }

  return lines.join('\n').trim();
}

/**
 * Formats the array of student responses into one multi-line string.
 * Format: "שם תלמיד: הודעה"
 */
function formatStudents(students) {
  if (!students || students.length === 0) return '';
  return students.map(s => `${s.name}: ${s.message}`).join('\n');
}

/**
 * Parses the summaryFeedback markdown string into [{ heading, content }] sections.
 * Headings are lines starting with one or more '#' characters.
 */
function parseSummaryFeedback(text) {
  if (!text) return [];

  const lines = text.split('\n');
  const sections = [];
  let currentHeading = '';
  let currentLines = [];

  const flush = () => {
    const content = currentLines.join('\n').replace(/\*\*/g, '').trim();
    if (currentHeading || content) {
      sections.push({ heading: currentHeading, content });
    }
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^#+\s/.test(line)) {
      flush();
      currentHeading = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
    } else {
      const cleaned = line.replace(/\*\*/g, '').trim();
      if (cleaned) currentLines.push(cleaned);
    }
  }
  flush();

  return sections;
}

// ─── Worksheet builder ───────────────────────────────────────────────────────

/**
 * Builds the worksheet object by directly assigning SheetJS cell objects.
 */
function buildWorksheet(conversation, participantLabel) {
  const ws  = {};
  const merges = [];
  let row = 0; // 0-based current row index

  /** Set a single cell */
  function setCell(r, c, value, style) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const v    = value == null ? '' : value;
    ws[addr]   = { v, t: typeof v === 'number' ? 'n' : 's', s: style };
  }

  /** Fill an entire row with empty cells using the given style */
  function fillRow(r, style) {
    for (let c = 0; c < NUM_COLS; c++) setCell(r, c, '', style);
  }

  /** Full-width section header (merged A:E) */
  function addSectionHeader(title) {
    fillRow(row, sectionHeaderStyle);
    setCell(row, 0, title, sectionHeaderStyle);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: NUM_COLS - 1 } });
    row++;
  }

  /** Metadata row: label in A, value in B:E merged */
  function addMetaRow(label, value) {
    setCell(row, 0, label,       metaLabelStyle);
    setCell(row, 1, value || '—', metaValueStyle);
    for (let c = 2; c < NUM_COLS; c++) setCell(row, c, '', metaValueStyle);
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: NUM_COLS - 1 } });
    row++;
  }

  function addEmptyRow() {
    for (let c = 0; c < NUM_COLS; c++) setCell(row, c, '', {});
    row++;
  }

  // ─── Section 1: פרטי שיחה ──────────────────────────────────────────────────
  addSectionHeader('פרטי שיחה');

  if (participantLabel) addMetaRow('משתתף', participantLabel);
  addMetaRow('מזהה',    conversation.sessionId   || '—');
  addMetaRow('גרסה',    conversation.systemVersion || '—');
  addMetaRow('תחילה',   formatDateTime(conversation.startTime));
  if (conversation.endTime) {
    addMetaRow('סיום', formatDateTime(conversation.endTime));
  }
  if (conversation.stats && conversation.stats.durationMinutes != null) {
    addMetaRow('משך זמן', `${conversation.stats.durationMinutes} דקות`);
  }
  if (conversation.scenario && conversation.scenario.text) {
    addMetaRow('תרחיש', conversation.scenario.text);
  }
  if (conversation.stats) {
    const s = conversation.stats;
    if (s.totalTeacherMessages  != null) addMetaRow('תגובות מורה',    String(s.totalTeacherMessages));
    if (s.totalStudentMessages  != null) addMetaRow('תגובות תלמידים', String(s.totalStudentMessages));
    if (s.totalPCKFeedbacks     != null) addMetaRow('משובי PCK',       String(s.totalPCKFeedbacks));
  }

  addEmptyRow();

  // ─── Section 2: טבלת השיחה ─────────────────────────────────────────────────
  addSectionHeader('טבלת השיחה');

  // Table column headers
  const headers = ['תור', 'מורה', 'תלמידים', 'משוב PCK', 'הערות לניתוח איכותני'];
  headers.forEach((h, c) => setCell(row, c, h, tableHeaderStyle));
  const tableHeaderRow = row;
  row++;

  // One row per teacher turn
  const turns = conversation.turns || [];
  turns.forEach(turn => {
    const teacherMsg   = (turn.teacher && turn.teacher.message) || '';
    const studentsText = formatStudents(turn.students);
    const pckText      = formatPCKFeedback(turn.pckFeedback);

    setCell(row, 0, turn.turnNumber || '',  turnNumStyle);
    setCell(row, 1, teacherMsg,             teacherCellStyle);
    setCell(row, 2, studentsText,           studentCellStyle);
    setCell(row, 3, pckText,               pckCellStyle);
    setCell(row, 4, '',                     notesCellStyle);
    row++;
  });

  addEmptyRow();

  // ─── Section 3: ניתוח מקיף PCK ────────────────────────────────────────────
  addSectionHeader('ניתוח מקיף PCK');

  if (conversation.summaryFeedback) {
    // Sub-header row for the analysis table columns
    // Layout: A = פרמטר, B+C merged = תוכן הניתוח, D+E merged = הערות לניתוח איכותני
    setCell(row, 0, 'פרמטר / חלק בניתוח',    analysisHeaderStyle);
    setCell(row, 1, 'תוכן הניתוח',           analysisHeaderStyle);
    setCell(row, 2, '',                        analysisHeaderStyle);
    setCell(row, 3, 'הערות לניתוח איכותני',  analysisHeaderStyle);
    setCell(row, 4, '',                        analysisHeaderStyle);
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 2 } }); // B+C: content
    merges.push({ s: { r: row, c: 3 }, e: { r: row, c: 4 } }); // D+E: notes
    row++;

    const sections = parseSummaryFeedback(conversation.summaryFeedback);

    if (sections.length > 0) {
      sections.forEach(({ heading, content }) => {
        setCell(row, 0, heading,  analysisParamStyle);
        setCell(row, 1, content,  analysisContentStyle);
        setCell(row, 2, '',       analysisContentStyle);
        setCell(row, 3, '',       notesCellStyle);
        setCell(row, 4, '',       notesCellStyle);
        merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 2 } }); // B+C: content
        merges.push({ s: { r: row, c: 3 }, e: { r: row, c: 4 } }); // D+E: notes
        row++;
      });
    } else {
      // summaryFeedback exists but had no parseable sections — show as a single block
      setCell(row, 0, 'ניתוח', analysisParamStyle);
      setCell(row, 1, conversation.summaryFeedback.replace(/\*\*/g, '').trim(), analysisContentStyle);
      setCell(row, 2, '', analysisContentStyle);
      setCell(row, 3, '', notesCellStyle);
      setCell(row, 4, '', notesCellStyle);
      merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 2 } });
      merges.push({ s: { r: row, c: 3 }, e: { r: row, c: 4 } });
      row++;
    }
  } else {
    // No comprehensive analysis was generated
    const noSummaryRow = row;
    setCell(row, 0, 'לא נוצר ניתוח מקיף PCK לשיחה זו.', metaValueStyle);
    for (let c = 1; c < NUM_COLS; c++) setCell(row, c, '', metaValueStyle);
    merges.push({ s: { r: noSummaryRow, c: 0 }, e: { r: noSummaryRow, c: NUM_COLS - 1 } });
    row++;
  }

  // ─── Worksheet metadata ─────────────────────────────────────────────────────
  ws['!ref']   = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: NUM_COLS - 1 } });
  ws['!cols']  = COL_WIDTHS;
  ws['!merges'] = merges;
  ws['!views'] = [{ rightToLeft: true }];

  // Freeze the conversation table column header row
  ws['!freeze'] = { xSplit: 0, ySplit: tableHeaderRow + 1, topLeftCell: `A${tableHeaderRow + 2}` };

  return ws;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates and triggers download of an Excel file for the given conversation.
 *
 * @param {object} conversation  - Full conversation document from Firestore (via getConversationsByUserAdmin)
 * @param {string} participantLabel - e.g. "משתתף_01" shown in the research UI
 */
export function exportConversationToExcel(conversation, participantLabel) {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheet(conversation, participantLabel);
  XLSX.utils.book_append_sheet(wb, ws, 'שיחה');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Build a safe filename using participant label and session id
  const safeLabel   = (participantLabel || 'משתתף').replace(/\s+/g, '_');
  const sessionId   = conversation.sessionId || conversation.id || 'session';
  const filename    = `${safeLabel}_${sessionId}.xlsx`;

  saveAs(new Blob([wbout], { type: 'application/octet-stream' }), filename);
}
