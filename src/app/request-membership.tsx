import { PlaceholderPage } from '../components/ui/PlaceholderPage';

export default function RequestMembershipScreen() {
  return (
    <PlaceholderPage
      eyebrow="Solicitud"
      title="Solicitar membresía"
      subtitle="Flujo para que un cliente pida convertirse en socio UCAPSA."
      cards={[
        {
          meta: 'Paso 1',
          title: 'Crear cuenta',
          body: 'Primero el cliente debe tener cuenta para asociar su solicitud.',
        },
        {
          meta: 'Paso 2',
          title: 'Revisión admin',
          body: 'El administrador revisará y aprobara la membresía en el panel.',
        },
      ]}
      links={[
        { label: 'Crear cuenta', href: '/auth/register', variant: 'primary' },
        { label: 'Volver a Mi UCAPSA', href: '/membership' },
      ]}
    />
  );
}
