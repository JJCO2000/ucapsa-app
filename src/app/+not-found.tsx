import { PlaceholderPage } from '../components/ui/PlaceholderPage';

export default function NotFoundScreen() {
  return (
    <PlaceholderPage
      eyebrow="UCAPSA"
      title="Pantalla no encontrada"
      subtitle="La ruta que intentaste abrir no existe."
      links={[{ label: 'Volver al inicio', href: '/home', variant: 'primary' }]}
    />
  );
}
