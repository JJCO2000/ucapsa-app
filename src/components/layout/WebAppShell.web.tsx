import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
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
  const { user, profile, role, isAdmin, isTrainer } = useSession();
  const isWide = width >= 920;

  // Login, registration, recovery and legal pages remain free of navigation chrome.
  if (/^\/auth\//.test(pathname) || pathname === '/privacy' || pathname === '/terms') {
    return <>{children}</>;
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
          </View>
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
  topbar: { borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface },
  topbarTitle: { paddingHorizontal: 17, paddingTop: 12 },
  compactLinks: { paddingHorizontal: 9, paddingVertical: 7, gap: 3, alignItems: 'center' },
  content: { flex: 1, minWidth: 0 },
});
