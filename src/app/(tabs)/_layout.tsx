import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { Platform, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ucapsaBrand } from '../../constants/brand';
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
        width: 42,
        height: 36,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? activeSurface : 'transparent',
      }}
    >
      <MaterialIcons name={name} size={Math.min(size, 24)} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, role, isAdmin, isTrainer, isStaff } = useSession();
  const format = resolveUcapsaFormat({ user, role, isAdmin });
  const systemBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 20 : 10);
  const navigationBreathingRoom = Platform.OS === 'android' ? 8 : 4;
  const tabBottomInset = systemBottomInset + navigationBreathingRoom;
  // El rol asignado por Superadmin es la única fuente de acceso.
  const trainerWorkspace = isTrainer;
  const adminWorkspace = isAdmin;
  const isPremium = format.key === 'member';
  const tabBackground = isStaff
    ? ucapsaBrand.colors.surface
    : isPremium
      ? ucapsaBrand.colors.premiumSurface
      : ucapsaBrand.colors.surface;
  const tabBorder = isStaff
    ? ucapsaBrand.colors.border
    : isPremium
      ? ucapsaBrand.colors.premiumBorder
      : ucapsaBrand.colors.border;
  const inactiveTint = isStaff
    ? ucapsaBrand.colors.mutedNeutral
    : isPremium
      ? ucapsaBrand.colors.premiumMuted
      : ucapsaBrand.colors.muted;
  const activeTint = trainerWorkspace
    ? ucapsaBrand.colors.greenDark
    : isStaff
      ? ucapsaBrand.colors.red
      : isPremium ? ucapsaBrand.colors.premiumActionText : format.accent;
  const activeSurface = trainerWorkspace
    ? ucapsaBrand.colors.greenSoft
    : isStaff
      ? ucapsaBrand.colors.redSoft
      : isPremium
      ? ucapsaBrand.colors.premiumSurfaceAlt
      : ucapsaBrand.colors.redSoft;
  const isClient = Boolean(user) && !isStaff;
  const isGuest = !user && !isStaff;
  const icon = (name: keyof typeof MaterialIcons.glyphMap) => ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <TabIcon name={name} color={color} size={size} focused={focused} activeSurface={activeSurface} />
  );

  return (
    <Tabs
      initialRouteName={trainerWorkspace ? 'trainer-home' : adminWorkspace ? 'admin-home' : 'home'}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 2 },
        tabBarIconStyle: { marginTop: 1 },
        tabBarItemStyle: { paddingTop: 3 },
        tabBarStyle: {
          height: 68 + tabBottomInset,
          paddingTop: 7,
          paddingBottom: tabBottomInset,
          paddingHorizontal: 4,
          backgroundColor: tabBackground,
          borderTopColor: tabBorder,
          borderTopWidth: 1,
          shadowColor: ucapsaBrand.colors.black,
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -4 },
          elevation: 14,
        },
        sceneStyle: { backgroundColor: isStaff ? ucapsaBrand.colors.background : format.background },
      }}
    >
      <Tabs.Screen name="home" options={{ href: isStaff ? null : '/home', title: 'Inicio', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="classes" options={{ href: isClient ? '/classes' : null, title: 'Clases', tabBarIcon: icon('school') }} />
      <Tabs.Screen name="calendar" options={{ href: isStaff ? null : '/calendar', title: isClient ? 'Agenda' : 'Calendario', tabBarIcon: icon('calendar-month') }} />
      <Tabs.Screen name="dog" options={{ href: isClient ? '/dog' : null, title: 'Mis perros', tabBarIcon: icon('pets') }} />
      <Tabs.Screen name="profile" options={{ href: isStaff ? null : '/profile', title: 'Perfil', tabBarIcon: icon('person') }} />

      <Tabs.Screen name="services" options={{ href: isGuest ? '/services' : null, title: 'Servicios', tabBarIcon: icon('grid-view') }} />
      <Tabs.Screen name="payments" options={{ href: null, title: 'Pagos', tabBarIcon: icon('account-balance-wallet') }} />
      <Tabs.Screen name="announcements" options={{ href: isGuest ? '/announcements' : null, title: 'Avisos', tabBarIcon: icon('campaign') }} />
      <Tabs.Screen name="membership" options={{ href: null, title: 'Mi UCAPSA', tabBarIcon: icon('workspace-premium') }} />

      <Tabs.Screen name="admin-home" options={{ href: adminWorkspace ? '/admin-home' : null, title: 'Inicio', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="admin-clients" options={{ href: adminWorkspace ? '/admin-clients' : null, title: 'Clientes', tabBarIcon: icon('people-alt') }} />
      <Tabs.Screen name="admin-classes" options={{ href: adminWorkspace ? '/admin-classes' : null, title: 'Clases', tabBarIcon: icon('school') }} />
      <Tabs.Screen name="admin-payments" options={{ href: adminWorkspace ? '/admin-payments' : null, title: 'Pagos', tabBarIcon: icon('payments') }} />
      <Tabs.Screen name="admin-communication" options={{ href: adminWorkspace ? '/admin-communication' : null, title: 'Comunic.', tabBarIcon: icon('campaign') }} />
      <Tabs.Screen name="admin-more" options={{ href: null, title: 'Herramientas', tabBarIcon: icon('settings') }} />

      <Tabs.Screen name="trainer-home" options={{ href: trainerWorkspace ? '/trainer-home' : null, title: 'Inicio', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="trainer-classes" options={{ href: trainerWorkspace ? '/trainer-classes' : null, title: 'Clases', tabBarIcon: icon('school') }} />
      <Tabs.Screen name="trainer-exams" options={{ href: trainerWorkspace ? '/trainer-exams' : null, title: 'Exámenes', tabBarIcon: icon('assignment') }} />
      <Tabs.Screen name="trainer-more" options={{ href: trainerWorkspace ? '/trainer-more' : null, title: 'Más', tabBarIcon: icon('more-horiz') }} />
    </Tabs>
  );
}
