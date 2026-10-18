import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

type NavItem = {
  label: string;
  href: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const adminNavigation: NavItem[] = [
  { label: 'Inicio', href: '/admin-home', icon: 'dashboard' },
  { label: 'Clientes', href: '/admin-clients', icon: 'people-alt' },
  { label: 'Clases', href: '/admin-classes', icon: 'school' },
  { label: 'Pagos', href: '/admin-payments', icon: 'payments' },
  { label: 'Reportes', href: '/staff/training-report', icon: 'table-view' },
  { label: 'Gestión', href: '/admin-more', icon: 'settings' },
  { label: 'Mi cuenta', href: '/account-settings', icon: 'account-circle' },
];

const trainerNavigation: NavItem[] = [
  { label: 'Inicio', href: '/trainer-home', icon: 'dashboard' },
  { label: 'Clases', href: '/trainer-classes', icon: 'school' },
  { label: 'Exámenes', href: '/trainer-exams', icon: 'assignment' },
  { label: 'Reporte de clases', href: '/staff/training-report', icon: 'table-view' },
  { label: 'Mi cuenta', href: '/account-settings', icon: 'account-circle' },
];

const clientNavigation: NavItem[] = [
  { label: 'Inicio', href: '/home', icon: 'home' },
  { label: 'Clases', href: '/classes', icon: 'school' },
  { label: 'Mis perros', href: '/dog', icon: 'pets' },
  { label: 'Agenda', href: '/calendar', icon: 'calendar-month' },
  { label: 'Perfil', href: '/profile', icon: 'person' },
];

const publicNavigation: NavItem[] = [
  { label: 'Inicio', href: '/home', icon: 'home' },
  { label: 'Servicios', href: '/services', icon: 'grid-view' },
  { label: 'Avisos', href: '/announcements', icon: 'campaign' },
  { label: 'Ingresar', href: '/auth/login', icon: 'login' },
];

function activeItem(href: string, pathname: string) {
  if (pathname === href) return true;
  if (href === '/admin-clients') return pathname.startsWith('/admin/customer');
  if (href === '/admin-classes') return /^\/admin\/class/.test(pathname);
  if (href === '/trainer-classes') return false;
  return false;
}

export function WebAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { user, profile, role, isAdmin, isTrainer, signOut, usingCachedProfile, isOfflineFallback, refreshProfile } = useSession();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const isWide = width >= 920;

  // Login, registration, recovery and legal pages remain free of navigation chrome.
  if (/^\/auth\//.test(pathname) || pathname === '/privacy' || pathname === '/terms') {
    return <>{children}</>;
  }

  // Do not render privileged (or personal) routes with an unverified browser profile.
  // All data authorization remains enforced by Supabase RLS on the server.
  if (user && (!profile || usingCachedProfile || isOfflineFallback)) {
    return (
      <View style={styles.validation}>
        <MaterialIcons name="verified-user" size={32} color={ucapsaBrand.colors.red} />
        <Text style={styles.validationTitle}>Verificando tu acceso a UCAPSA</Text>
        <Text style={styles.validationHint}>
          Necesitamos confirmar tu perfil con el servidor antes de mostrar información en esta computadora.
        </Text>
        {profileError ? <Text accessibilityRole="alert" style={styles.signOutError}>{profileError}</Text> : null}
        <Pressable
          style={styles.validationButton}
          accessibilityRole="button"
          onPress={() => {
            setProfileError(null);
            void refreshProfile().catch(() => setProfileError('No pudimos verificar tu perfil. Revisa tu conexión.'));
          }}
        >
          <Text style={styles.validationButtonText}>Reintentar verificación</Text>
        </Pressable>
      </View>
    );
  }

  const nav = isAdmin ? adminNavigation
    : isTrainer ? trainerNavigation
      : user ? clientNavigation : publicNavigation;
  const navigation = role === 'member'
    ? [...nav, { label: 'Membresía', href: '/client/membership', icon: 'workspace-premium' as const }]
    : nav;
  const workspace = isAdmin ? 'Administración'
    : isTrainer ? 'Entrenadores'
      : role === 'member' ? 'Socios'
        : user ? 'Clientes' : 'Bienvenido';
  const displayName = profile?.full_name?.trim() || (user ? 'Mi cuenta' : 'Invitado');

  const links = navigation.map((item) => {
    const selected = activeItem(item.href, pathname);
    return (
      <Pressable
        key={item.href}
        accessibilityRole="link"
        accessibilityLabel={item.label}
        onPress={() => router.push(item.href as never)}
        style={[styles.navItem, selected && styles.navItemActive, !isWide && styles.navItemCompact]}
      >
        <MaterialIcons
          name={item.icon}
          size={19}
          color={selected ? ucapsaBrand.colors.red : ucapsaBrand.colors.muted}
        />
        <Text style={[styles.navText, selected && styles.navTextActive]} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={[styles.container, isWide ? styles.wide : styles.narrow]}>
      {isWide ? (
        <View style={styles.sidebar}>
          <View style={styles.identity}>
            <Text style={styles.brand}>UCAPSA</Text>
            <Text style={styles.workspace}>{workspace}</Text>
          </View>
          <View style={styles.sidebarLinks}>{links}</View>
          <View style={styles.account}>
            <MaterialIcons name="account-circle" size={24} color={ucapsaBrand.colors.muted} />
            <Text style={styles.accountText} numberOfLines={2}>{displayName}</Text>
            {user ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar sesión en esta computadora"
                onPress={() => {
                  setSignOutError(null);
                  void signOut()
                    .then(() => router.replace('/auth/login' as never))
                    .catch(() => setSignOutError('No se pudo cerrar sesión. Reintenta.'));
                }}
              >
                <MaterialIcons name="logout" size={23} color={ucapsaBrand.colors.red} />
              </Pressable>
            ) : null}
          </View>
          {signOutError ? <Text accessibilityRole="alert" style={styles.signOutError}>{signOutError}</Text> : null}
        </View>
      ) : (
        <View style={styles.topbar}>
          <View style={styles.topbarTitle}>
            <Text style={styles.brand}>UCAPSA</Text>
            <Text style={styles.workspace}>{workspace}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.compactLinks}
            accessibilityLabel="Navegación de UCAPSA"
          >
            {links}
          </ScrollView>
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  validation: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 14, backgroundColor: ucapsaBrand.colors.background },
  validationTitle: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  validationHint: { color: ucapsaBrand.colors.muted, fontSize: 14, textAlign: 'center', maxWidth: 450 },
  validationButton: { backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12 },
  validationButtonText: { color: ucapsaBrand.colors.surface, fontWeight: '800' },
  container: { flex: 1, backgroundColor: ucapsaBrand.colors.background },
  wide: { flexDirection: 'row' },
  narrow: { flexDirection: 'column' },
  sidebar: {
    width: 235,
    borderRightWidth: 1,
    borderRightColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 24,
  },
  identity: { paddingHorizontal: 12, paddingBottom: 22 },
  brand: { fontSize: 23, fontWeight: '900', color: ucapsaBrand.colors.red, letterSpacing: 0.5 },
  workspace: { marginTop: 3, fontSize: 12, color: ucapsaBrand.colors.muted, fontWeight: '700' },
  sidebarLinks: { flex: 1, gap: 5 },
  navItem: { borderRadius: 11, paddingHorizontal: 12, minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 10 },
  navItemCompact: { minHeight: 39, paddingHorizontal: 10 },
  navItemActive: { backgroundColor: ucapsaBrand.colors.redSoft },
  navText: { fontSize: 13, color: ucapsaBrand.colors.text, fontWeight: '700' },
  navTextActive: { color: ucapsaBrand.colors.red, fontWeight: '900' },
  account: { borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border, paddingTop: 16, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountText: { flex: 1, fontSize: 12, color: ucapsaBrand.colors.muted, fontWeight: '700' },
  signOutError: { paddingHorizontal: 10, color: ucapsaBrand.colors.danger, fontSize: 12 },
  topbar: { borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface },
  topbarTitle: { paddingHorizontal: 17, paddingTop: 12 },
  compactLinks: { paddingHorizontal: 9, paddingVertical: 7, gap: 3, alignItems: 'center' },
  content: { flex: 1, minWidth: 0 },
});
