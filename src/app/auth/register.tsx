import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function RegisterScreen() {
  return (
    <PlaceholderPage
      theme="dark"
      eyebrow="Registro"
      title="Crear cuenta"
      subtitle="Aqui ira el registro para clientes y futuros socios."
      cards={[
        {
          meta: 'Rol inicial',
          title: 'Cliente',
          body: 'Todo usuario nuevo nacera como cliente. Solo admin puede aprobar socios o roles.',
        },
      ]}
      links={[{ label: 'Ya tengo cuenta', href: '/auth/login', variant: 'primary' }]}
    />
  );
}
