// Fuente única para la guía voluntaria y los consejos por pestaña.
export const clientHelpGuides = [
  {
    tab: 'home', icon: 'home', title: 'Inicio', headline: 'Tu próximo paso está aquí',
    description: 'Revisa tu próxima clase y los avisos que necesitan tu atención.',
    action: 'Ver clases', route: '/classes',
  },
  {
    tab: 'classes', icon: 'school', title: 'Clases', headline: 'Entrena y sigue avanzando',
    description: 'Consulta tus entrenamientos y abre cada clase para ver los detalles.',
    action: 'Explorar servicios', route: '/services',
  },
  {
    tab: 'calendar', icon: 'event', title: 'Agenda', headline: 'Organiza tus próximas visitas',
    description: 'Elige un día para consultar clases, actividades y cambios de horario.',
    action: 'Consultar avisos', route: '/announcements',
  },
  {
    tab: 'dog', icon: 'pets', title: 'Mis perros', headline: 'Todo el progreso de tu perro',
    description: 'Consulta sus logros y su nivel. En Datos del perro puedes elegir avatar y color.',
    action: 'Ver mis perros', route: '/dog',
  },
  {
    tab: 'profile', icon: 'person', title: 'Perfil', headline: 'Tu cuenta, a tu manera',
    description: 'Actualiza tus datos y consulta pagos, membresía y notificaciones.',
    action: 'Revisar mis datos', route: '/account-settings?section=profile&from=profile',
  },
] as const;

export type ClientHelpTab = typeof clientHelpGuides[number]['tab'];

export function getClientHelpGuide(tab: ClientHelpTab) {
  return clientHelpGuides.find((guide) => guide.tab === tab)!;
}
