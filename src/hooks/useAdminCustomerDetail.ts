import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getAdminCustomerRecord, type AdminCustomerRecord } from '../services/admin-customer.service';

/**
 * Source of truth for the customer record and all five Administration subsections.
 * A response is valid only for the currently focused customer and latest load.
 * UI identity checks prevent rendering a previous customer's private information.
 * Server RLS/permissions remain the authorization boundary.
 */
export function useAdminCustomerDetail(userId: string) {
  const loadRunRef = useRef(0);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;

  const [storedRecord, setStoredRecord] = useState<AdminCustomerRecord | null>(null);
  const [resolvedForUserId, setResolvedForUserId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(Boolean(userId));
  const [refreshing, setRefreshing] = useState(false);
  const [storedError, setError] = useState('');

  const record = resolvedForUserId === userId ? storedRecord : null;
  const error = resolvedForUserId === userId ? storedError : '';
  const loading = isLoading || (Boolean(userId) && resolvedForUserId !== userId);

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => loadRunRef.current === runId
      && activeUserIdRef.current === userId;
    if (!userId) return;

    setLoading(true);
    setError('');
    setStoredRecord(null);
    setResolvedForUserId(null);
    try {
      const result = await getAdminCustomerRecord(userId);
      if (!isCurrentRun()) return;
      if (result.profile.user_id !== userId) {
        throw new Error('El servidor devolvió la ficha de otro cliente.');
      }
      setStoredRecord(result);
      setResolvedForUserId(userId);
    } catch (cause) {
      if (!isCurrentRun()) return;
      setStoredRecord(null);
      setResolvedForUserId(userId);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el cliente.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadRunRef.current += 1;
    activeUserIdRef.current = userId;
    setStoredRecord(null);
    setResolvedForUserId(null);
    setError('');
    if (userId) void load();
    return () => { loadRunRef.current += 1; activeUserIdRef.current = ''; };
  }, [load, userId]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); }
    finally { setRefreshing(false); }
  }, [load]);

  return { record, loading, refreshing, error, refresh };
}
