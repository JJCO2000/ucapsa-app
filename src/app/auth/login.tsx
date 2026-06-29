import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function LoginScreen() {
  return (
    <PlaceholderPage
      theme="dark"
      eyebrow="Acceso"
      title="Iniciar sesion"
      subtitle="Aqui conectaremos Supabase Auth."
      cards={[
        {
          meta: 'Temporal',
          title: 'Acceso de prueba',
          body: 'Por ahora este boton permite entrar a las tabs sin autenticacion real.',
        },
      ]}
      links={[
        { label: 'Entrar temporalmente', href: '/home', variant: 'primary' },
        { label: 'Crear cuenta', href: '/auth/register' },
        { label: 'Recuperar password', href: '/auth/forgot-password' },
      ]}
    />
  );
}
