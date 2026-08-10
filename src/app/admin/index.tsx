import { Redirect } from 'expo-router';
import { useSession } from '../../hooks/useSession';

export default function AdminIndexScreen() {
  const { isAdmin } = useSession();
  return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;
}
