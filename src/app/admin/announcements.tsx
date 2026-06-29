import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function AdminAnnouncementsScreen() {
  return (
    <PlaceholderPage
      eyebrow="Admin"
      title="Gestionar anuncios"
      subtitle="Crear, editar, fijar y segmentar comunicados."
      cards={[
        { meta: 'Audiencia', title: 'Segmentacion', body: 'Publico, clientes, socios y admins.' },
      ]}
    />
  );
}
