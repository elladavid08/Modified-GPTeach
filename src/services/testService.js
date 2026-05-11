const API_BASE_URL = process.env.REACT_APP_API_URL !== undefined
  ? process.env.REACT_APP_API_URL
  : 'http://localhost:3001';

/**
 * Submit a completed test (pre or post).
 * @param {string} userId - Firebase UID of the authenticated teacher
 * @param {string} testType - "pre" | "post"
 * @param {Object} answers - { scenario1: { choice, correctExplanation?, q1?, ..., q5? }, ... }
 * @returns {Promise<{ submissionId: string, error: string|null }>}
 */
export async function submitTest(userId, testType, answers) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/test-submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, testType, answers }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { submissionId: null, error: data.error || 'שגיאה בשמירת הנתונים' };
    }
    return { submissionId: data.submissionId, error: null };
  } catch (err) {
    return { submissionId: null, error: err.message };
  }
}

/**
 * Check whether the user already submitted a given test type.
 * @param {string} userId
 * @param {string} testType - "pre" | "post"
 * @returns {Promise<{ submitted: boolean, error: string|null }>}
 */
export async function checkTestSubmitted(userId, testType) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/test-submissions/check?userId=${encodeURIComponent(userId)}&testType=${encodeURIComponent(testType)}`
    );
    const data = await response.json();
    if (!response.ok) {
      return { submitted: false, error: data.error || 'שגיאה בבדיקת הנתונים' };
    }
    return { submitted: data.submitted, error: null };
  } catch (err) {
    return { submitted: false, error: err.message };
  }
}
