import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { devWarn } from '../lib/client-diagnostics';
import { readStaffWorkspaceMode, writeStaffWorkspaceMode } from '../services/staff-workspace.service';
import { useSession } from './useSession';

export type StaffWorkspaceMode = 'admin' | 'trainer';

type StaffWorkspaceContextValue = {
  mode: StaffWorkspaceMode;
  canSwitch: boolean;
  loading: boolean;
  setMode: (mode: StaffWorkspaceMode) => Promise<void>;
};

const StaffWorkspaceContext = createContext<StaffWorkspaceContextValue | undefined>(undefined);
export function StaffWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isTrainer, capabilities } = useSession();
  const [storedMode, setStoredMode] = useState<StaffWorkspaceMode>('admin');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!user || !capabilities.canUseTrainingWorkspace) {
      setStoredMode('admin');
      setLoading(false);
      return () => { active = false; };
    }

    if (isTrainer) {
      setStoredMode('trainer');
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    void readStaffWorkspaceMode(user.id)
      .then((value) => {
        if (!active) return;
        setStoredMode(value);
      })
      .catch((error) => {
        if (!active) return;
        setStoredMode('admin');
        devWarn('Could not restore UCAPSA staff workspace mode.', error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [capabilities.canUseTrainingWorkspace, isTrainer, user]);

  const mode: StaffWorkspaceMode = isTrainer ? 'trainer' : storedMode;
  const canSwitch = Boolean(user && capabilities.canSwitchStaffWorkspace);

  async function setMode(nextMode: StaffWorkspaceMode) {
    if (!user) return;
    if (isTrainer) {
      if (nextMode !== 'trainer') throw new Error('La cuenta Entrenador no tiene acceso al modo Administración.');
      return;
    }
    if (!capabilities.canSwitchStaffWorkspace) {
      throw new Error('Esta cuenta no puede cambiar de modo de staff.');
    }

    setStoredMode(nextMode);
    try {
      await writeStaffWorkspaceMode(user.id, nextMode);
    } catch (error) {
      devWarn('Could not persist UCAPSA staff workspace mode.', error);
    }
  }

  const value = useMemo<StaffWorkspaceContextValue>(() => ({
    mode,
    canSwitch,
    loading,
    setMode,
  }), [canSwitch, loading, mode]);

  return <StaffWorkspaceContext.Provider value={value}>{children}</StaffWorkspaceContext.Provider>;
}

export function useStaffWorkspace() {
  const context = useContext(StaffWorkspaceContext);
  if (!context) throw new Error('useStaffWorkspace must be used inside StaffWorkspaceProvider.');
  return context;
}
