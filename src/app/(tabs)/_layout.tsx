import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { Platform, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';

function TabIcon({
  name,
  color,
  size,
  focused,
  activeSurface,
}: {
  name: keyof typeof MaterialIcons.glyphMap;
  color: ColorValue;
  size: number;
  focused: boolean;
  activeSurface: string;
}) {
  return (
    <View
      style={{
        width: 36,
        height: 32,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? activeSurface : 'transparent',
      }}
    >
      <MaterialIcons name={name} size={Math.min(size, 23)} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, role, isAdmin } = useSession();
  const format = resolveUcapsaFormat({ user, role, isAdmin });
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 20 : 10);
  const isPremium = format.key === 'member';
  const tabBackground = isAdmin
    ? ucapsaBrand.colors.surface
    : isPremium
      ? ucapsaBrand.colors.premiumSurface
      : ucapsaBrand.colors.surface;
  const tabBorder = isAdmin
    ? ucapsaBrand.colors.border
    : isPremium
      ? ucapsaBrand.colors.premiumBorder
      : ucapsaBrand.colors.border;
  const inactiveTint = isAdmin
    ? ucapsaBrand.colors.mutedNeutral
    : isPremium
      ? ucapsaBrand.colors.premiumMuted
      : ucapsaBrand.colors.muted;
  const activeTint = isAdmin ? ucapsaBrand.colors.red : isPremium ? ucapsaBrand.colors.premiumActionText : format.accent;
  const activeSurface = isAdmin
    ? ucapsaBrand.colors.redSoft
    : isPremium
      ? ucapsaBrand.colors.premiumSurfaceAlt
      : ucapsaBrand.colors.redSoft;
  const isClient = Boolean(user) && !isAdmin;
  const isGuest = !user && !isAdmin;
  const icon = (name: keyof typeof MaterialIcons.glyphMap) => ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <TabIcon name={name} color={color} size={size} focused={focused} activeSurface={activeSurface} />
  );

  return (
    <Tabs
      initialRouteName={isAdmin ? 'admin-home' : 'home'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarLabelStyle: { fontSize: 10, lineHeight: 12, fontWeight: '900', marginTop: 2 },
        tabBarIconStyle: { marginTop: 1 },
        tabBarItemStyle: { paddingTop: 3 },
        tabBarStyle: {
          height: 64 + bottomInset,
          paddingTop: 7,
          paddingBottom: bottomInset,
          paddingHorizontal: 4,
          backgroundColor: tabBackground,
          borderTopColor: tabBorder,
          borderTopWidth: 1,
          shadowColor: ucapsaBrand.colors.black,
          shadowOpacity: isPremium ? 0.08 : 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -4 },
          elevation: 14,
        },
        sceneStyle: { backgroundColor: isAdmin ? ucapsaBrand.colors.background : format.background },
      }}
    >
      <Tabs.Screen name="home" options={{ href: isAdmin ? null : '/home', title: 'Inicio', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="services" options={{ href: isAdmin ? null : '/services', title: 'Servicios', tabBarIcon: icon('grid-view') }} />
      <Tabs.Screen name="classes" options={{ href: isClient ? '/classes' : null, title: 'Clases', tabBarIcon: icon('school') }} />
      <Tabs.Screen name="payments" options={{ href: isClient ? '/payments' : null, title: 'Pagos', tabBarIcon: icon('account-balance-wallet') }} />
      <Tabs.Screen name="dog" options={{ href: isClient ? '/dog' : null, title: 'Perros', tabBarIcon: icon('pets') }} />

      <Tabs.Screen name="announcements" options={{ href: isGuest ? '/announcements' : null, title: 'Anuncios', tabBarIcon: icon('campaign') }} />
      <Tabs.Screen name="calendar" options={{ href: isGuest ? '/calendar' : null, title: 'Calendario', tabBarIcon: icon('event') }} />
      <Tabs.Screen name="profile" options={{ href: isGuest ? '/profile' : null, title: 'Perfil', tabBarIcon: icon('person') }} />
      <Tabs.Screen name="membership" options={{ href: null, title: 'Mi UCAPSA', tabBarIcon: icon('workspace-premium') }} />

      <Tabs.Screen name="admin-home" options={{ href: isAdmin ? '/admin-home' : null, title: 'Inicio', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="admin-clients" options={{ href: isAdmin ? '/admin-clients' : null, title: 'Clientes', tabBarIcon: icon('people-alt') }} />
      <Tabs.Screen name="admin-classes" options={{ href: isAdmin ? '/admin-classes' : null, title: 'Clases', tabBarIcon: icon('school') }} />
      <Tabs.Screen name="admin-payments" options={{ href: isAdmin ? '/admin-payments' : null, title: 'Pagos', tabBarIcon: icon('payments') }} />
      <Tabs.Screen name="admin-more" options={{ href: isAdmin ? '/admin-more' : null, title: 'Más', tabBarIcon: icon('more-horiz') }} />
    </Tabs>
  );
}
