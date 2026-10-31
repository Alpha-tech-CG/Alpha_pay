// Chargement d'une ressource de l'API avec état, erreur et rechargement (tirer pour rafraîchir).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { errorMessage } from '@/api';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Recharge au retour sur l'écran, et à intervalle régulier tant qu'il est affiché.
  useFocusEffect(
    useCallback(() => {
      if (!opts.pollMs) return;
      const id = setInterval(() => load(), opts.pollMs);
      return () => clearInterval(id);
    }, [load, opts.pollMs]),
  );

  return { data, error, loading, refreshing, reload: () => load(true), setData };
}
