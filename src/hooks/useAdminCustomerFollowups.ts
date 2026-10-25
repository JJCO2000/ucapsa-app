import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getAdminClientFollowupRows, type AdminClientFollowupRow } from '../services/admin-client-followups.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../utils/async.utils';

/**
 * Shares the exact Admin follow-up RPC with the Clients list.
 * Never reuse rows fetched for a different customer or after losing focus.
 * The RPC performs authorization on the server.
 */
export function useAdminCustomerFollowups(userId: string, isAdmin: boolean) {
  const loadRunRef = useRef(0);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;

  const [storedRows, setRows] = useState<AdminClientFollowupRow[]>([]);
  const [resolvedForUserId, setResolvedForUserId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(Boolean(userId));
  const [storedError, setError] = useState<string | null>(null);

  const verified = isAdmin && Boolean(userId) && resolvedForUserId === userId;
  const rows = verified && !storedError ? storedRows : [];
  const error = verified ? storedError : null;
  const loading = isAdmin && Boolean(userId) && (isLoading || resolvedForUserId !== userId);

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => loadRunRef.current === runId
      && activeUserIdRef.current === userId;
    if (!isAdmin || !userId) return;

    setLoading(true);
    setError(null);
    setRows([]);
    setResolvedForUserId(null);
    try {
      const result = await withOperationTimeout(
        getAdminClientFollowupRows(),
        DEFAULT_READ_TIMEOUT_MS,
        'admin-customer-followups',
      );
      if (!isCurrentRun()) return;
      setRows(result.filter((row) => row.userId === userId));
      setResolvedForUserId(userId);
    } catch {
      if (!isCurrentRun()) return;
      setRows([]);
      setResolvedForUserId(userId);
      setError('No se pudo verificar el seguimiento de este cliente.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, userId]);

  useFocusEffect(useCallback(() => {
    loadRunRef.current += 1;
    activeUserIdRef.current = userId;
    setRows([]);
    setResolvedForUserId(null);
    setError(null);
    if (isAdmin && userId) void load();
    return () => { loadRunRef.current += 1; activeUserIdRef.current = ''; };
  }, [isAdmin, load, userId]));

  return { rows, loading, error, refresh: load };
}
