# UCAPSA: integración de patrones UX probados (PR #341)

**Alcance:** guía de implementación. Se integraron patrones de fuentes oficiales usando las dependencias y componentes existentes. No se importó código de terceros ni se añadieron servicios de pago.

## 1. Documentación pública consultada

| Referencia | Hallazgo respaldado | Aplicación concreta en UCAPSA |
|---|---|---|
| Nielsen Norman Group — Mobile Tutorials: Wasted Effort or Efficiency Boost? | Tutoriales de tarjetas no mostraron mejoras en completar tareas; el tutorial obligatorio puede hacer que la app parezca más compleja | La ayuda sigue siendo **opcional**; acceso persistente desde Perfil. La acción principal permanece en la pantalla funcional. |
| Nielsen Norman Group — Usability for Older Adults: Challenges and Changes | Investigación cualitativa con personas de 65+ sobre etiquetas, destinos táctiles, legibilidad y navegación | Priorizar textos entendibles, acceso visible a Restaurante y cursos y no ocultar acciones detrás de varias pantallas. No extrapolar automáticamente a todas las personas de 50+. |
| Android Developers — Accessibility in Jetpack Compose (codelab) | Áreas de toque recomendadas de al menos 48×48 dp y descripciones accesibles | En el anillo mensual se amplió el área táctil sin variar el tamaño del círculo; controles principales conservan mínimo de 48 dp. |
| React Native — AccessibilityInfo API | `isReduceMotionEnabled` y evento `reduceMotionChanged` | El calendario reduce el movimiento automáticamente cuando el dispositivo lo solicita. |
| React Navigation — Supporting Safe Areas / Bottom Tabs Navigator | Insets y espacio real de la barra para que la pantalla no tape contenido | Mantener `Screen.tsx`, `KeyboardAwareScreen.tsx`, márgenes de pestañas y guard de UI existente; no instalar un segundo sistema de layout. |
| GitHub Docs — Reusing other people's code | La licencia determina permisos de copia y uso comercial | No insertar código sin licencia, ni nuevas dependencias innecesarias. |

### Enlaces

- https://www.nngroup.com/articles/mobile-tutorials/
- https://www.nngroup.com/articles/usability-for-senior-citizens/
- https://developer.android.com/codelabs/jetpack-compose-accessibility
- https://reactnative.dev/docs/accessibilityinfo
- https://reactnavigation.org/docs/handling-safe-area/
- https://reactnavigation.org/docs/bottom-tab-navigator/
- https://docs.github.com/en/get-started/learning-to-code/reusing-other-peoples-code-in-your-projects

## 2. Bibliotecas existentes comparadas

- **rn-tourguide**, MIT: https://github.com/xcarpentier/rn-tourguide
- **react-native-tour-guide**, MIT: https://github.com/himanshu-lal4/react-native-tour-guide

Se evaluó su funcionalidad (resaltar controles y recorridos). No se instalaron: en UCAPSA ya está implementada la guía breve, reabrible y omisible, y agregar una biblioteca de tour no corrige por sí solo problemas de navegación. Si más adelante se incorpora una, respetar su licencia y obligaciones de atribución.

## 3. Acuerdos de UCAPSA que estas correcciones preservan

- **Puppy School:** 4 sesiones oficiales aunque la tarjeta impresa tenga 6 casillas físicas.
- **Comandos:** un único horario compartido para Básico, Intermedio y Avanzado; 6 sesiones para el ciclo correspondiente. No crear otra agenda por nivel.
- **Solicitudes de curso:** prioridad urgente, registro formal aparte de inscripción, seguimiento en Administración y enlace al WhatsApp oficial. No dar rol administrativo a Alejandra por suposición.
- **Calendario:** mes completo, anillo por categorías de actividad efectiva y **un solo sector de noticias** del color de la noticia de mayor prioridad. Ninguna noticia se convierte en clase disponible. Estado desconocido no significa «día libre».
- **Inicio/cliente:** Restaurante accesible, creación de perro como paso útil, Top 3 y apertura de clasificación completa; tutorial opcional, con instrucciones concretas.
- **Avatares:** seleccionables y estables por perro; no aleatorizar identidad en cada visita; animaciones discretas y respetar reducir movimiento.
- **Navegación:** las cinco pestañas de cliente conservan su función, ningún botón debe quedar oculto por barra o teclado. Staff permanece fuera de la superficie de clientes.
- **Guardería Canina:** base documental interna únicamente, sin mensajes, horarios ni rutas públicas.

## 4. Cambios correctivos integrados al PR

1. WhatsApp nunca asegura que una solicitud quedó guardada solo porque se intentó abrir el enlace; la acción inmediata tras confirmar guardado conserva el estado correcto.
2. Administración actualiza la bandeja después de confirmar la escritura y no afirma que el cambio no se realizó si hay incertidumbre de conectividad.
3. Calendario muestra «Agenda sin confirmar» cuando alguna fuente está incompleta, en vez de afirmar «Día libre».
4. Desplazamiento de calendario es animado salvo que el sistema solicite reducir movimiento.
5. El color del sector de noticias se determina por **prioridad**, usando «fijado» únicamente como desempate.
6. El área táctil de fechas se amplía sin desfigurar los anillos existentes.
7. Los scripts de quality gate vigilan estos contratos.

## 5. Límites de verificación

CI y exportaciones prueban integridad automatizada, **no** permisos reales de Supabase, accesibilidad física, sincronización real o ausencia de superposiciones en todos los teléfonos. Las migraciones del PR siguen sin aplicar. No crear infraestructura de pago ni afirmar que producción dispone de las nuevas funciones antes de habilitarlas.
