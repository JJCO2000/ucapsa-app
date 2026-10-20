import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_MEMBER_THEME, type MemberThemeKey } from '../constants/ucapsaFormats';
import { devWarn } from '../lib/client-diagnostics';
import { readMemberAppearance, saveMemberAppearance } from '../services/member-appearance.service';
import { useSession } from './useSession';

type Appearance = { memberTheme: MemberThemeKey; setMemberTheme: (theme: MemberThemeKey) => Promise<void> };
const Context = createContext<Appearance | null>(null);

// Preferencia visual guardada por usuario y dispositivo; no altera permisos.
export function MemberAppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<{ userId: string; theme: MemberThemeKey } | null>(null);
  useEffect(() => {
    let active = true;
    if (userId) {
      void readMemberAppearance(userId)
        .then((saved) => {
          if (active) setLoaded({ userId, theme: saved });
        })
        .catch((error) => {
          devWarn('Could not restore local member appearance.', error);
          if (active) setLoaded({ userId, theme: DEFAULT_MEMBER_THEME });
        });
    }
    return () => { active = false; };
  }, [userId]);
  const memberTheme = userId && loaded?.userId === userId ? loaded.theme : DEFAULT_MEMBER_THEME;
  const setMemberTheme = useCallback(async (theme: MemberThemeKey) => {
    if (!userId) throw new Error('Paleta no disponible.');
    await saveMemberAppearance(userId, theme);
    setLoaded({ userId, theme });
  }, [userId]);
  const value = useMemo(() => ({ memberTheme, setMemberTheme }), [memberTheme, setMemberTheme]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMemberAppearance(): Appearance {
  const value = useContext(Context);
  if (!value) throw new Error('MemberAppearanceProvider no disponible.');
  return value;
}
