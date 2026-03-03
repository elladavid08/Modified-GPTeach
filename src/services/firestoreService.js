// Firestore database service for managing conversations and user data
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Create a new conversation
 */
export const createConversation = async (userId, scenario, systemVersion) => {
  try {
    const conversationRef = await addDoc(collection(db, 'conversations'), {
      userId,
      scenario,
      systemVersion: systemVersion || 'v1.0.0',
      startedAt: serverTimestamp(),
      messages: [],
      metadata: {
        totalMessages: 0,
        studentsInvolved: [],
        duration: 0
      }
    });
    
    return { conversationId: conversationRef.id, error: null };
  } catch (error) {
    console.error('Error creating conversation:', error);
    return { conversationId: null, error: error.message };
  }
};

/**
 * Add a message to a conversation
 */
export const addMessage = async (conversationId, messageData) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    if (!conversationSnap.exists()) {
      return { error: 'Conversation not found' };
    }
    
    const conversation = conversationSnap.data();
    const messages = conversation.messages || [];
    
    const newMessage = {
      ...messageData,
      timestamp: new Date().toISOString()
    };
    
    messages.push(newMessage);
    
    // Update conversation with new message
    await updateDoc(conversationRef, {
      messages,
      'metadata.totalMessages': messages.length,
      lastUpdated: serverTimestamp()
    });
    
    return { error: null };
  } catch (error) {
    console.error('Error adding message:', error);
    return { error: error.message };
  }
};

/**
 * Get a conversation by ID
 */
export const getConversation = async (conversationId) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    if (conversationSnap.exists()) {
      return {
        conversation: { id: conversationSnap.id, ...conversationSnap.data() },
        error: null
      };
    } else {
      return { conversation: null, error: 'Conversation not found' };
    }
  } catch (error) {
    console.error('Error getting conversation:', error);
    return { conversation: null, error: error.message };
  }
};

/**
 * Get all conversations for a user
 */
export const getUserConversations = async (userId, limitCount = 50) => {
  try {
    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      orderBy('startedAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    const conversations = [];
    
    querySnapshot.forEach((doc) => {
      conversations.push({ id: doc.id, ...doc.data() });
    });
    
    return { conversations, error: null };
  } catch (error) {
    console.error('Error getting user conversations:', error);
    return { conversations: [], error: error.message };
  }
};

/**
 * Update conversation metadata (duration, students involved, etc.)
 */
export const updateConversationMetadata = async (conversationId, metadata) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationId);
    await updateDoc(conversationRef, {
      'metadata': metadata,
      lastUpdated: serverTimestamp()
    });
    
    return { error: null };
  } catch (error) {
    console.error('Error updating conversation metadata:', error);
    return { error: error.message };
  }
};

/**
 * Save complete conversation to Firestore
 * This is called from the backend after the conversation is complete
 */
export const saveCompleteConversation = async (conversationData) => {
  try {
    const conversationRef = await addDoc(collection(db, 'conversations'), {
      ...conversationData,
      savedAt: serverTimestamp()
    });
    
    return { conversationId: conversationRef.id, error: null };
  } catch (error) {
    console.error('Error saving conversation:', error);
    return { conversationId: null, error: error.message };
  }
};
