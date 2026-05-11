// Firebase Admin SDK initialization for backend
import admin from 'firebase-admin';

// Initialize Firebase Admin with existing service account
// The service account key is already configured for Vertex AI
// and works for Firebase as well
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'ella-gpteach-research'
  });
}

const db = admin.firestore();
const auth = admin.auth();

/**
 * Save conversation to Firestore
 */
async function saveConversation(conversationData) {
  try {
    const conversationRef = await db.collection('conversations').add({
      ...conversationData,
      savedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Conversation saved to Firestore: ${conversationRef.id}`);
    return { conversationId: conversationRef.id, error: null };
  } catch (error) {
    console.error('❌ Error saving conversation to Firestore:', error);
    return { conversationId: null, error: error.message };
  }
}

/**
 * Save individual message to a conversation
 */
async function saveMessage(conversationId, messageData) {
  try {
    const conversationRef = db.collection('conversations').doc(conversationId);
    
    await conversationRef.update({
      messages: admin.firestore.FieldValue.arrayUnion({
        ...messageData,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { error: null };
  } catch (error) {
    console.error('❌ Error saving message to Firestore:', error);
    return { error: error.message };
  }
}

/**
 * Create user profile in Firestore
 */
async function createUserProfile(userId, profileData) {
  try {
    await db.collection('users').doc(userId).set({
      ...profileData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { error: null };
  } catch (error) {
    console.error('❌ Error creating user profile:', error);
    return { error: error.message };
  }
}

/**
 * Get user profile from Firestore
 */
async function getUserProfile(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      return { profile: userDoc.data(), error: null };
    } else {
      return { profile: null, error: 'User not found' };
    }
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return { profile: null, error: error.message };
  }
}

/**
 * Get all conversations for analytics
 */
async function getAllConversations(filters = {}) {
  try {
    let query = db.collection('conversations');
    
    // Apply filters
    if (filters.systemVersion) {
      query = query.where('systemVersion', '==', filters.systemVersion);
    }
    if (filters.userId) {
      query = query.where('userId', '==', filters.userId);
    }
    if (filters.startDate) {
      query = query.where('startedAt', '>=', filters.startDate);
    }
    
    const snapshot = await query.get();
    const conversations = [];
    
    snapshot.forEach((doc) => {
      conversations.push({ id: doc.id, ...doc.data() });
    });
    
    return { conversations, error: null };
  } catch (error) {
    console.error('❌ Error getting conversations:', error);
    return { conversations: [], error: error.message };
  }
}

/**
 * Save a teacher's test submission.
 * Returns { submissionId, error }.
 */
async function saveTestSubmission({ userId, testType, answers }) {
  try {
    const existing = await db.collection('testSubmissions')
      .where('userId', '==', userId)
      .where('testType', '==', testType)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { submissionId: null, error: 'already_submitted' };
    }

    const ref = await db.collection('testSubmissions').add({
      userId,
      testType,
      answers,
      annotationStatus: 'pending',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { submissionId: ref.id, error: null };
  } catch (error) {
    console.error('❌ Error saving test submission:', error);
    return { submissionId: null, error: error.message };
  }
}

/**
 * Check whether a user has already submitted a given test type.
 * Returns { submitted: boolean, error }.
 */
async function checkTestSubmission(userId, testType) {
  try {
    const snapshot = await db.collection('testSubmissions')
      .where('userId', '==', userId)
      .where('testType', '==', testType)
      .limit(1)
      .get();

    return { submitted: !snapshot.empty, error: null };
  } catch (error) {
    console.error('❌ Error checking test submission:', error);
    return { submitted: false, error: error.message };
  }
}

/**
 * Verify that a userId belongs to an annotator.
 * Returns { isAnnotator: boolean, error }.
 */
async function verifyAnnotator(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return { isAnnotator: false, error: 'user_not_found' };
    return { isAnnotator: doc.data().isAnnotator === true, error: null };
  } catch (error) {
    return { isAnnotator: false, error: error.message };
  }
}

/**
 * Fetch all test submissions, optionally filtered.
 * Merges basic user profile info (fullName, email) into each submission.
 * Returns { submissions, error }.
 */
async function getTestSubmissions(filters = {}) {
  try {
    let query = db.collection('testSubmissions');
    if (filters.testType) query = query.where('testType', '==', filters.testType);
    if (filters.status)   query = query.where('annotationStatus', '==', filters.status);

    const snapshot = await query.orderBy('submittedAt', 'desc').get();
    const submissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Collect unique userIds and fetch their profiles in parallel
    const userIds = [...new Set(submissions.map(s => s.userId))];
    const profileDocs = await Promise.all(
      userIds.map(uid => db.collection('users').doc(uid).get())
    );
    const profileMap = {};
    profileDocs.forEach(doc => {
      if (doc.exists) {
        const d = doc.data();
        profileMap[doc.id] = { fullName: d.fullName || '', email: d.email || '' };
      }
    });

    // If a specific annotatorId is provided, find which submissions they personally annotated
    let annotatedByMeSet = new Set();
    if (filters.annotatorId) {
      const myAnnotations = await db.collection('testAnnotations')
        .where('annotatorId', '==', filters.annotatorId)
        .get();
      myAnnotations.forEach(doc => annotatedByMeSet.add(doc.data().submissionId));
    }

    const enriched = submissions.map(s => ({
      ...s,
      teacherName:     profileMap[s.userId] ? profileMap[s.userId].fullName  : '',
      teacherEmail:    profileMap[s.userId] ? profileMap[s.userId].email     : '',
      submittedAt:     s.submittedAt ? s.submittedAt.toDate().toISOString() : null,
      annotationCount: s.annotationCount || 0,
      annotatedByMe:   annotatedByMeSet.has(s.id),
    }));

    return { submissions: enriched, error: null };
  } catch (error) {
    console.error('❌ Error getting test submissions:', error);
    return { submissions: [], error: error.message };
  }
}

/**
 * Fetch a single submission by ID.
 * Returns { submission, error }.
 */
async function getTestSubmission(submissionId) {
  try {
    const doc = await db.collection('testSubmissions').doc(submissionId).get();
    if (!doc.exists) return { submission: null, error: 'not_found' };
    const data = doc.data();
    return {
      submission: {
        id: doc.id,
        ...data,
        submittedAt: data.submittedAt ? data.submittedAt.toDate().toISOString() : null,
      },
      error: null,
    };
  } catch (error) {
    console.error('❌ Error getting test submission:', error);
    return { submission: null, error: error.message };
  }
}

/**
 * Save (upsert) an annotation scoped to this annotator.
 * Each annotator keeps their own independent annotation per submission.
 * Returns { annotationId, error }.
 */
async function saveTestAnnotation({ submissionId, userId, testType, annotatorId, scores }) {
  try {
    // Upsert keyed on BOTH submissionId AND annotatorId — each annotator is independent
    const existing = await db.collection('testAnnotations')
      .where('submissionId', '==', submissionId)
      .where('annotatorId', '==', annotatorId)
      .limit(1)
      .get();

    let annotationRef;
    const annotationData = {
      submissionId,
      userId,
      testType,
      annotatorId,
      scores,
      annotatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!existing.empty) {
      annotationRef = existing.docs[0].ref;
      await annotationRef.update(annotationData);
    } else {
      annotationRef = await db.collection('testAnnotations').add(annotationData);
    }

    // Count how many distinct annotators have now scored this submission
    const allForSubmission = await db.collection('testAnnotations')
      .where('submissionId', '==', submissionId)
      .get();
    const annotationCount = allForSubmission.size;

    await db.collection('testSubmissions').doc(submissionId).update({
      annotationStatus: annotationCount >= 2 ? 'completed' : 'in_progress',
      annotationCount,
    });

    return { annotationId: annotationRef.id, error: null };
  } catch (error) {
    console.error('❌ Error saving annotation:', error);
    return { annotationId: null, error: error.message };
  }
}

/**
 * Fetch THIS annotator's own annotation for a submission (or null if none).
 * Returns { annotation, error }.
 */
async function getTestAnnotation(submissionId, annotatorId) {
  try {
    const snapshot = await db.collection('testAnnotations')
      .where('submissionId', '==', submissionId)
      .where('annotatorId', '==', annotatorId)
      .limit(1)
      .get();

    if (snapshot.empty) return { annotation: null, error: null };

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      annotation: {
        id: doc.id,
        ...data,
        annotatedAt: data.annotatedAt ? data.annotatedAt.toDate().toISOString() : null,
      },
      error: null,
    };
  } catch (error) {
    console.error('❌ Error getting annotation:', error);
    return { annotation: null, error: error.message };
  }
}

/**
 * Fetch ALL annotations for a submission (admin only).
 * Enriches each annotation with the annotator's display name.
 * Returns { annotations, error }.
 */
async function getAllAnnotationsForSubmission(submissionId) {
  try {
    const snapshot = await db.collection('testAnnotations')
      .where('submissionId', '==', submissionId)
      .get();

    if (snapshot.empty) return { annotations: [], error: null };

    const annotations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        annotatedAt: data.annotatedAt ? data.annotatedAt.toDate().toISOString() : null,
      };
    });

    // Fetch annotator display names
    const annotatorIds = [...new Set(annotations.map(a => a.annotatorId))];
    const profileDocs  = await Promise.all(
      annotatorIds.map(uid => db.collection('users').doc(uid).get())
    );
    const nameMap = {};
    profileDocs.forEach(doc => {
      if (doc.exists) nameMap[doc.id] = doc.data().fullName || doc.data().email || doc.id;
    });

    const enriched = annotations.map(a => ({
      ...a,
      annotatorName: nameMap[a.annotatorId] || a.annotatorId,
    }));

    return { annotations: enriched, error: null };
  } catch (error) {
    console.error('❌ Error getting all annotations:', error);
    return { annotations: [], error: error.message };
  }
}

/**
 * Verify that a userId has isAdmin: true in their profile.
 * Returns { isAdmin: boolean, error }.
 */
async function verifyAdmin(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return { isAdmin: false, error: 'user_not_found' };
    return { isAdmin: doc.data().isAdmin === true, error: null };
  } catch (error) {
    return { isAdmin: false, error: error.message };
  }
}

export {
  admin,
  db,
  auth,
  saveConversation,
  saveMessage,
  createUserProfile,
  getUserProfile,
  getAllConversations,
  saveTestSubmission,
  checkTestSubmission,
  verifyAnnotator,
  verifyAdmin,
  getTestSubmissions,
  getTestSubmission,
  saveTestAnnotation,
  getTestAnnotation,
  getAllAnnotationsForSubmission,
};

export default admin;
