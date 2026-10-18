import { Slot } from 'expo-router';

// The web shell owns navigation. Do not repeat the mobile tab bar in a browser.
// This route group shares the same screens, services and Supabase authorization.
export default function WebTabsLayout() {
  return <Slot />;
}
