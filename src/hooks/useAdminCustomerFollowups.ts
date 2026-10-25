import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import {
  getAdminClientFollowupRows,
  type AdminClientFollowupRow,
} from '../services/admin-client-followups.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../utils/async.utils';

/**
 * Seguimiento del cliente desde la misma RPC que utiliza el directorio Admin.
 * No calcula alertas duplicadas ni bloquea la ficha cuando falla esta sección.
 * Las verificaciones de permiso se realizan en Supabase; aquí solo se aísla
 * el resultado del usuario/expediente actualmente visible.
 */
export function useAdminCustomerFollowups(userId: string) {
  const loadRunRef = useRef(0);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const [storedRows, setStoredRows] = useState<AdminClientFollowupRow[]>([]);
  const [resolvedForUserId, setResolvedForUserId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(Boolean(userId));
  const [storedError, setError] = useState<string | null>(null);

  const rows = resolvedForUserId === userId ? storedRows : [];
  const error = resolvedForUserId === userId ? storedError : null;
  const loading = isLoading || (Boolean(userId) && resolvedForUserId !== userId);

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const isCurrentRun = () =>
      loadRunRef.current === runId && activeUserIdRef.current === userId;
    if (!userId) return;

    setLoading(true);
    setError(null);
    setStoredRows([]);
    setResolvedForUserId(null);
    try {
      const allRows = await withOperationTimeout(
        getAdminClientFollowupRows(), DEFAULT_READ_TIMEOUT_MS, 'admin-customer-followups',
      );
      if (!isCurrentRun()) return;
      setStoredRows(allRows.filter((row) => row.userId === userId));
      setResolvedForUserId(userId);
    } catch {
      if (!isCurrentRun()) return;
      setStoredRows([]);
      setResolvedForUserId(userId);
      setError('No pudimos verificar el seguimiento.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadRunRef.current += 1;
    activeUserIdRef.current = userId;
    setStoredRows([]);
    setResolvedForUserId(null);
    setError(null);
    if (userId) void load();
    return () => { loadRunRef.current += 1; activeUserIdRef.current = ''; };
  }, [load, userId]));

  return { rows, loading, error, refresh: load };
}
