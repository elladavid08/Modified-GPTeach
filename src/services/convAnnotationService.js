const API_BASE_URL =
  process.env.REACT_APP_API_URL !== undefined
    ? process.env.REACT_APP_API_URL
    : 'http://localhost:3001';

async function handleResponse(res) {
  let data;
  try {
    data = await res.json();
  } catch (parseError) {
    // Non-JSON body (e.g. an IIS 502 HTML page while the backend restarts).
    // Surface the status instead of a confusing JSON parse error.
    throw new Error(`שגיאה בתקשורת עם השרת (HTTP ${res.status})`);
  }
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

// ─── Admin: read-only annotation view ───────────────────────────────────────

/**
 * Fetch full annotation as admin (read-only). Uses existing conv-annotations endpoint.
 * @param {string} assignmentId
 * @param {string} adminId
 * @returns {Object|null} annotation or null if not yet started
 */
export async function getAdminAnnotation(assignmentId, adminId) {
  const params = new URLSearchParams({ requesterId: adminId });
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/conv-annotations/${assignmentId}?${params}`)
  );
  return data.annotation;
}

// ─── Agreement Analysis ──────────────────────────────────────────────────────

/**
 * Get conversations eligible for agreement analysis
 * (≥2 completed reliability assignments).
 * @param {string} adminId
 */
export async function getEligibleAgreementConversations(adminId) {
  const params = new URLSearchParams({ adminId });
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/agreement-eligible?${params}`)
  );
  return data.conversations;
}

/**
 * List all saved agreement reports (summary fields only).
 * @param {string} adminId
 */
export async function getAgreementReports(adminId) {
  const params = new URLSearchParams({ adminId });
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/agreement-reports?${params}`)
  );
  return data.reports;
}

/**
 * Fetch a single agreement report with full metrics.
 * @param {string} reportId
 * @param {string} adminId
 */
export async function getAgreementReport(reportId, adminId) {
  const params = new URLSearchParams({ adminId });
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/agreement-reports/${reportId}?${params}`)
  );
  return data.report;
}

/**
 * Compute a new pairwise agreement report and save it to Firestore.
 * @param {string} adminId
 * @param {{ reportName: string, conversationIds: string[], annotatorIds: string[], includedAssignmentIds: string[] }} params
 */
export async function computeAgreementReport(adminId, params) {
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/agreement-reports`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ adminId, ...params }),
    })
  );
  return data.report;
}

// ─── Comparison Sets ─────────────────────────────────────────────────────────

export async function fetchComparisonSets(requesterId, isAdmin) {
  const params = new URLSearchParams({ requesterId, isAdmin: isAdmin ? 'true' : 'false' });
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/comparison-sets?${params}`));
  return data.sets;
}

export async function fetchComparisonSetDetail(requesterId, setId, isAdmin) {
  const params = new URLSearchParams({ requesterId, isAdmin: isAdmin ? 'true' : 'false' });
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/comparison-sets/${setId}?${params}`));
  return data.set;
}

export async function saveComparisonSet(adminId, setData) {
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/comparison-sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, ...setData }),
    })
  );
  return data.setId;
}

export async function patchComparisonSet(adminId, setId, updates) {
  await handleResponse(
    await fetch(`${API_BASE_URL}/api/comparison-sets/${setId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, ...updates }),
    })
  );
}

export async function removeComparisonSet(adminId, setId) {
  const params = new URLSearchParams({ adminId });
  await handleResponse(await fetch(`${API_BASE_URL}/api/comparison-sets/${setId}?${params}`, { method: 'DELETE' }));
}

export async function fetchComparisonEligible(adminId) {
  const params = new URLSearchParams({ adminId });
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/comparison-eligible?${params}`));
  return data.conversations;
}

export async function fetchComparisonData(requesterId, conversationId, assignmentIdA, assignmentIdB, isAdmin) {
  const params = new URLSearchParams({ requesterId, conversationId, assignmentIdA, assignmentIdB, isAdmin: isAdmin ? 'true' : 'false' });
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/comparison-data?${params}`));
  return data.data;
}

// ─── Consensus annotations ───────────────────────────────────────────────────

/**
 * Fetch the shared consensus annotation for a conversation in a comparison set.
 * Returns null if not yet created.
 */
export async function fetchConsensusAnnotation(requesterId, comparisonSetId, conversationId) {
  const params = new URLSearchParams({ requesterId, comparisonSetId, conversationId });
  const data = await handleResponse(await fetch(`${API_BASE_URL}/api/consensus-annotation?${params}`));
  return data.consensus; // null or doc
}

/**
 * Save (create or update) a consensus annotation draft.
 * feedbackPoints: array of { turnNumber, selectedDimensions, dimensionFeedback, teacherMessageSnapshot }
 * Returns the consensusId.
 */
export async function saveConsensusAnnotationDraft(requesterId, comparisonSetId, conversationId, sourceAssignmentIds, feedbackPoints) {
  const data = await handleResponse(
    await fetch(`${API_BASE_URL}/api/consensus-annotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, comparisonSetId, conversationId, sourceAssignmentIds, feedbackPoints }),
    })
  );
  return data.consensusId;
}

/**
 * Submit (complete) a consensus annotation. Makes it read-only for everyone.
 */
export async function submitConsensusAnnotation(requesterId, comparisonSetId, conversationId) {
  const consensusId = `${comparisonSetId}__${conversationId}`;
  await handleResponse(
    await fetch(`${API_BASE_URL}/api/consensus-annotation/${consensusId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, comparisonSetId, conversationId }),
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
