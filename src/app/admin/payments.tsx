import { Redirect } from 'expo-router';
import { useSession } from '../../hooks/useSession';

export default function AdminPaymentsRedirect() {
  const { isAdmin } = useSession();
  return <Redirect href={isAdmin ? '/admin-payments' : '/home'} />;
}
