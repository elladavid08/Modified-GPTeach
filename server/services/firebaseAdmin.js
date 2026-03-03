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

export {
  admin,
  db,
  auth,
  saveConversation,
  saveMessage,
  createUserProfile,
  getUserProfile,
  getAllConversations
};

export default admin;
