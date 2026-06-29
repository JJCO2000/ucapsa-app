import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function HomeScreen() {
  return (
    <PlaceholderPage
      eyebrow="UCAPSA"
      title="Inicio"
      subtitle="Resumen rapido para clientes, socios y equipo UCAPSA."
      cards={[
        {
          meta: 'MVP',
          title: 'Comunicacion oficial',
          body: 'Anuncios, calendario y membresia en una app clara, no una copia de la pagina web.',
        },
        {
          meta: 'Hoy',
          title: 'Proximos pasos',
          body: 'Primero validamos navegacion. Despues conectamos Supabase, roles y datos reales.',
        },
        {
          meta: 'Acceso',
          title: 'Usuarios diferentes',
          body: 'Visitantes ven informacion publica. Clientes pueden registrarse. Socios ven credencial y pagos. Admins gestionan contenido.',
        },
      ]}
      links={[
        { label: 'Ver Mi UCAPSA', href: '/membership', variant: 'primary' },
        { label: 'Ir a anuncios', href: '/announcements' },
      ]}
    />
  );
}
