const API_BASE_URL = process.env.REACT_APP_API_URL !== undefined
  ? process.env.REACT_APP_API_URL
  : 'http://localhost:3001';

/**
 * Fetch all test submissions (annotator-only).
 * @param {string} annotatorId - UID of the authenticated annotator
 * @param {{ testType?: string, status?: string }} filters
 */
export async function getSubmissions(annotatorId, filters = {}) {
  const params = new URLSearchParams({ annotatorId });
  if (filters.testType) params.append('testType', filters.testType);
  if (filters.status)   params.append('status', filters.status);

  const res = await fetch(`${API_BASE_URL}/api/test-submissions?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאה בטעינת הנתונים');
  return data.submissions;
}

/**
 * Fetch a single submission with all its answers.
 * @param {string} submissionId
 * @param {string} annotatorId
 */
export async function getSubmission(submissionId, annotatorId) {
  const params = new URLSearchParams({ annotatorId });
  const res = await fetch(`${API_BASE_URL}/api/test-submissions/${submissionId}?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאה בטעינת הנתון');
  return data.submission;
}

/**
 * Fetch an existing annotation for a submission (if any).
 * @param {string} submissionId
 * @param {string} annotatorId
 * @returns {Object|null} annotation or null if not yet annotated
 */
export async function getAnnotation(submissionId, annotatorId) {
  const params = new URLSearchParams({ annotatorId });
  const res = await fetch(`${API_BASE_URL}/api/test-annotations/${submissionId}?${params}`);
  const data = await res.json();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(data.error || 'שגיאה בטעינת ההערכה');
  return data.annotation;
}

/**
 * Fetch ALL annotations for a submission (admin only).
 * @param {string} submissionId
 * @param {string} adminId - UID of the authenticated admin
 * @returns {Promise<Array>} array of annotation objects (with annotatorName)
 */
export async function getAllAnnotations(submissionId, adminId) {
  const params = new URLSearchParams({ adminId });
  const res = await fetch(`${API_BASE_URL}/api/test-annotations/${submissionId}/all?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאה בטעינת ההערכות');
  return data.annotations;
}

/**
 * Save (create or overwrite) an annotation.
 * @param {{ submissionId, userId, testType, annotatorId, scores }} payload
 */
export async function saveAnnotation(payload) {
  const res = await fetch(`${API_BASE_URL}/api/test-annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאה בשמירת ההערכה');
  return data.annotationId;
}
