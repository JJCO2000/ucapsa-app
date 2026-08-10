import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, role, isAdmin } = useSession();
  const format = resolveUcapsaFormat({ user, role, isAdmin });
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 12);
  const isPremium = format.key === 'member';
  const tabBackground = isAdmin ? '#FFFFFF' : isPremium ? '#17060A' : format.surface;
  const tabBorder = isAdmin ? '#F0D4DA' : isPremium ? '#5A1824' : format.border;
  const inactiveTint = isAdmin ? '#8A6973' : isPremium ? '#D7A0A9' : '#B197A0';
  const activeTint = isAdmin ? '#C91F37' : format.accent;
  const isClient = Boolean(user) && !isAdmin;
  const isGuest = !user && !isAdmin;

  return (
    <Tabs
      initialRouteName={isAdmin ? 'admin-home' : 'home'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800', marginBottom: 0 },
        tabBarIconStyle: { marginTop: 4 },
        tabBarStyle: {
          height: 58 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          backgroundColor: tabBackground,
          borderTopColor: tabBorder,
          borderTopWidth: 1,
        },
        sceneStyle: { backgroundColor: isAdmin ? '#FFF8F8' : format.background },
      }}
    >
      <Tabs.Screen name="home" options={{ href: isAdmin ? null : '/home', title: 'Inicio', tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="services" options={{ href: isAdmin ? null : '/services', title: 'Servicios', tabBarIcon: ({ color, size }) => <MaterialIcons name="apps" size={size} color={color} /> }} />
      <Tabs.Screen name="classes" options={{ href: isClient ? '/classes' : null, title: 'Clases', tabBarIcon: ({ color, size }) => <MaterialIcons name="school" size={size} color={color} /> }} />
      <Tabs.Screen name="payments" options={{ href: isClient ? '/payments' : null, title: 'Pagos', tabBarIcon: ({ color, size }) => <MaterialIcons name="payments" size={size} color={color} /> }} />
      <Tabs.Screen name="dog" options={{ href: isClient ? '/dog' : null, title: 'Mi perro', tabBarIcon: ({ color, size }) => <MaterialIcons name="pets" size={size} color={color} /> }} />

      <Tabs.Screen name="announcements" options={{ href: isGuest ? '/announcements' : null, title: 'Anuncios', tabBarIcon: ({ color, size }) => <MaterialIcons name="campaign" size={size} color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ href: isGuest ? '/calendar' : null, title: 'Calendario', tabBarIcon: ({ color, size }) => <MaterialIcons name="event" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ href: isGuest ? '/profile' : null, title: 'Perfil', tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={size} color={color} /> }} />
      <Tabs.Screen name="membership" options={{ href: null, title: 'Mi UCAPSA', tabBarIcon: ({ color, size }) => <MaterialIcons name="badge" size={size} color={color} /> }} />

      <Tabs.Screen name="admin-home" options={{ href: isAdmin ? '/admin-home' : null, title: 'Inicio', tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="admin-clients" options={{ href: isAdmin ? '/admin-clients' : null, title: 'Clientes', tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={size} color={color} /> }} />
      <Tabs.Screen name="admin-classes" options={{ href: isAdmin ? '/admin-classes' : null, title: 'Clases', tabBarIcon: ({ color, size }) => <MaterialIcons name="school" size={size} color={color} /> }} />
      <Tabs.Screen name="admin-payments" options={{ href: isAdmin ? '/admin-payments' : null, title: 'Pagos', tabBarIcon: ({ color, size }) => <MaterialIcons name="payments" size={size} color={color} /> }} />
      <Tabs.Screen name="admin-more" options={{ href: isAdmin ? '/admin-more' : null, title: 'Mas', tabBarIcon: ({ color, size }) => <MaterialIcons name="settings" size={size} color={color} /> }} />
    </Tabs>
  );
}
