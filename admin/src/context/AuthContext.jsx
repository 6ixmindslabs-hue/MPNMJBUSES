import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check Dev Session First
    const devSession = localStorage.getItem('mpnmjec_dev_session');
    if (devSession) {
      try {
        const { user, profile } = JSON.parse(devSession);
        setUser(user);
        setProfile(profile);
        setLoading(false);
        return; // Skip Supabase check if we have a dev session
      } catch (e) {
        localStorage.removeItem('mpnmjec_dev_session');
      }
    }

    // 2. Otherwise get initial Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else if (!localStorage.getItem('mpnmjec_dev_session')) {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (uid) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();
      
      if (data) setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('mpnmjec_dev_session');
    supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const loginDev = (email, password) => {
    if (email === 'admin@mpnmjec.edu.in' && password === 'admin12345') {
      const mockUser = { id: 'dev-admin', email };
      const mockProfile = { full_name: 'MPNMJEC Admin', role: 'super_admin' };
      setUser(mockUser);
      setProfile(mockProfile);
      localStorage.setItem('mpnmjec_dev_session', JSON.stringify({ user: mockUser, profile: mockProfile }));
      setLoading(false);
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, loginDev }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
