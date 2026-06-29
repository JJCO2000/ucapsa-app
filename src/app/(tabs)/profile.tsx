import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function ProfileScreen() {
  return (
    <PlaceholderPage
      eyebrow="Perfil"
      title="Perfil"
      subtitle="Datos del usuario, ayuda, contacto y acceso administrativo cuando aplique."
      cards={[
        {
          meta: 'Cuenta',
          title: 'Datos personales',
          body: 'Aqui ira nombre, correo, telefono y cierre de sesion.',
        },
        {
          meta: 'Soporte',
          title: 'Contacto UCAPSA',
          body: 'Perfil tambien debe servir para ayuda, ubicacion y datos de contacto.',
        },
      ]}
      links={[
        { label: 'Iniciar sesion', href: '/auth/login', variant: 'primary' },
        { label: 'Panel admin temporal', href: '/admin' },
      ]}
    />
  );
}
