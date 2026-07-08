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

    const [annotatorDocs, convDocs, annotDocs] = await Promise.all([
      Promise.all(annotatorIds.map(uid => db.collection('users').doc(uid).get())),
      Promise.all(convIds.map(cid => db.collection('conversations').doc(cid).get())),
      // Annotation doc ID equals assignment ID — batch-fetch for progress indicators
      Promise.all(assignments.map(a => db.collection('conversationAnnotations').doc(a.id).get())),
    ]);

    const nameMap = {};
    annotatorDocs.forEach(d => {
      if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id;
    });

    const convMetaMap = {};
    convDocs.forEach(d => {
      if (d.exists) convMetaMap[d.id] = serializeConversationMeta(d);
    });

    // Summary data from annotation docs (annotated distinct turns + last update time)
    const annotSummaryMap = {};
    annotDocs.forEach(d => {
      if (d.exists) {
        const data = d.data();
        const fps = data.feedbackPoints || [];
        // Count unique turn numbers that have at least one feedback point
        const annotatedTurnCount = new Set(
          fps.map(fp => fp.turnNumber).filter(n => n != null)
        ).size;
        annotSummaryMap[d.id] = {
          annotatedTurnCount,
          annotationUpdatedAt: tsToStr(data.updatedAt),
        };
      }
    });

    const enriched = assignments.map(a => ({
      ...a,
      annotatorName:       nameMap[a.annotatorId] || a.annotatorId,
      convMeta:            convMetaMap[a.conversationId] || null,
      annotatedTurnCount:  annotSummaryMap[a.id] ? annotSummaryMap[a.id].annotatedTurnCount  : 0,
      annotationUpdatedAt: annotSummaryMap[a.id] ? annotSummaryMap[a.id].annotationUpdatedAt : null,
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

// ─── Agreement Analysis ──────────────────────────────────────────────────────

/** Build an admin-enriched two-line conversation label for reports and disagreements.
 *  Line 1: scenario title (up to 70 chars)
 *  Line 2: userName · date  (if available)
 *  Returns a single string with '\n' separator so the frontend can split and style each line. */
function buildAdminConvLabel(convMeta, convId) {
  const title = (convMeta && convMeta.scenario && convMeta.scenario.text)
    ? convMeta.scenario.text.slice(0, 70)
    : (convId || '').slice(0, 12);

  const userName = (convMeta && convMeta.userSnapshot && convMeta.userSnapshot.fullName)
    || (convMeta && convMeta.userId ? convMeta.userId.slice(0, 8) : null);

  const rawDate = convMeta && (convMeta.startedAt || convMeta.startTime);
  let dateStr = null;
  if (rawDate) {
    try {
      const d = new Date(typeof rawDate === 'string' ? rawDate : rawDate.toDate ? rawDate.toDate() : rawDate);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        dateStr = `${dd}.${mm}.${yyyy}`;
      }
    } catch { /* ignore */ }
  }

  const subtitle = [userName, dateStr].filter(Boolean).join(' · ');
  return subtitle ? `${title}\n${subtitle}` : title;
}

const AGREEMENT_PCK_SKILLS = [
  { id: 'p1', label: 'זיהוי השגיאה' },
  { id: 'p2', label: 'אפיון השגיאה' },
  { id: 'p3', label: 'פרשנות' },
  { id: 'p4', label: 'תגובה פדגוגית' },
  { id: 'p5', label: 'מינוף' },
];

/** Extract the score for a specific PCK dimension from a list of feedback points
 *  (handles both new dimensionFeedback format and legacy scores object). */
function getScoreForDim(fps, dimId) {
  for (const fp of fps) {
    if (fp.dimensionFeedback && fp.dimensionFeedback[dimId] != null &&
        fp.dimensionFeedback[dimId].score != null) {
      return fp.dimensionFeedback[dimId].score;
    }
    if (fp.scores && fp.scores[dimId] != null) return fp.scores[dimId];
  }
  return null;
}

function round2(n) { return Math.round(n * 100) / 100; }

/** Cohen's kappa for binary (yes/no) outcomes. */
function cohensKappaBinary(bothYes, bothNo, onlyA, onlyB) {
  const total = bothYes + bothNo + onlyA + onlyB;
  if (total === 0) return null;
  const pO = (bothYes + bothNo) / total;
  const pA = (bothYes + onlyA) / total;
  const pB = (bothYes + onlyB) / total;
  const pE = pA * pB + (1 - pA) * (1 - pB);
  if (1 - pE < 0.0001) return 1.0;
  return round2((pO - pE) / (1 - pE));
}

/** Linearly weighted Cohen's kappa for ordinal 0/1/2 scores. */
function weightedKappaLinear(matrix) {
  const n = 3; const maxDiff = 2;
  let total = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) total += matrix[i][j];
  if (total === 0) return null;
  const rowM = Array(n).fill(0), colM = Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { rowM[i] += matrix[i][j]; colM[j] += matrix[i][j]; }
  let wObs = 0, wExp = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const w = 1 - Math.abs(i - j) / maxDiff;
    wObs += w * matrix[i][j] / total;
    wExp += w * (rowM[i] / total) * (colM[j] / total);
  }
  if (1 - wExp < 0.0001) return 1.0;
  return round2((wObs - wExp) / (1 - wExp));
}

/**
 * Returns conversations that have ≥2 completed reliability assignments,
 * enriched with annotator names and assignment IDs.
 */
async function getEligibleAgreementConversations() {
  try {
    const snap = await db.collection('conversationAnnotationAssignments')
      .where('assignmentType', '==', 'reliability')
      .where('status', '==', 'completed')
      .get();

    if (snap.empty) return { conversations: [], error: null };

    const byConv = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (!byConv[d.conversationId]) byConv[d.conversationId] = [];
      byConv[d.conversationId].push({ id: doc.id, annotatorId: d.annotatorId, completedAt: tsToStr(d.completedAt) });
    });

    const eligible = Object.entries(byConv)
      .filter(([, a]) => a.length >= 2)
      .map(([convId, assignments]) => ({ conversationId: convId, assignments }));

    if (eligible.length === 0) return { conversations: [], error: null };

    const convIds       = eligible.map(e => e.conversationId);
    const allAnnotatorIds = [...new Set(eligible.flatMap(e => e.assignments.map(a => a.annotatorId)))];

    const [convDocs, annotatorDocs] = await Promise.all([
      Promise.all(convIds.map(id => db.collection('conversations').doc(id).get())),
      Promise.all(allAnnotatorIds.map(id => db.collection('users').doc(id).get())),
    ]);

    const convMetaMap = {};
    convDocs.forEach(d => { if (d.exists) convMetaMap[d.id] = serializeConversationMeta(d); });

    const nameMap = {};
    annotatorDocs.forEach(d => {
      if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id;
    });

    const conversations = eligible.map(e => ({
      conversationId: e.conversationId,
      convMeta: convMetaMap[e.conversationId] || null,
      completedBy: e.assignments.map(a => ({
        annotatorId: a.annotatorId,
        annotatorName: nameMap[a.annotatorId] || a.annotatorId,
        assignmentId: a.id,
        completedAt: a.completedAt,
      })),
    }));

    return { conversations, error: null };
  } catch (error) {
    console.error('❌ Error getting eligible agreement conversations:', error);
    return { conversations: [], error: error.message };
  }
}

/** List all saved agreement reports (summary fields only). */
async function getAgreementReports() {
  try {
    const snap = await db.collection('annotationAgreementReports')
      .orderBy('createdAt', 'desc')
      .get();

    const reports = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        reportName: d.reportName || '—',
        createdAt: tsToStr(d.createdAt),
        createdBy: d.createdBy || '',
        conversationIds: d.conversationIds || [],
        annotatorIds: d.annotatorIds || [],
        annotatorNames: d.annotatorNames || {},
        summaryLocationKappa:
          d.metrics && d.metrics.locationAgreement ? d.metrics.locationAgreement.cohensKappa : null,
        summaryAvgDimKappa:
          d.metrics && d.metrics.summary ? d.metrics.summary.avgDimensionKappa : null,
      };
    });

    return { reports, error: null };
  } catch (error) {
    console.error('❌ Error getting agreement reports:', error);
    return { reports: [], error: error.message };
  }
}

/** Get a single agreement report with full metrics. */
async function getAgreementReport(reportId) {
  try {
    const doc = await db.collection('annotationAgreementReports').doc(reportId).get();
    if (!doc.exists) return { report: null, error: 'not_found' };
    const d = doc.data();

    // Enrich disagreements that are missing convLabel (e.g. reports saved before this field existed)
    const disagreements = d.disagreements || [];
    const needsEnrichment = disagreements.some(dis => !dis.convLabel);
    let enrichedDisagreements = disagreements;

    if (needsEnrichment && d.conversationIds && d.conversationIds.length > 0) {
      const convDocs = await Promise.all(
        d.conversationIds.map(id => db.collection('conversations').doc(id).get())
      );
      const convLabelMap = {};
      convDocs.forEach(convDoc => {
        if (convDoc.exists) {
          convLabelMap[convDoc.id] = buildAdminConvLabel(serializeConversationMeta(convDoc), convDoc.id);
        }
      });
      enrichedDisagreements = disagreements.map(dis => ({
        ...dis,
        convLabel: dis.convLabel || convLabelMap[dis.conversationId] || null,
      }));
    }

    return {
      report: {
        id: doc.id, ...d,
        disagreements: enrichedDisagreements,
        createdAt: tsToStr(d.createdAt),
        updatedAt: tsToStr(d.updatedAt),
      },
      error: null,
    };
  } catch (error) {
    console.error('❌ Error getting agreement report:', error);
    return { report: null, error: error.message };
  }
}

/**
 * Compute pairwise inter-rater agreement metrics for exactly two annotators
 * across the selected conversations, then persist as a new report document.
 *
 * @param {{ reportName, conversationIds, annotatorIds, includedAssignmentIds }} params
 * @param {string} adminId
 */
async function computeAndSaveAgreementReport(
  { reportName, conversationIds, annotatorIds, includedAssignmentIds },
  adminId
) {
  try {
    const [uidA, uidB] = annotatorIds;

    const [convDocs, annotDocs, assignDocs, annotatorUserDocs] = await Promise.all([
      Promise.all(conversationIds.map(id => db.collection('conversations').doc(id).get())),
      Promise.all(includedAssignmentIds.map(id => db.collection('conversationAnnotations').doc(id).get())),
      Promise.all(includedAssignmentIds.map(id => db.collection('conversationAnnotationAssignments').doc(id).get())),
      Promise.all(annotatorIds.map(id => db.collection('users').doc(id).get())),
    ]);

    // Name map
    const nameMap = {};
    annotatorUserDocs.forEach(d => {
      if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id;
    });
    const annotatorNames = { [uidA]: nameMap[uidA] || uidA, [uidB]: nameMap[uidB] || uidB };
    const nameA = annotatorNames[uidA], nameB = annotatorNames[uidB];

    // Conversation data
    const convDataMap = {};
    convDocs.forEach(d => {
      if (d.exists) {
        const data = d.data();
        convDataMap[d.id] = {
          turns: (data.turns || []).sort((a, b) => (a.turnNumber || 0) - (b.turnNumber || 0)),
          convMeta: serializeConversationMeta(d),
        };
      }
    });

    // Map assignmentId -> { annotatorId, conversationId }
    const assignMetaMap = {};
    assignDocs.forEach(d => {
      if (d.exists) {
        const data = d.data();
        assignMetaMap[d.id] = { annotatorId: data.annotatorId, conversationId: data.conversationId };
      }
    });

    // Map `${convId}:${annotatorId}` -> feedbackPoints[]
    const fpMap = {};
    annotDocs.forEach(d => {
      if (d.exists) {
        const data = d.data();
        const meta = assignMetaMap[d.id];
        if (meta) fpMap[`${meta.conversationId}:${meta.annotatorId}`] = data.feedbackPoints || [];
      }
    });

    // ── Compute metrics ─────────────────────────────────────────────────────
    const locAgg = { bothMarked: 0, neitherMarked: 0, onlyA: 0, onlyB: 0 };
    const dimAgg = {}, scoreAgg = {};
    AGREEMENT_PCK_SKILLS.forEach(({ id }) => {
      dimAgg[id]   = { bothSelected: 0, neitherSelected: 0, onlyA: 0, onlyB: 0, turnsAnalyzed: 0 };
      scoreAgg[id] = { confusionMatrix: [[0,0,0],[0,0,0],[0,0,0]], cases: 0, exactMatch: 0, totalDiff: 0 };
    });
    const disagreements = [];
    let totalTeacherTurns = 0;

    // Only include conversations where we have data for BOTH annotators
    const analysisCovIds = conversationIds.filter(
      cid => fpMap[`${cid}:${uidA}`] !== undefined || fpMap[`${cid}:${uidB}`] !== undefined
    );

    for (const convId of analysisCovIds) {
      const conv = convDataMap[convId];
      if (!conv || !conv.turns || conv.turns.length === 0) continue;

      const fpA = fpMap[`${convId}:${uidA}`] || [];
      const fpB = fpMap[`${convId}:${uidB}`] || [];

      const scenarioTitle = (conv.convMeta && conv.convMeta.scenario && conv.convMeta.scenario.text)
        ? conv.convMeta.scenario.text.slice(0, 65)
        : convId.slice(0, 12);
      // Admin-enriched label (scenario title + userName + date, '\n'-separated)
      const convLabel = buildAdminConvLabel(conv.convMeta, convId);

      const turnsA = new Set(fpA.map(fp => fp.turnNumber).filter(n => n != null));
      const turnsB = new Set(fpB.map(fp => fp.turnNumber).filter(n => n != null));

      for (const turn of conv.turns) {
        const turnNum = turn.turnNumber;
        if (turnNum == null) continue;
        totalTeacherTurns++;

        const aMarked = turnsA.has(turnNum), bMarked = turnsB.has(turnNum);

        // ── Location ─────────────────────────────────────────────────────────
        if (aMarked && bMarked) {
          locAgg.bothMarked++;
        } else if (!aMarked && !bMarked) {
          locAgg.neitherMarked++;
        } else if (aMarked) {
          locAgg.onlyA++;
          disagreements.push({ conversationId: convId, scenarioTitle, convLabel, turnNumber: turnNum, type: 'location', details: `נקודת משוב סומנה רק על ידי ${nameA}` });
        } else {
          locAgg.onlyB++;
          disagreements.push({ conversationId: convId, scenarioTitle, convLabel, turnNumber: turnNum, type: 'location', details: `נקודת משוב סומנה רק על ידי ${nameB}` });
        }

        // ── Dimension + score (only for turns where at least one marked) ──────
        if (aMarked || bMarked) {
          const fpAT = fpA.filter(fp => fp.turnNumber === turnNum);
          const fpBT = fpB.filter(fp => fp.turnNumber === turnNum);
          const dimsA = new Set(fpAT.flatMap(fp => fp.selectedDimensions || []));
          const dimsB = new Set(fpBT.flatMap(fp => fp.selectedDimensions || []));

          for (const { id: dimId, label: dimLabel } of AGREEMENT_PCK_SKILLS) {
            const aSelected = dimsA.has(dimId), bSelected = dimsB.has(dimId);
            dimAgg[dimId].turnsAnalyzed++;

            if (aSelected && bSelected)      dimAgg[dimId].bothSelected++;
            else if (!aSelected && !bSelected) dimAgg[dimId].neitherSelected++;
            else if (aSelected) {
              dimAgg[dimId].onlyA++;
              disagreements.push({ conversationId: convId, scenarioTitle, convLabel, turnNumber: turnNum, type: 'dimension', details: `הממד ${dimLabel} סומן רק על ידי ${nameA}` });
            } else {
              dimAgg[dimId].onlyB++;
              disagreements.push({ conversationId: convId, scenarioTitle, convLabel, turnNumber: turnNum, type: 'dimension', details: `הממד ${dimLabel} סומן רק על ידי ${nameB}` });
            }

            // Score comparison only when both selected this dimension
            if (aSelected && bSelected) {
              const scoreA = getScoreForDim(fpAT, dimId);
              const scoreB = getScoreForDim(fpBT, dimId);
              if (scoreA != null && scoreB != null) {
                scoreAgg[dimId].cases++;
                if (scoreA === scoreB) scoreAgg[dimId].exactMatch++;
                scoreAgg[dimId].totalDiff += Math.abs(scoreA - scoreB);
                scoreAgg[dimId].confusionMatrix[scoreA][scoreB]++;
                if (scoreA !== scoreB) {
                  disagreements.push({ conversationId: convId, scenarioTitle, convLabel, turnNumber: turnNum, type: 'score', details: `${dimLabel}: ציון ${scoreA} אצל ${nameA}, ציון ${scoreB} אצל ${nameB}` });
                }
              }
            }
          }
        }
      }
    }

    // ── Aggregate into report metrics ────────────────────────────────────────
    const locTotal = locAgg.bothMarked + locAgg.neitherMarked + locAgg.onlyA + locAgg.onlyB;
    const locationAgreement = {
      ...locAgg,
      totalTurns: locTotal,
      percentAgreement: locTotal > 0 ? round2((locAgg.bothMarked + locAgg.neitherMarked) / locTotal) : null,
      cohensKappa: cohensKappaBinary(locAgg.bothMarked, locAgg.neitherMarked, locAgg.onlyA, locAgg.onlyB),
    };

    const dimensionAgreement = {};
    const dimKappas = [];
    AGREEMENT_PCK_SKILLS.forEach(({ id: dimId, label }) => {
      const d = dimAgg[dimId];
      const pct = d.turnsAnalyzed > 0 ? round2((d.bothSelected + d.neitherSelected) / d.turnsAnalyzed) : null;
      const kappa = cohensKappaBinary(d.bothSelected, d.neitherSelected, d.onlyA, d.onlyB);
      dimensionAgreement[dimId] = { label, ...d, percentAgreement: pct, cohensKappa: kappa };
      if (kappa != null) dimKappas.push({ id: dimId, label, kappa });
    });

    const scoreAgreement = {};
    const wKappas = [];
    AGREEMENT_PCK_SKILLS.forEach(({ id: dimId, label }) => {
      const s = scoreAgg[dimId];
      const wk = weightedKappaLinear(s.confusionMatrix);
      scoreAgreement[dimId] = {
        label,
        comparableCases: s.cases,
        exactAgreement:        s.cases > 0 ? s.exactMatch  : 0,
        exactAgreementPercent: s.cases > 0 ? round2(s.exactMatch / s.cases) : null,
        meanAbsoluteDiff:      s.cases > 0 ? round2(s.totalDiff / s.cases)  : null,
        weightedKappa: wk,
        // Firestore doesn't support arrays-of-arrays; flatten to row-major 9-element array
        confusionMatrix: s.confusionMatrix.flat(),
      };
      if (wk != null) wKappas.push(wk);
    });

    const mostDisagreedDim = AGREEMENT_PCK_SKILLS.reduce((worst, { id, label }) => {
      const cnt = dimAgg[id].onlyA + dimAgg[id].onlyB;
      return (!worst || cnt > worst.count) ? { id, label, count: cnt } : worst;
    }, null);

    const avgDimKappas = dimKappas.filter(d => d.kappa != null);
    const metrics = {
      totalConversations: analysisCovIds.length,
      totalTeacherTurns,
      locationAgreement,
      dimensionAgreement,
      scoreAgreement,
      summary: {
        avgDimensionKappa: avgDimKappas.length > 0
          ? round2(avgDimKappas.reduce((s, d) => s + d.kappa, 0) / avgDimKappas.length) : null,
        avgWeightedKappa: wKappas.length > 0
          ? round2(wKappas.reduce((s, k) => s + k, 0) / wKappas.length) : null,
        mostDisagreedDimension: mostDisagreedDim
          ? `${mostDisagreedDim.label} (${mostDisagreedDim.count} חוסר הסכמות)` : null,
      },
    };

    const reportData = {
      reportName: reportName || `דוח הסכמה – ${new Date().toLocaleDateString('he-IL')}`,
      createdBy: adminId,
      assignmentType: 'reliability',
      conversationIds,
      annotatorIds,
      annotatorNames,
      includedAssignmentIds,
      metrics,
      disagreements: disagreements.slice(0, 1000),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('annotationAgreementReports').add(reportData);

    return {
      reportId: docRef.id,
      report: { id: docRef.id, ...reportData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      error: null,
    };
  } catch (error) {
    console.error('❌ Error computing agreement report:', error);
    return { reportId: null, report: null, error: error.message };
  }
}

// ─── Annotation Comparison Sets ──────────────────────────────────────────────

/**
 * Returns all conversations that have ≥2 completed assignments (any type),
 * enriched with conv metadata and annotator names.
 */
async function getConversationsWithCompletedPairs() {
  try {
    const snap = await db.collection('conversationAnnotationAssignments')
      .where('status', '==', 'completed')
      .get();

    if (snap.empty) return { conversations: [], error: null };

    const byConv = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (!byConv[d.conversationId]) byConv[d.conversationId] = [];
      byConv[d.conversationId].push({
        id: doc.id, annotatorId: d.annotatorId,
        assignmentType: d.assignmentType, completedAt: tsToStr(d.completedAt),
      });
    });

    const eligible = Object.entries(byConv)
      .filter(([, a]) => a.length >= 2)
      .map(([convId, assignments]) => ({ conversationId: convId, assignments }));

    if (eligible.length === 0) return { conversations: [], error: null };

    const convIds        = eligible.map(e => e.conversationId);
    const allAnnotatorIds = [...new Set(eligible.flatMap(e => e.assignments.map(a => a.annotatorId)))];

    const [convDocs, annotatorDocs] = await Promise.all([
      Promise.all(convIds.map(id => db.collection('conversations').doc(id).get())),
      Promise.all(allAnnotatorIds.map(id => db.collection('users').doc(id).get())),
    ]);

    const convMetaMap = {};
    convDocs.forEach(d => { if (d.exists) convMetaMap[d.id] = serializeConversationMeta(d); });

    const nameMap = {};
    annotatorDocs.forEach(d => {
      if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id;
    });

    const TYPE_LABELS_MAP = {
      reliability: 'בדיקת הסכמה', production: 'תיוג רגיל', double_coded: 'תיוג כפול',
    };

    return {
      conversations: eligible.map(e => ({
        conversationId: e.conversationId,
        convMeta: convMetaMap[e.conversationId] || null,
        completedAssignments: e.assignments.map(a => ({
          assignmentId: a.id,
          annotatorId:  a.annotatorId,
          annotatorName: nameMap[a.annotatorId] || a.annotatorId,
          assignmentType: a.assignmentType,
          typeLabel: TYPE_LABELS_MAP[a.assignmentType] || a.assignmentType,
          completedAt: a.completedAt,
        })),
      })),
      error: null,
    };
  } catch (error) {
    console.error('❌ Error getting conversations with completed pairs:', error);
    return { conversations: [], error: error.message };
  }
}

async function createComparisonSet({ title, description, items, visibleToAnnotators }, adminId) {
  try {
    const data = {
      title: title || 'סט השוואה חדש',
      description: description || null,
      visibleToAnnotators: visibleToAnnotators === true,
      items: (items || []).map(item => ({
        conversationId: item.conversationId,
        assignmentIds: item.assignmentIds || [],
      })),
      createdBy: adminId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('annotationComparisonSets').add(data);
    return { setId: ref.id, error: null };
  } catch (error) {
    console.error('❌ Error creating comparison set:', error);
    return { setId: null, error: error.message };
  }
}

async function updateComparisonSet(setId, updates) {
  try {
    const allowed = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (updates.title             !== undefined) allowed.title             = updates.title;
    if (updates.description       !== undefined) allowed.description       = updates.description;
    if (updates.items             !== undefined) allowed.items             = updates.items;
    if (updates.visibleToAnnotators !== undefined) allowed.visibleToAnnotators = updates.visibleToAnnotators;
    await db.collection('annotationComparisonSets').doc(setId).update(allowed);
    return { error: null };
  } catch (error) {
    console.error('❌ Error updating comparison set:', error);
    return { error: error.message };
  }
}

async function deleteComparisonSet(setId) {
  try {
    await db.collection('annotationComparisonSets').doc(setId).delete();
    return { error: null };
  } catch (error) {
    console.error('❌ Error deleting comparison set:', error);
    return { error: error.message };
  }
}

async function getComparisonSets(isAdmin) {
  try {
    // Fetch all documents without a compound filter+orderBy to avoid requiring a composite index.
    // Filter and sort in JS instead.
    const snap = await db.collection('annotationComparisonSets').get();
    let sets = snap.docs
      .map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          title: d.title || '—',
          description: d.description || null,
          visibleToAnnotators: !!d.visibleToAnnotators,
          createdAt: tsToStr(d.createdAt),
          itemCount: (d.items || []).length,
          _createdAtRaw: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0,
        };
      })
      .filter(s => isAdmin || s.visibleToAnnotators)
      .sort((a, b) => b._createdAtRaw - a._createdAtRaw)
      .map(({ _createdAtRaw, ...s }) => s); // strip internal sort key

    return { sets, error: null };
  } catch (error) {
    console.error('❌ Error getting comparison sets:', error);
    return { sets: [], error: error.message };
  }
}

async function getComparisonSetDetail(setId, isAdmin) {
  try {
    const doc = await db.collection('annotationComparisonSets').doc(setId).get();
    if (!doc.exists) return { set: null, error: 'not_found' };
    const d = doc.data();
    if (!isAdmin && !d.visibleToAnnotators) return { set: null, error: 'access_denied' };

    const items    = d.items || [];
    const convIds  = [...new Set(items.map(item => item.conversationId))];
    const allAsgIds = [...new Set(items.flatMap(item => item.assignmentIds || []))];

    const [convDocs, asgDocs] = await Promise.all([
      Promise.all(convIds.map(id => db.collection('conversations').doc(id).get())),
      allAsgIds.length > 0
        ? Promise.all(allAsgIds.map(id => db.collection('conversationAnnotationAssignments').doc(id).get()))
        : Promise.resolve([]),
    ]);

    const convMetaMap = {};
    convDocs.forEach(d => { if (d.exists) convMetaMap[d.id] = serializeConversationMeta(d); });

    // Build annotatorId → name map (needed for both admin and annotator views — show annotator names)
    const annotatorIds = [...new Set(asgDocs.filter(d => d.exists).map(d => d.data().annotatorId))];
    const userDocs     = annotatorIds.length > 0
      ? await Promise.all(annotatorIds.map(id => db.collection('users').doc(id).get()))
      : [];
    const nameMap = {};
    userDocs.forEach(d => { if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id; });
    // Map assignmentId → annotatorName
    const asgNameMap = {};
    asgDocs.forEach(d => {
      if (d.exists) asgNameMap[d.id] = nameMap[d.data().annotatorId] || d.data().annotatorId;
    });

    return {
      set: {
        id: doc.id,
        title: d.title,
        description: d.description || null,
        visibleToAnnotators: !!d.visibleToAnnotators,
        createdAt: tsToStr(d.createdAt),
        updatedAt: tsToStr(d.updatedAt),
        items: items.map((item, idx) => ({
          ...item,
          itemIndex: idx,
          convMeta: convMetaMap[item.conversationId] || null,
          annotatorNames: (item.assignmentIds || []).map(aid => asgNameMap[aid] || aid),
        })),
      },
      error: null,
    };
  } catch (error) {
    console.error('❌ Error getting comparison set detail:', error);
    return { set: null, error: error.message };
  }
}

/** Fetch full comparison data for one conversation pair of assignments.
 *  Requires either admin or annotator role. */
async function getComparisonData(conversationId, assignmentIdA, assignmentIdB, requesterId, isAdmin) {
  try {
    if (!isAdmin) {
      const { isAnnotator } = await verifyAnnotator(requesterId);
      if (!isAnnotator) return { data: null, error: 'access_denied' };
    }

    const [convDoc, annotDocA, annotDocB, asgDocA, asgDocB] = await Promise.all([
      db.collection('conversations').doc(conversationId).get(),
      db.collection('conversationAnnotations').doc(assignmentIdA).get(),
      db.collection('conversationAnnotations').doc(assignmentIdB).get(),
      db.collection('conversationAnnotationAssignments').doc(assignmentIdA).get(),
      db.collection('conversationAnnotationAssignments').doc(assignmentIdB).get(),
    ]);

    if (!convDoc.exists) return { data: null, error: 'conversation_not_found' };

    const convData = convDoc.data();
    const annotatorIdA = asgDocA.exists ? asgDocA.data().annotatorId : null;
    const annotatorIdB = asgDocB.exists ? asgDocB.data().annotatorId : null;

    const uidSet = [...new Set([annotatorIdA, annotatorIdB].filter(Boolean))];
    const userDocs = await Promise.all(uidSet.map(id => db.collection('users').doc(id).get()));
    const nameMap = {};
    userDocs.forEach(d => { if (d.exists) nameMap[d.id] = d.data().fullName || d.data().email || d.id; });

    return {
      data: {
        conv: {
          id: convDoc.id,
          turns: (convData.turns || []).sort((a, b) => (a.turnNumber || 0) - (b.turnNumber || 0)),
          convMeta: serializeConversationMeta(convDoc),
        },
        annotatorA: {
          id: annotatorIdA,
          name: annotatorIdA ? (nameMap[annotatorIdA] || annotatorIdA) : '—',
          feedbackPoints: annotDocA.exists ? (annotDocA.data().feedbackPoints || []) : [],
          generalComment: annotDocA.exists ? (annotDocA.data().generalComment || null) : null,
        },
        annotatorB: {
          id: annotatorIdB,
          name: annotatorIdB ? (nameMap[annotatorIdB] || annotatorIdB) : '—',
          feedbackPoints: annotDocB.exists ? (annotDocB.data().feedbackPoints || []) : [],
          generalComment: annotDocB.exists ? (annotDocB.data().generalComment || null) : null,
        },
      },
      error: null,
    };
  } catch (error) {
    console.error('❌ Error getting comparison data:', error);
    return { data: null, error: error.message };
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

// ─── Consensus annotation helpers (private) ──────────────────────────────────

/**
 * Resolve the caller's role from Firestore. Never trust a flag from the client.
 * Returns { isAnnotator, isAdmin, error }.
 */
async function resolveCallerRole(requesterId) {
  const [annotatorResult, adminResult] = await Promise.all([
    verifyAnnotator(requesterId),
    verifyAdmin(requesterId),
  ]);
  return {
    isAnnotator: annotatorResult.isAnnotator,
    isAdmin: adminResult.isAdmin,
    error: annotatorResult.error || adminResult.error || null,
  };
}

/**
 * Verify that comparisonSetId exists, conversationId is one of its items, and
 * (optionally) the provided assignmentIds match the stored item.
 * Returns { ok, error, set, item }.
 * @param {string|null} providedAssignmentIds - pass null to skip the assignment-ID check.
 */
async function verifyComparisonSetItem(comparisonSetId, conversationId, providedAssignmentIds) {
  const setDoc = await db.collection('annotationComparisonSets').doc(comparisonSetId).get();
  if (!setDoc.exists) return { ok: false, error: 'comparison_set_not_found', set: null, item: null };
  const setData = setDoc.data();
  const item = (setData.items || []).find(i => i.conversationId === conversationId);
  if (!item) return { ok: false, error: 'conversation_not_in_set', set: setData, item: null };
  if (providedAssignmentIds) {
    const provided = [...providedAssignmentIds].sort().join(',');
    const expected = [...(item.assignmentIds || [])].sort().join(',');
    if (provided !== expected) return { ok: false, error: 'assignment_ids_mismatch', set: setData, item };
  }
  return { ok: true, set: setData, item };
}

/**
 * Build a Map<turnNumber, Set<dimId>> from the union of both source annotation docs.
 * Used to enforce that consensus can only reference dims selected by either annotator.
 */
async function buildAllowedDimsMap(assignmentIdA, assignmentIdB) {
  const [docA, docB] = await Promise.all([
    db.collection('conversationAnnotations').doc(assignmentIdA).get(),
    db.collection('conversationAnnotations').doc(assignmentIdB).get(),
  ]);
  const fpA = docA.exists ? (docA.data().feedbackPoints || []) : [];
  const fpB = docB.exists ? (docB.data().feedbackPoints || []) : [];
  const map = new Map();
  for (const fp of [...fpA, ...fpB]) {
    const tn = fp.turnNumber;
    if (!map.has(tn)) map.set(tn, new Set());
    for (const d of (fp.selectedDimensions || [])) map.get(tn).add(d);
  }
  return map;
}

// ─── Consensus annotation: public functions ───────────────────────────────────

/**
 * Get the consensus annotation doc (or null if not yet created).
 * Annotators can only access sets with visibleToAnnotators === true.
 * Consensus doc ID: comparisonSetId + '__' + conversationId  (double underscore).
 * Returns { consensus, error }.
 */
async function getConsensusAnnotation(comparisonSetId, conversationId, requesterId) {
  try {
    const { isAnnotator, isAdmin } = await resolveCallerRole(requesterId);
    if (!isAnnotator && !isAdmin) return { consensus: null, error: 'access_denied' };

    if (!isAdmin) {
      const setDoc = await db.collection('annotationComparisonSets').doc(comparisonSetId).get();
      if (!setDoc.exists || !setDoc.data().visibleToAnnotators) {
        return { consensus: null, error: 'set_not_visible' };
      }
    }

    const consensusId = `${comparisonSetId}__${conversationId}`;
    const doc = await db.collection('conversationConsensusAnnotations').doc(consensusId).get();
    return {
      consensus: doc.exists
        ? { consensusId, ...doc.data(), updatedAt: tsToStr(doc.data().updatedAt), submittedAt: tsToStr(doc.data().submittedAt), createdAt: tsToStr(doc.data().createdAt) }
        : null,
      error: null,
    };
  } catch (err) {
    console.error('❌ getConsensusAnnotation:', err);
    return { consensus: null, error: err.message };
  }
}

/**
 * Save (create or update) a consensus annotation draft.
 * Enforces: annotator access, visibleToAnnotators, set/conv/assignment validation,
 * and strips any PCK dims not in the union of the two source annotations.
 * Returns { consensusId, error }.
 */
async function saveConsensusAnnotation(comparisonSetId, conversationId, sourceAssignmentIds, feedbackPoints, requesterId) {
  try {
    const { isAnnotator, isAdmin } = await resolveCallerRole(requesterId);
    if (!isAnnotator && !isAdmin) return { consensusId: null, error: 'access_denied' };

    // Annotator: verify set is visible
    if (!isAdmin) {
      const setDoc = await db.collection('annotationComparisonSets').doc(comparisonSetId).get();
      if (!setDoc.exists || !setDoc.data().visibleToAnnotators) {
        return { consensusId: null, error: 'set_not_visible' };
      }
    }

    // Verify set exists, conv is in it, assignment IDs match
    const check = await verifyComparisonSetItem(comparisonSetId, conversationId, sourceAssignmentIds);
    if (!check.ok) return { consensusId: null, error: check.error };

    const consensusId = `${comparisonSetId}__${conversationId}`;
    const ref = db.collection('conversationConsensusAnnotations').doc(consensusId);
    const existing = await ref.get();

    if (existing.exists && existing.data().status === 'completed') {
      return { consensusId, error: 'already_completed' };
    }

    // Strip disallowed PCK dims (enforce union-only rule)
    const allowedMap = await buildAllowedDimsMap(sourceAssignmentIds[0], sourceAssignmentIds[1]);
    const filteredFeedbackPoints = (feedbackPoints || []).map(fp => {
      const allowed = allowedMap.get(fp.turnNumber) || new Set();
      const filteredDimFeedback = {};
      const filteredSelectedDims = [];
      for (const dimId of (fp.selectedDimensions || [])) {
        if (allowed.has(dimId)) {
          filteredSelectedDims.push(dimId);
          if (fp.dimensionFeedback && fp.dimensionFeedback[dimId] !== undefined) {
            filteredDimFeedback[dimId] = fp.dimensionFeedback[dimId];
          }
        }
      }
      return { ...fp, selectedDimensions: filteredSelectedDims, dimensionFeedback: filteredDimFeedback };
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    if (!existing.exists) {
      await ref.set({
        consensusId,
        comparisonSetId,
        conversationId,
        sourceAssignmentIds,
        status: 'draft',
        feedbackPoints: filteredFeedbackPoints,
        createdAt: now,
        createdBy: requesterId,
        updatedAt: now,
        updatedBy: requesterId,
        submittedAt: null,
        submittedBy: null,
      });
    } else {
      await ref.update({
        feedbackPoints: filteredFeedbackPoints,
        sourceAssignmentIds,
        status: 'draft',
        updatedAt: now,
        updatedBy: requesterId,
      });
    }

    return { consensusId, error: null };
  } catch (err) {
    console.error('❌ saveConsensusAnnotation:', err);
    return { consensusId: null, error: err.message };
  }
}

/**
 * Submit (complete) a consensus annotation. Sets status to 'completed' and locks editing.
 * Returns { error }.
 */
async function submitConsensusAnnotation(comparisonSetId, conversationId, requesterId) {
  try {
    const { isAnnotator, isAdmin } = await resolveCallerRole(requesterId);
    if (!isAnnotator && !isAdmin) return { error: 'access_denied' };

    if (!isAdmin) {
      const setDoc = await db.collection('annotationComparisonSets').doc(comparisonSetId).get();
      if (!setDoc.exists || !setDoc.data().visibleToAnnotators) {
        return { error: 'set_not_visible' };
      }
    }

    const check = await verifyComparisonSetItem(comparisonSetId, conversationId, null);
    if (!check.ok) return { error: check.error };

    const consensusId = `${comparisonSetId}__${conversationId}`;
    const ref = db.collection('conversationConsensusAnnotations').doc(consensusId);
    const doc = await ref.get();
    if (!doc.exists) return { error: 'consensus_not_found' };
    if (doc.data().status === 'completed') return { error: 'already_completed' };

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.update({ status: 'completed', submittedAt: now, submittedBy: requesterId, updatedAt: now });
    return { error: null };
  } catch (err) {
    console.error('❌ submitConsensusAnnotation:', err);
    return { error: err.message };
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
  // Agreement analysis
  getEligibleAgreementConversations,
  getAgreementReports,
  getAgreementReport,
  computeAndSaveAgreementReport,
  // Comparison sets
  getConversationsWithCompletedPairs,
  createComparisonSet,
  updateComparisonSet,
  deleteComparisonSet,
  getComparisonSets,
  getComparisonSetDetail,
  getComparisonData,
  // Consensus annotations
  getConsensusAnnotation,
  saveConsensusAnnotation,
  submitConsensusAnnotation,
};

export default admin;
