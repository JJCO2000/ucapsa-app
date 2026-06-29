import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function AdminDashboardScreen() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Panel UCAPSA"
      subtitle="Gestion para socios, pagos manuales, anuncios y eventos."
      cards={[
        {
          meta: 'Dashboard',
          title: 'Metricas basicas',
          body: 'Aqui veremos socios activos, pagos pendientes, solicitudes y eventos proximos.',
        },
        {
          meta: 'Seguridad',
          title: 'Solo administradores',
          body: 'Mas adelante esta zona se protegera con roles y RLS desde Supabase.',
        },
      ]}
      links={[
        { label: 'Gestionar socios', href: '/admin/members', variant: 'primary' },
        { label: 'Gestionar pagos', href: '/admin/payments' },
        { label: 'Gestionar anuncios', href: '/admin/announcements' },
        { label: 'Gestionar eventos', href: '/admin/events' },
      ]}
    />
  );
}
