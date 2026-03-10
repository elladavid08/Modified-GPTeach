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

/**
 * Save or update conversation (for conversation logger)
 * Uses sessionId as the document ID to enable updates
 */
export const saveConversation = async (conversationData) => {
  try {
    const conversationRef = doc(db, 'conversations', conversationData.sessionId);
    await setDoc(conversationRef, {
      ...conversationData,
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
    return { error: null };
  } catch (error) {
    console.error('Error saving conversation:', error);
    return { error: error.message };
  }
};

/**
 * Add message to conversation (for conversation logger compatibility)
 */
export const addMessageToConversation = async (sessionId, messageData) => {
  return addMessage(sessionId, messageData);
};

/**
 * Save or get student persona
 * Creates a versioned student persona document if it doesn't exist
 * Returns the persona reference ID
 */
export const saveOrGetStudentPersona = async (student, systemVersion) => {
  try {
    // Build persona ID: v{version}_{id}
    const personaId = `v${student.version}_${student.id}`;
    
    // Check if this persona version already exists
    const personaRef = doc(db, 'studentPersonas', personaId);
    const personaSnap = await getDoc(personaRef);
    
    if (!personaSnap.exists()) {
      // Create new persona version
      await setDoc(personaRef, {
        id: student.id,
        name: student.name,
        version: student.version,
        description: student.description,
        keywords: student.keywords || [],
        reasoning_style: student.reasoning_style || [],
        misconception_tendencies: student.misconception_tendencies || [],
        systemVersion: systemVersion,
        createdAt: serverTimestamp()
      });
      console.log(`✅ Created student persona: ${personaId}`);
    } else {
      console.log(`✅ Student persona already exists: ${personaId}`);
    }
    
    return personaId;
  } catch (error) {
    console.error('Error saving student persona:', error);
    throw error;
  }
};

/**
 * Get student persona by reference ID
 */
export const getStudentPersona = async (personaId) => {
  try {
    const personaRef = doc(db, 'studentPersonas', personaId);
    const personaSnap = await getDoc(personaRef);
    
    if (personaSnap.exists()) {
      return { persona: personaSnap.data(), error: null };
    } else {
      return { persona: null, error: 'Persona not found' };
    }
  } catch (error) {
    console.error('Error getting student persona:', error);
    return { persona: null, error: error.message };
  }
};

/**
 * Get multiple student personas by reference IDs
 */
export const getStudentPersonas = async (personaIds) => {
  try {
    const personas = await Promise.all(
      personaIds.map(async (id) => {
        const result = await getStudentPersona(id);
        return result.persona;
      })
    );
    
    return { personas: personas.filter(p => p !== null), error: null };
  } catch (error) {
    console.error('Error getting student personas:', error);
    return { personas: [], error: error.message };
  }
};
