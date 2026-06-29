import { PlaceholderPage } from '../../components/ui/PlaceholderPage';

export default function CalendarScreen() {
  return (
    <PlaceholderPage
      eyebrow="Agenda"
      title="Calendario"
      subtitle="Eventos, cursos, reuniones y fechas importantes."
      cards={[
        {
          meta: 'Evento',
          title: 'Evento publico de prueba',
          body: 'Esta tarjeta sera reemplazada por eventos reales desde Supabase.',
        },
        {
          meta: 'Filtro futuro',
          title: 'Publico, clientes y socios',
          body: 'El calendario cambiara segun la audiencia y el estado de membresia.',
        },
      ]}
    />
  );
}
