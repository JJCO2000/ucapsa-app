import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function AnnouncementsScreen() {
  return (
    <PlaceholderPage
      eyebrow="Comunicacion"
      title="Anuncios"
      subtitle="Canal oficial para avisos publicos, clientes, socios y administradores."
      cards={[
        {
          meta: 'Fijado',
          title: 'Bienvenido a UCAPSA App',
          body: 'Aqui apareceran comunicados importantes y avisos segmentados por tipo de usuario.',
        },
        {
          meta: 'Socios',
          title: 'Avisos exclusivos',
          body: 'Los socios activos podran ver informacion que no debe aparecer para visitantes.',
        },
      ]}
    />
  );
}
