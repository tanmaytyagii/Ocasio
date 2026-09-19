import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { listMyFavoriteIds } from '../services/favorites';
import { useAuth } from './AuthContext';

/**
 * The single source of truth for favourite state in the UI.
 *
 * One Set of vendor ids is loaded once per session and shared. Favourite
 * buttons appear on cards, on vendor detail and on the favourites page; if each
 * kept its own copy, toggling in one place would leave the others stale.
 *
 * Persistence is the favorites table, protected by RLS to the owner's rows.
 * Nothing is mirrored into localStorage — that would be a second store able to
 * disagree with the database.
 */
interface FavoritesContextValue {
  /** Vendor ids the signed-in user has saved. Empty when signed out. */
  favoriteIds: Set<string>;
  loading: boolean;
  error: string | null;
  isFavorite: (vendorId: string) => boolean;
  /** Saves or removes. Signed-out users are sent to sign in and returned here. */
  toggleFavorite: (vendorId: string) => Promise<void>;
  /** Ids currently mid-request, so buttons can disable without a global spinner. */
  pending: Set<string>;
  refresh: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favoriteIds: new Set(),
  loading: false,
  error: null,
  isFavorite: () => false,
  toggleFavorite: async () => {},
  pending: new Set(),
  refresh: async () => {},
});

export const FavoritesProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    setLoading(true);
    try {
      setFavoriteIds(new Set(await listMyFavoriteIds()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load your saved vendors');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const toggleFavorite = useCallback(
    async (vendorId: string) => {
      // Signed out is not a failure state: send them to sign in, remember where
      // they were, and let them come back. Never fail silently.
      if (!user) {
        navigate('/auth', {
          state: { from: location, intent: 'save this vendor' },
          replace: false,
        });
        return;
      }

      const wasFavorite = favoriteIds.has(vendorId);
      setPending((p) => new Set(p).add(vendorId));

      // Optimistic: the write is a single row keyed by a unique constraint, so
      // the only realistic failure is the network, and we roll back on error.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(vendorId);
        else next.add(vendorId);
        return next;
      });

      const { error: writeError } = wasFavorite
        ? await supabase.from('favorites').delete().eq('vendor_id', vendorId)
        : await supabase.from('favorites').insert({ user_id: user.id, vendor_id: vendorId });

      if (writeError) {
        console.error('[ocasio] toggle favourite:', writeError.message);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(vendorId);
          else next.delete(vendorId);
          return next;
        });
        setError(wasFavorite ? 'Could not remove that vendor' : 'Could not save that vendor');
      } else {
        setError(null);
      }

      setPending((p) => {
        const next = new Set(p);
        next.delete(vendorId);
        return next;
      });
    },
    [user, favoriteIds, navigate, location],
  );

  const value = useMemo(
    () => ({
      favoriteIds,
      loading,
      error,
      isFavorite: (id: string) => favoriteIds.has(id),
      toggleFavorite,
      pending,
      refresh: load,
    }),
    [favoriteIds, loading, error, toggleFavorite, pending, load],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useFavorites = () => useContext(FavoritesContext);
