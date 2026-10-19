import type { AppRole, Profile } from '../types/app.types';

export type UserDirectoryFilter = 'clients_and_members' | 'clients' | 'members' | 'admins';

export function isStaffRole(role: AppRole): boolean {
  return role === 'trainer' || role === 'admin' || role === 'super_admin';
}

export function matchesDirectoryFilter(
  profile: Profile,
  filter: UserDirectoryFilter,
  activeMemberIds: ReadonlySet<string>,
): boolean {
  if (filter === 'clients_and_members') return true; // UI etiqueta: Todos
  if (filter === 'admins') return isStaffRole(profile.role);
  if (filter === 'members') return activeMemberIds.has(profile.user_id);
  return !isStaffRole(profile.role) && !activeMemberIds.has(profile.user_id);
}

export function getDirectoryCounts(
  profiles: readonly Profile[],
  activeMemberIds: ReadonlySet<string>,
) {
  return {
    total: profiles.length,
    clients: profiles.filter((p) =>
      !isStaffRole(p.role) && !activeMemberIds.has(p.user_id)).length,
    members: profiles.filter((p) => activeMemberIds.has(p.user_id)).length,
    staff: profiles.filter((p) => isStaffRole(p.role)).length,
  };
}

export function directoryStatusLabel(
  profile: Profile,
  activeMemberIds: ReadonlySet<string>,
): string {
  const operational = profile.role === 'super_admin' ? 'Superadmin'
    : profile.role === 'admin' ? 'Admin'
    : profile.role === 'trainer' ? 'Entrenador' : 'Cliente';
  const socio = activeMemberIds.has(profile.user_id);
  return isStaffRole(profile.role)
    ? (socio ? operational + ' · Socio' : operational)
    : (socio ? 'Socio' : operational);
}
