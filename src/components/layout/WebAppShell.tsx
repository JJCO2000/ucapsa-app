import type { ReactNode } from 'react';

// Android/iOS keep the exact same navigation tree and layout.
export function WebAppShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
