import { Redirect } from 'expo-router';
import { useSession } from '../../hooks/useSession';

export default function LegacyMembershipRoute() {
  const { isAdmin } = useSession();
  return <Redirect href={isAdmin ? '/admin-more' : '/client/membership'} />;
}
