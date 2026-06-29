const API_BASE_URL =
  process.env.REACT_APP_API_URL !== undefined
    ? process.env.REACT_APP_API_URL
    : 'http://localhost:3001';

async function handleResponse(res) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'שגיאה בתקשורת עם השרת');
  return data;
}

// ─── Admin: conversations ────────────────────────────────────────────────────

/**
 * Get conversation list — metadata only (no turns). Admin only.
 * @param {string} adminId
 * @param {{ userId?: string, systemVersion?: string }} filters
 */
export async function getConvsMeta(adminId, filters = {}) {
  const params = new URLSearchParams({ adminId });
  if (filters.userId)        params.append('userId',        filters.userId);
  if (filters.systemVersion) params.append('systemVersion', filters.systemVersion);
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/conv-meta?${params}`));
  return data.conversations;
}

/**
 * Get a full conversation document.
 * Admin always permitted; annotator only if they have an assignment for this conv.
 * @param {string} convId
 * @param {string} requesterId
 */
export async function getFullConv(convId, requesterId) {
  const params = new URLSearchParams({ requesterId });
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/conv-meta/${convId}?${params}`));
  return data.conversation;
}

// ─── Admin: assignments ──────────────────────────────────────────────────────

/**
 * Bulk-create annotation assignments. Duplicates are skipped.
 * @param {string} adminId
 * @param {{ conversationId: string, annotatorId: string, assignmentType: string }[]} items
 * @returns {{ created: object[], skipped: object[] }}
 */
export async function createAssignments(adminId, items) {
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/annotation-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, items }),
    })
  );
  return { created: data.created, skipped: data.skipped };
}

/**
 * Get all assignments (admin view).
 * @param {string} adminId
 * @param {{ status?: string, assignmentType?: string }} filters
 */
export async function getAssignments(adminId, filters = {}) {
  const params = new URLSearchParams({ adminId });
  if (filters.status)         params.append('status',         filters.status);
  if (filters.assignmentType) params.append('assignmentType', filters.assignmentType);
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/annotation-assignments?${params}`));
  return data.assignments;
}

// ─── Annotator: assignments ──────────────────────────────────────────────────

/**
 * Get my assignments (annotator view).
 * @param {string} annotatorId
 */
export async function getMyAssignments(annotatorId) {
  const params = new URLSearchParams({ annotatorId });
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/annotation-assignments/mine?${params}`)
  );
  return data.assignments;
}

// ─── Annotator: annotation CRUD ─────────────────────────────────────────────

/**
 * Fetch annotation for a given assignment (null if not yet started).
 * @param {string} assignmentId
 * @param {string} requesterId
 */
export async function getConvAnnotation(assignmentId, requesterId) {
  const params = new URLSearchParams({ requesterId });
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/conv-annotations/${assignmentId}?${params}`)
  );
  return data.annotation;
}

/**
 * Save annotation draft. Updates both the annotation doc and assignment status.
 * @param {{ annotatorId: string, assignmentId: string, feedbackPoints: object[], generalComment?: string }} payload
 */
export async function saveConvAnnotation(payload) {
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/conv-annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
  return data.annotationId;
}

/**
 * Submit annotation — marks annotation and assignment as completed.
 * @param {string} assignmentId
 * @param {string} annotatorId
 */
export async function submitConvAnnotation(assignmentId, annotatorId) {
  await handleResponse(
    await fetch(`${API_BASE_URL}/api/conv-annotations/${assignmentId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotatorId }),
    })
  );
}

/**
 * Cancel (delete) a not_started assignment. Admin only.
 * @param {string} adminId
 * @param {string} assignmentId
 */
export async function cancelAssignment(adminId, assignmentId) {
  const params = new URLSearchParams({ adminId });
  await handleResponse(
    await fetch(`${API_BASE_URL}/api/annotation-assignments/${assignmentId}?${params}`, {
      method: 'DELETE',
    })
  );
}

// ─── Admin: export ───────────────────────────────────────────────────────────

/**
 * Download all annotations as a structured JSON file for agreement analysis.
 * @param {string} adminId
 */
export async function exportAnnotationsJson(adminId) {
  const params = new URLSearchParams({ adminId });
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/conv-annotations/export?${params}`)
  );
  return data.export;
}
