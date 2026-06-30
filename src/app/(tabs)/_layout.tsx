import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ucapsaBrand } from '../../constants/brand';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 12);

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ucapsaBrand.colors.red,
        tabBarInactiveTintColor: '#B197A0',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        tabBarStyle: {
          height: 58 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          backgroundColor: '#FFFCFC',
          borderTopColor: ucapsaBrand.colors.border,
          borderTopWidth: 1,
        },
        sceneStyle: {
          backgroundColor: ucapsaBrand.colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Anuncios',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="campaign" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="event" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="membership"
        options={{
          title: 'Mi UCAPSA',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="badge" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
