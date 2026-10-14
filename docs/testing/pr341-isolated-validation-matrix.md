# PR #341 — Protocolo de validación aislada (NO PRODUCCIÓN)

**Estado:** preparado; no ejecutado. Requiere una rama Supabase de desarrollo creada con autorización previa de organización/costo.

## Condiciones de entrada (bloqueantes)
- La rama Supabase debe tener un `project_ref` distinto al de producción, sin datos de producción.
- Confirmar que ambas migraciones del PR están aplicadas **en orden**:
  - `20261014002108_program_interest_requests.sql`
  - `20261014002120_expand_dog_avatars.sql`
- Configurar en el cliente de pruebas únicamente claves publicables de esa rama. Nunca `service_role` en una app cliente.
- Registrar identidades ficticias distintas: cliente A, cliente B, administrador, superadministrador y entrenador.
- Crear dos perros de A y uno de B; sus usuarios deben ser propietarios efectivos.
- Las pruebas deben ejecutarse contra la rama, no contra el proyecto de producción. No traer datos reales a la rama.

## Objetivo 1 — Seguridad (100% casos aprobados)
| ID | Escenario | Resultado requerido |
|---|---|---|
| SEG-01 | Invitado intenta leer o insertar solicitudes | Denegado |
| SEG-02 | Cliente A solicita Puppy para su perro activo | Permitido; estado `pending` y prioridad `urgent` |
| SEG-03 | Cliente A intenta solicitar un curso para el perro de B | Denegado |
| SEG-04 | Cliente A intenta leer solicitudes de B | Sin filas |
| SEG-05 | Cliente A intenta actualizar `status` | Denegado |
| SEG-06 | Cliente A intenta fijar `priority`, `updated_at` o campos fuera de columnas permitidas | Denegado |
| SEG-07 | Entrenador intenta modificar solicitudes | Denegado |
| SEG-08 | Admin y Superadmin pueden leer bandeja y actualizar únicamente estado | Permitido |
| SEG-09 | Admin `pending → closed` sin seguimiento previo | Denegado |
| SEG-10 | Admin `pending → contacted → closed` | Permitido, `updated_at` cambia en servidor |
| SEG-11 | Intento de reabrir `closed` | Denegado |
| SEG-12 | Eliminación legítima de usuario/perro ficticio | No bloqueada por solicitudes; sin remanentes huérfanos |

## Objetivo 2 — Integridad del producto (100% casos aprobados)
| ID | Escenario | Resultado requerido |
|---|---|---|
| INT-01 | Dos solicitudes simultáneas mismo usuario/perro/programa | Una sola solicitud abierta |
| INT-02 | Puppy y Comandos para mismo perro | Dos solicitudes válidas distintas |
| INT-03 | Nueva solicitud después de cerrar la anterior | Permitida; conserva historial de la cerrada |
| INT-04 | Crear solicitud comercial | Cero nuevas inscripciones, asistencias y pagos |
| INT-05 | Puppy: 4 clases requeridas | Sin cambios en progresión existente |
| INT-06 | Comandos: un solo horario; niveles separados | No se crea otro `schedule_id` |
| INT-07 | Avatares preexistentes | Se leen y editan sin cambio visual forzado |
| INT-08 | Guardar uno de los 15 avatares y uno de 8 colores | Persiste para propietario y ranking público; foto privada sin filtraciones |

## Objetivo 3 — Experiencia y accesibilidad (100% flujos críticos)
| ID | Escenario | Resultado requerido |
|---|---|---|
| UX-01 | Cliente nuevo sin perro | Botón explícito «Agregar mi perro» |
| UX-02 | Cliente sin clases | «Solicitar Puppy» y «Solicitar Comandos» visibles |
| UX-03 | Solicitud creada | Mensaje veraz + WhatsApp opcional |
| UX-04 | Backend fuera de línea | Mensaje de error, «Reintentar» y WhatsApp; no afirmar registro |
| UX-05 | Admin consulta bandeja | Pendientes primero, después seguimiento, más antiguos primero |
| UX-06 | Admin no puede consultar solicitudes | No muestra «Todo al día» |
| UX-07 | Día con Puppy, Comandos y noticia | Tres tercios iguales, noticia con color configurable |
| UX-08 | Falla carga de noticias | Anillo se declara no verificado |
| UX-09 | Seleccionar fecha | Desplazamiento suave a la agenda, con reducción de movimiento respetada |
| UX-10 | Top 3 | Posiciones oficiales, sin inventar resultados; detalles al tocar |
| UX-11 | Restaurante y guía | Accesibles en menos de 2 toques desde Inicio |
| UX-12 | Tamaños de letra, teclado, navegación inferior | Ningún botón ni final de pantalla tapados |

## Procedimiento para certificar
1. Ejecutar primero `npm run verify:release`, CodeQL y exportaciones Android/iOS.
2. Migraciones aplicadas en el proyecto UCAPSA el 13 de octubre (hora México), conservando el historial real de versiones. La prueba con cuentas/roles reales sigue siendo un paso de aceptación.
3. Regenerar tipos de la rama y retirar el adaptador provisional `InterestDb`.
4. Ejecutar SEG/INT con usuarios ficticios desde clientes autenticados; guardar solo IDs sintéticos y evidencias sin datos personales.
5. Ejecutar UX manual en Android con navegación por gestos y de tres botones, teléfono pequeño y texto 150%; repetir flujo crítico en iOS.
6. Registrar casos fallidos y corregir en PR separado/commits antes de levantar estado `draft`.
7. Publicación bloqueada hasta pruebas de dispositivos, permisos, consentimiento y comprobación explícita del equipo UCAPSA.

### Guardar evidencia de resultados
| ID | PASS/FAIL/BLOCKED | Entorno/fecha | Evidencia | Responsable |
|---|---|---|---|---|
| Todos | BLOCKED hasta rama aislada | — | — | — |

**No usar este documento como prueba de aprobación.** Es un protocolo de ejecución pendiente.
