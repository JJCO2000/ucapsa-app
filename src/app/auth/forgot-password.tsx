import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function ForgotPasswordScreen() {
  return (
    <PlaceholderPage
      theme="dark"
      eyebrow="Cuenta"
      title="Recuperar password"
      subtitle="Aqui ira el flujo de recuperacion con Supabase."
      links={[{ label: 'Volver a login', href: '/auth/login', variant: 'primary' }]}
    />
  );
}
