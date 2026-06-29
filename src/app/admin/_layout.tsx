import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Admin UCAPSA',
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#ffffff',
      }}
    />
  );
}
