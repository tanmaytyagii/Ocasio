import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types/database';

/**
 * Authentication and authorization state.
 *
 * `role` comes from public.profiles, never from user_metadata. The previous
 * implementation read user.user_metadata.user_type, which the user can set
 * themselves via supabase.auth.updateUser() — see audit SEC-3.
 *
 * This context is still only a UX affordance. Actual enforcement is RLS: even
 * if a user forged `role` in memory, every query remains bounded by policy.
 */
interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Database-backed role. Null while loading or signed out. */
  role: UserRole | null;
  /** True until the initial session check completes. */
  loading: boolean;
  /** Set when the profile could not be loaded despite an active session. */
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  role: null,
  loading: true,
  error: null,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setError(null);
      return;
    }
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      // An expired or revoked session surfaces here first. Treat it as signed
      // out rather than leaving a half-authenticated UI on screen.
      setProfile(null);
      setError(profileError.message);
      return;
    }
    setProfile(data);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await loadProfile(data.session?.user.id);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not restore session.');
      })
      .finally(() => {
        // Always resolves, so the app can never hang on "Loading…" if the
        // network call fails.
        if (active) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      await loadProfile(nextSession?.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        role: profile?.role ?? null,
        loading,
        error,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
