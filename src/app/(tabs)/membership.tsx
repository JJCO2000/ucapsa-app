import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function MembershipScreen() {
  return (
    <PlaceholderPage
      eyebrow="Cuenta"
      title="Mi UCAPSA"
      subtitle="Credencial digital, estado de membresia, QR y pagos manuales."
      cards={[
        {
          meta: 'Membresia',
          title: 'Estado pendiente',
          body: 'Aqui se mostrara si el usuario es visitante, cliente o socio activo.',
        },
        {
          meta: 'Credencial',
          title: 'QR de socio',
          body: 'El QR no guardara datos personales. Usara un token consultado en Supabase.',
        },
        {
          meta: 'Pagos',
          title: 'Pagos manuales',
          body: 'En el MVP no cobraremos en linea. El admin podra marcar pagos como pendientes o pagados.',
        },
      ]}
      links={[
        { label: 'Solicitar membresia', href: '/request-membership', variant: 'primary' },
        { label: 'Iniciar sesion', href: '/auth/login' },
      ]}
    />
  );
}
