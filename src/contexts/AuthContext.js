import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthChange, getCurrentUser } from '../services/authService';
import { getUserProfile } from '../services/authService';
import { logEvent } from '../utils/annotationDiagnostics';

const AuthContext = createContext({});

// Background retry schedule used only for transient profile-read failures.
const PROFILE_RETRY_MS = [1000, 3000, 8000];

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const retryTimerRef = useRef(null);
  const lastUidRef = useRef(null);

  const refreshUserProfile = async () => {
    if (currentUser) {
      const { profile, error } = await getUserProfile(currentUser.uid);
      if (!error && profile) {
        setUserProfile(profile);
      }
    }
  };

  useEffect(() => {
    const clearRetry = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    // Retries only a transient (thrown/network) failure. A profile that is
    // genuinely absent is never retried and never changes the resolved state.
    const scheduleRetry = (uid, attempt) => {
      if (attempt >= PROFILE_RETRY_MS.length) return;
      clearRetry();
      retryTimerRef.current = setTimeout(async () => {
        if (lastUidRef.current !== uid) return;
        const res = await getUserProfile(uid);
        if (!res.error && res.profile) {
          logEvent('profile_load_result', { outcome: 'found', attempt: attempt + 1 });
          setUserProfile(res.profile);
        } else if (res.transient) {
          logEvent('profile_load_result', { outcome: 'transient_error', attempt: attempt + 1 });
          scheduleRetry(uid, attempt + 1);
        } else {
          logEvent('profile_load_result', { outcome: 'not_found', attempt: attempt + 1 });
          setUserProfile(null);
        }
      }, PROFILE_RETRY_MS[attempt]);
    };

    // Subscribe to authentication state changes
    const unsubscribe = onAuthChange(async (user) => {
      logEvent('auth_state_change', {
        from: lastUidRef.current,
        to: user ? user.uid : null,
      });
      lastUidRef.current = user ? user.uid : null;
      clearRetry();
      setCurrentUser(user);

      if (user) {
        // Fetch user profile from Firestore
        const res = await getUserProfile(user.uid);
        if (!res.error && res.profile) {
          logEvent('profile_load_result', { outcome: 'found', attempt: 0 });
          setUserProfile(res.profile);
        } else if (res.transient) {
          // The request failed rather than the document being absent. Keep any
          // profile we already resolved so a network blip cannot revoke an
          // active annotator's access, and retry in the background.
          logEvent('profile_load_result', { outcome: 'transient_error', attempt: 0, message: res.error });
          scheduleRetry(user.uid, 0);
        } else {
          logEvent('profile_load_result', { outcome: 'not_found', attempt: 0 });
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => {
      clearRetry();
      unsubscribe();
    };
  }, []);

  const value = {
    currentUser,
    userProfile,
    loading,
    isAuthenticated: !!currentUser,
    hasCompletedProfile: userProfile && userProfile.profileComplete === true,
    refreshUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
