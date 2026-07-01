// Firebase Admin SDK initialization for backend
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'ella-gpteach-research',
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
    if (!doc.exists) {
      console.warn(`[verifyAnnotator] user not found: ${userId}`);
      return { isAnnotator: false, error: 'user_not_found' };
    }
    const result = doc.data().isAnnotator === true;
    console.log(`[verifyAnnotator] uid=${userId} isAnnotator=${result} data=`, JSON.stringify(doc.data()));
    return { isAnnotator: result, error: null };
  } catch (error) {
    console.error(`[verifyAnnotator] Firestore error for uid=${userId}:`, error.message);
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
        profileMap[doc.id] = {
          fullName: d.fullName || '',
          email: d.email || '',
          researchParticipantLabel: d.researchParticipantLabel || '',
          showInResearchConversations: !!d.showInResearchConversations,
        };
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

    const enriched = submissions.map(s => {
      const profile = profileMap[s.userId] || {};
      return {
        ...s,
        teacherName:                profile.fullName || '',
        teacherEmail:               profile.email || '',
        researchParticipantLabel:   profile.researchParticipantLabel || '',
        showInResearchConversations: !!profile.showInResearchConversations,
        submittedAt:                s.submittedAt ? s.submittedAt.toDate().toISOString() : null,
        annotationCount:            s.annotationCount || 0,
        annotatedByMe:              annotatedByMeSet.has(s.id),
      };
    });

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
    if (!doc.exists) {
      console.warn(`[verifyAdmin] user not found: ${userId}`);
      return { isAdmin: false, error: 'user_not_found' };
    }
    const result = doc.data().isAdmin === true;
    console.log(`[verifyAdmin] uid=${userId} isAdmin=${result} data=`, JSON.stringify(doc.data()));
    return { isAdmin: result, error: null };
  } catch (error) {
    console.error(`[verifyAdmin] Firestore error for uid=${userId}:`, error.message);
    return { isAdmin: false, error: error.message };
  }
}

// ─── Research management (admin-SDK, bypasses Firestore rules) ───────────────

const tsToStr = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v);

function serializeUser(doc) {
  const d = doc.data ? doc.data() : doc;
  return {
    id: doc.id || d.id,
    ...d,
    createdAt: tsToStr(d.createdAt),
    updatedAt: tsToStr(d.updatedAt),
  };
}

function serializeConversation(doc) {
  const d = doc.data ? doc.data() : doc;
  return {
    id: doc.id || d.id,
    ...d,
    startedAt:   tsToStr(d.startedAt),
    lastUpdated: tsToStr(d.lastUpdated),
    savedAt:     tsToStr(d.savedAt),
  };
}

async function getAllUsersAdmin() {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(serializeUser);
    return { users, error: null };
  } catch (error) {
    console.error('❌ Error getting all users:', error);
    return { users: [], error: error.message };
  }
}

async function getResearchParticipantsAdmin() {
  try {
    const snapshot = await db.collection('users')
      .where('showInResearchConversations', '==', true)
      .get();
    const users = snapshot.docs
      .map(serializeUser)
      .sort((a, b) => (a.researchParticipantOrder || 0) - (b.researchParticipantOrder || 0));
    return { users, error: null };
  } catch (error) {
    console.error('❌ Error getting research participants:', error);
    return { users: [], error: error.message };
  }
}

async function updateUserResearchStatusAdmin(userId, updates) {
  try {
    await db.collection('users').doc(userId).set(updates, { merge: true });
    return { error: null };
  } catch (error) {
    console.error('❌ Error updating user research status:', error);
    return { error: error.message };
  }
}

async function getConversationsByUserAdmin(userId) {
  try {
    const snapshot = await db.collection('conversations')
      .where('userId', '==', userId)
      .get();
    const conversations = snapshot.docs.map(serializeConversation);
    conversations.sort((a, b) => {
      const ta = a.startTime || a.startedAt || '';
      const tb = b.startTime || b.startedAt || '';
      return String(tb).localeCompare(String(ta));
    });
    return { conversations, error: null };
  } catch (error) {
    console.error('❌ Error getting user conversations:', error);
    return { conversations: [], error: error.message };
  }
}

// ─── Conversation Annotation Module ─────────────────────────────────────────

/**
 * Pick only metadata fields from a conversation document (no turns / messages).
 */
function serializeConversationMeta(doc) {
  const d = doc.data ? doc.data() : doc;
  const id = doc.id || d.id;
  return {
    id,
    userId:        d.userId        || null,
    userSnapshot:  d.userSnapshot  || null,
    scenario: d.scenario
      ? { text: d.scenario.text || null, misconception_focus: d.scenario.misconception_focus || null }
      : null,
    systemVersion: d.systemVersion || null,
    startTime:     d.startTime     || null,
    startedAt:     tsToStr(d.startedAt),
    lastUpdated:   tsToStr(d.lastUpdated),
    stats:         d.stats         || null,
  };
}

/**
 * List conversations — metadata only (no turns / messages).
 * Supports optional filters: userId, systemVersion.
 * Each conversation is enriched with assignmentInfo: count, annotators, types, derivedStatus.
 * derivedStatus values: 'none' | 'assigned' | 'in_progress' | 'partial' | 'done'
 */
async function getConversationsMeta(filters = {}, limitCount = 300) {
  try {
    let query = db.collection('conversations');
    if (filters.userId)        query = query.where('userId',        '==', filters.userId);
    if (filters.systemVersion) query = query.where('systemVersion', '==', filters.systemVersion);

    const snapshot = await query.limit(limitCount).get();
    const conversations = snapshot.docs.map(serializeConversationMeta);

    // Sort newest-first in JS to avoid requiring a composite index
    conversations.sort((a, b) => {
      const ta = a.startTime || a.startedAt || '';
      const tb = b.startTime || b.startedAt || '';
      return String(tb).localeCompare(String(ta));
    });

    if (conversations.length === 0) return { conversations, error: null };

    // Fetch ALL assignments in one go and group by conversationId in memory.
    // This is simpler than chunked 'in' queries and fine for v1 volumes.
    const allAssignSnap = await db.collection('conversationAnnotationAssignments').get();
    const assignmentsByConvId = {};
    allAssignSnap.docs.forEach(d => {
      const data = d.data();
      const cid  = data.conversationId;
      if (!assignmentsByConvId[cid]) assignmentsByConvId[cid] = [];
      assignmentsByConvId[cid].push({ id: d.id, ...data });
    });

    // Collect unique annotator IDs and fetch display names
    const allAnnotatorIds = [
      ...new Set(
        Object.values(assignmentsByConvId).flat().map(a => a.annotatorId).filter(Boolean)
      ),
    ];
    const nameMap = {};
    if (allAnnotatorIds.length > 0) {
      const userDocs = await Promise.all(
        allAnnotatorIds.map(uid => db.collection('users').doc(uid).get())
      );
      userDocs.forEach(d => {
        if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id;
      });
    }

    // Enrich each conversation
    const enriched = conversations.map(conv => {
      const assignments = assignmentsByConvId[conv.id] || [];
      if (assignments.length === 0) {
        return { ...conv, assignmentInfo: { count: 0, annotators: [], types: [], derivedStatus: 'none' } };
      }

      const statuses     = assignments.map(a => a.status);
      const types        = [...new Set(assignments.map(a => a.assignmentType).filter(Boolean))];
      const annotatorIds = [...new Set(assignments.map(a => a.annotatorId).filter(Boolean))];
      const annotators   = annotatorIds.map(id => nameMap[id] || id);

      const allDone      = statuses.every(s => s === 'completed');
      const someDone     = statuses.some(s => s === 'completed');
      const someDraft    = statuses.some(s => s === 'draft');
      const derivedStatus = allDone  ? 'done'
                          : someDone ? 'partial'
                          : someDraft ? 'in_progress'
                          : 'assigned';

      return { ...conv, assignmentInfo: { count: assignments.length, annotators, annotatorIds, types, derivedStatus } };
    });

    return { conversations: enriched, error: null };
  } catch (error) {
    console.error('❌ Error getting conversations meta:', error);
    return { conversations: [], error: error.message };
  }
}

/**
 * Return the full conversation document, but only if the requester is an admin
 * OR has at least one assignment for that conversationId.
 * Returns { conversation, error, forbidden }.
 */
async function getFullConversationForAnnotation(convId, requesterId, isAdminUser) {
  try {
    if (!isAdminUser) {
      const assignmentSnap = await db.collection('conversationAnnotationAssignments')
        .where('conversationId', '==', convId)
        .where('annotatorId',   '==', requesterId)
        .limit(1)
        .get();
      if (assignmentSnap.empty) {
        return { conversation: null, error: 'access_denied', forbidden: true };
      }
    }

    const docSnap = await db.collection('conversations').doc(convId).get();
    if (!docSnap.exists) return { conversation: null, error: 'not_found', forbidden: false };

    const d = docSnap.data();
    return {
      conversation: {
        id: docSnap.id,
        ...d,
        startedAt:   tsToStr(d.startedAt),
        lastUpdated: tsToStr(d.lastUpdated),
        savedAt:     tsToStr(d.savedAt),
      },
      error: null,
      forbidden: false,
    };
  } catch (error) {
    console.error('❌ Error getting full conversation for annotation:', error);
    return { conversation: null, error: error.message, forbidden: false };
  }
}

/**
 * Bulk-create annotation assignments.
 * items: [{ conversationId, annotatorId, assignmentType }]
 * Duplicate rule: one assignment per conversationId + annotatorId (regardless of assignmentType).
 * Skipped items include { existingType, existingAssignmentId } so the caller can surface a
 * clear message to the admin.
 * Returns { created: [], skipped: [], error }.
 */
async function createAnnotationAssignments(items, createdBy) {
  try {
    const created = [];
    const skipped = [];

    for (const item of items) {
      const { conversationId, annotatorId, assignmentType } = item;

      // Strict duplicate check: same conversationId + annotatorId, any assignmentType
      const existingSnap = await db.collection('conversationAnnotationAssignments')
        .where('conversationId', '==', conversationId)
        .where('annotatorId',   '==', annotatorId)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const existingData = existingSnap.docs[0].data();
        skipped.push({
          conversationId,
          annotatorId,
          assignmentType,
          reason:               'duplicate',
          existingType:         existingData.assignmentType,
          existingAssignmentId: existingSnap.docs[0].id,
        });
        continue;
      }

      const ref = await db.collection('conversationAnnotationAssignments').add({
        conversationId,
        annotatorId,
        assignmentType,
        status:      'not_started',
        createdBy,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null,
      });

      created.push({ assignmentId: ref.id, conversationId, annotatorId, assignmentType });
    }

    return { created, skipped, error: null };
  } catch (error) {
    console.error('❌ Error creating annotation assignments:', error);
    return { created: [], skipped: [], error: error.message };
  }
}

/**
 * Admin: list all assignments enriched with annotator name and conversation metadata.
 * Supports optional filter: status, assignmentType.
 */
async function getAnnotationAssignments(filters = {}) {
  try {
    let query = db.collection('conversationAnnotationAssignments');
    if (filters.status)         query = query.where('status',         '==', filters.status);
    if (filters.assignmentType) query = query.where('assignmentType', '==', filters.assignmentType);

    const snapshot = await query.get();
    const assignments = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id:             doc.id,
        ...d,
        createdAt:   tsToStr(d.createdAt),
        updatedAt:   tsToStr(d.updatedAt),
        completedAt: tsToStr(d.completedAt),
      };
    });

    if (assignments.length === 0) return { assignments: [], error: null };

    // Enrich with annotator names
    const annotatorIds = [...new Set(assignments.map(a => a.annotatorId))];
    const convIds      = [...new Set(assignments.map(a => a.conversationId))];

    const [annotatorDocs, convDocs] = await Promise.all([
      Promise.all(annotatorIds.map(uid => db.collection('users').doc(uid).get())),
      Promise.all(convIds.map(cid => db.collection('conversations').doc(cid).get())),
    ]);

    const nameMap = {};
    annotatorDocs.forEach(d => {
      if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id;
    });

    const convMetaMap = {};
    convDocs.forEach(d => {
      if (d.exists) convMetaMap[d.id] = serializeConversationMeta(d);
    });

    const enriched = assignments.map(a => ({
      ...a,
      annotatorName: nameMap[a.annotatorId] || a.annotatorId,
      convMeta:      convMetaMap[a.conversationId] || null,
    }));

    enriched.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return { assignments: enriched, error: null };
  } catch (error) {
    console.error('❌ Error getting annotation assignments:', error);
    return { assignments: [], error: error.message };
  }
}

/**
 * Annotator: list only my assignments, enriched with conversation metadata.
 */
async function getAnnotatorAssignments(annotatorId) {
  try {
    const snapshot = await db.collection('conversationAnnotationAssignments')
      .where('annotatorId', '==', annotatorId)
      .get();

    const assignments = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id:          doc.id,
        ...d,
        createdAt:   tsToStr(d.createdAt),
        updatedAt:   tsToStr(d.updatedAt),
        completedAt: tsToStr(d.completedAt),
      };
    });

    if (assignments.length === 0) return { assignments: [], error: null };

    const convIds = [...new Set(assignments.map(a => a.conversationId))];
    const convDocs = await Promise.all(convIds.map(cid => db.collection('conversations').doc(cid).get()));

    const convMetaMap = {};
    convDocs.forEach(d => {
      if (d.exists) convMetaMap[d.id] = serializeConversationMeta(d);
    });

    const enriched = assignments.map(a => ({
      ...a,
      convMeta: convMetaMap[a.conversationId] || null,
    }));

    enriched.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return { assignments: enriched, error: null };
  } catch (error) {
    console.error('❌ Error getting annotator assignments:', error);
    return { assignments: [], error: error.message };
  }
}

/**
 * Fetch annotation doc by assignmentId.
 * Returns null if not yet started. Checks ownership (or admin).
 * Returns { annotation, error, forbidden }.
 */
async function getConvAnnotation(assignmentId, requesterId, isAdminUser) {
  try {
    // Verify ownership via the assignment doc
    if (!isAdminUser) {
      const assignSnap = await db.collection('conversationAnnotationAssignments').doc(assignmentId).get();
      if (!assignSnap.exists) return { annotation: null, error: 'assignment_not_found', forbidden: false };
      if (assignSnap.data().annotatorId !== requesterId) {
        return { annotation: null, error: 'access_denied', forbidden: true };
      }
    }

    const docSnap = await db.collection('conversationAnnotations').doc(assignmentId).get();
    if (!docSnap.exists) return { annotation: null, error: null, forbidden: false };

    const d = docSnap.data();
    return {
      annotation: {
        id: docSnap.id,
        ...d,
        createdAt:   tsToStr(d.createdAt),
        updatedAt:   tsToStr(d.updatedAt),
        submittedAt: tsToStr(d.submittedAt),
      },
      error: null,
      forbidden: false,
    };
  } catch (error) {
    console.error('❌ Error getting conv annotation:', error);
    return { annotation: null, error: error.message, forbidden: false };
  }
}

/**
 * Save (upsert) a conversation annotation draft.
 * Verifies annotator ownership. Updates assignment status to "draft".
 * Returns { annotationId, error, forbidden }.
 */
async function saveConvAnnotation(assignmentId, data, requesterId) {
  try {
    // Verify ownership
    const assignSnap = await db.collection('conversationAnnotationAssignments').doc(assignmentId).get();
    if (!assignSnap.exists) return { annotationId: null, error: 'assignment_not_found', forbidden: false };
    const assignData = assignSnap.data();
    if (assignData.annotatorId !== requesterId) {
      return { annotationId: null, error: 'access_denied', forbidden: true };
    }
    if (assignData.status === 'completed') {
      return { annotationId: null, error: 'assignment_already_completed', forbidden: false };
    }

    const annotationRef = db.collection('conversationAnnotations').doc(assignmentId);
    const existing = await annotationRef.get();

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (existing.exists) {
      await annotationRef.update({
        ...data,
        updatedAt: now,
        status: 'draft',
      });
    } else {
      await annotationRef.set({
        assignmentId,
        conversationId: assignData.conversationId,
        annotatorId:    requesterId,
        assignmentType: assignData.assignmentType,
        ...data,
        status:      'draft',
        createdAt:   now,
        updatedAt:   now,
        submittedAt: null,
      });
    }

    // Mark assignment as draft
    await db.collection('conversationAnnotationAssignments').doc(assignmentId).update({
      status:    'draft',
      updatedAt: now,
    });

    return { annotationId: assignmentId, error: null, forbidden: false };
  } catch (error) {
    console.error('❌ Error saving conv annotation:', error);
    return { annotationId: null, error: error.message, forbidden: false };
  }
}

/**
 * Submit a conversation annotation (mark completed).
 * Verifies ownership. Sets status="completed" on both annotation and assignment.
 * Returns { error, forbidden }.
 */
async function submitConvAnnotation(assignmentId, requesterId) {
  try {
    const assignSnap = await db.collection('conversationAnnotationAssignments').doc(assignmentId).get();
    if (!assignSnap.exists) return { error: 'assignment_not_found', forbidden: false };
    const assignData = assignSnap.data();
    if (assignData.annotatorId !== requesterId) return { error: 'access_denied', forbidden: true };
    if (assignData.status === 'completed') return { error: 'already_completed', forbidden: false };

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Upsert annotation doc if it doesn't exist yet (annotator may submit with 0 feedback points)
    const annotationRef = db.collection('conversationAnnotations').doc(assignmentId);
    const existing = await annotationRef.get();

    if (existing.exists) {
      await annotationRef.update({ status: 'completed', submittedAt: now, updatedAt: now });
    } else {
      await annotationRef.set({
        assignmentId,
        conversationId: assignData.conversationId,
        annotatorId:    requesterId,
        assignmentType: assignData.assignmentType,
        feedbackPoints:  [],
        generalComment:  '',
        status:          'completed',
        createdAt:       now,
        updatedAt:       now,
        submittedAt:     now,
      });
    }

    await db.collection('conversationAnnotationAssignments').doc(assignmentId).update({
      status:      'completed',
      completedAt: now,
      updatedAt:   now,
    });

    return { error: null, forbidden: false };
  } catch (error) {
    console.error('❌ Error submitting conv annotation:', error);
    return { error: error.message, forbidden: false };
  }
}

/**
 * Export all conversation annotations structured for agreement analysis.
 * Grouped by: conversationId → assignmentType → per annotator entry.
 */
async function exportConvAnnotations() {
  try {
    // Load all assignments and annotations in parallel
    const [assignSnap, annotSnap] = await Promise.all([
      db.collection('conversationAnnotationAssignments').get(),
      db.collection('conversationAnnotations').get(),
    ]);

    const assignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: tsToStr(d.data().createdAt), updatedAt: tsToStr(d.data().updatedAt), completedAt: tsToStr(d.data().completedAt) }));
    const annotMap   = {};
    annotSnap.docs.forEach(d => {
      const data = d.data();
      annotMap[d.id] = {
        ...data,
        createdAt:   tsToStr(data.createdAt),
        updatedAt:   tsToStr(data.updatedAt),
        submittedAt: tsToStr(data.submittedAt),
      };
    });

    if (assignments.length === 0) return { export: { exportedAt: new Date().toISOString(), conversations: {} }, error: null };

    // Collect unique annotator IDs and conversation IDs
    const annotatorIds = [...new Set(assignments.map(a => a.annotatorId))];
    const convIds      = [...new Set(assignments.map(a => a.conversationId))];

    const [annotatorDocs, convDocs] = await Promise.all([
      Promise.all(annotatorIds.map(uid => db.collection('users').doc(uid).get())),
      Promise.all(convIds.map(cid => db.collection('conversations').doc(cid).get())),
    ]);

    const nameMap = {};
    annotatorDocs.forEach(d => {
      if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id;
    });
    const convMetaMap = {};
    convDocs.forEach(d => {
      if (d.exists) convMetaMap[d.id] = serializeConversationMeta(d);
    });

    // Build nested structure
    const conversations = {};
    for (const assignment of assignments) {
      const { conversationId, assignmentType, annotatorId } = assignment;
      if (!conversations[conversationId]) {
        const meta = convMetaMap[conversationId] || {};
        conversations[conversationId] = {
          meta: {
            scenarioTitle: (meta.scenario && meta.scenario.text) || null,
            userName: (meta.userSnapshot && meta.userSnapshot.fullName) || null,
            startedAt: meta.startedAt || meta.startTime || null,
            systemVersion: meta.systemVersion || null,
            totalTurns: (meta.stats && meta.stats.totalTeacherMessages) || null,
          },
          byType: {},
        };
      }
      if (!conversations[conversationId].byType[assignmentType]) {
        conversations[conversationId].byType[assignmentType] = [];
      }

      const annotation = annotMap[assignment.id] || null;
      conversations[conversationId].byType[assignmentType].push({
        assignmentId:  assignment.id,
        annotatorId,
        annotatorName: nameMap[annotatorId] || annotatorId,
        status:        assignment.status,
        submittedAt:   annotation ? annotation.submittedAt : null,
        generalComment: annotation ? (annotation.generalComment || '') : '',
        feedbackPoints: annotation ? (annotation.feedbackPoints || []) : [],
      });
    }

    return {
      export: { exportedAt: new Date().toISOString(), conversations },
      error: null,
    };
  } catch (error) {
    console.error('❌ Error exporting conv annotations:', error);
    return { export: null, error: error.message };
  }
}

/**
 * Delete an assignment (admin only).
 * Also deletes the linked annotation document if one exists.
 * Returns { error } — error is null on success.
 */
async function cancelAnnotationAssignment(assignmentId) {
  try {
    const assignRef  = db.collection('conversationAnnotationAssignments').doc(assignmentId);
    const assignSnap = await assignRef.get();
    if (!assignSnap.exists) return { error: 'assignment_not_found' };

    // Delete the annotation document if it exists (assignmentId is the annotation doc ID)
    const annotRef  = db.collection('conversationAnnotations').doc(assignmentId);
    const annotSnap = await annotRef.get();

    const batch = db.batch();
    batch.delete(assignRef);
    if (annotSnap.exists) batch.delete(annotRef);
    await batch.commit();

    return { error: null };
  } catch (error) {
    console.error('❌ Error deleting assignment:', error);
    return { error: error.message };
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
  getAllUsersAdmin,
  getResearchParticipantsAdmin,
  updateUserResearchStatusAdmin,
  getConversationsByUserAdmin,
  // Conversation annotation module
  getConversationsMeta,
  getFullConversationForAnnotation,
  createAnnotationAssignments,
  getAnnotationAssignments,
  getAnnotatorAssignments,
  getConvAnnotation,
  saveConvAnnotation,
  submitConvAnnotation,
  exportConvAnnotations,
  cancelAnnotationAssignment,
};

export default admin;
