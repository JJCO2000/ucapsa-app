import { Redirect } from 'expo-router';

import { useSession } from '../../hooks/useSession';

export default function LegacyUcapsaPointsRoute() {
  const { isAdmin } = useSession();
  return <Redirect href={isAdmin ? '/admin/competition-adjustments' : '/dog'} />;
}
