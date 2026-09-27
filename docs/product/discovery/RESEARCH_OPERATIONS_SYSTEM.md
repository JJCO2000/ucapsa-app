# Investigación — dependencia operativa y sistema de información UCAPSA

**Fecha:** 27 de septiembre de 2026  
**Origen:** INT-002 + investigación externa

## Hallazgo de la entrevista

INT-002 muestra una dependencia potencial de Secretaría/Administración para responder preguntas operativas frecuentes: deudas, fechas de salida de hotel y programación de clases.

Esto no se interpreta todavía como “necesitamos comprar un CRM”. La pregunta correcta es:

> ¿Qué información debe poder consultar cada rol por sí mismo, quién la mantiene actualizada y cuál es la fuente oficial?

## Patrón externo 1 — Single Source of Truth

Atlassian define una Single Source of Truth como un repositorio central donde todo el equipo puede encontrar la información más precisa y actualizada. Su recomendación es auditar información duplicada/contradictoria y consolidarla en una ubicación oficial.

Referencia:
https://www.atlassian.com/es/work-management/knowledge-sharing/documentation/building-a-single-source-of-truth-ssot-for-your-team

Esto encaja directamente con el riesgo observado: hoy la “fuente oficial” parece ser una persona, no un sistema accesible.

## Patrón externo 2 — software vertical de negocios de mascotas

Los productos maduros del sector no separan cliente, perro, agenda y cobros en silos aislados; los conectan en un mismo sistema operativo.

### Gingr

Para entrenamiento canino integra:

- perfiles de clientes/perros;
- clases grupales y privadas;
- inscripciones;
- pagos;
- notas de progreso;
- calendario;
- niveles;
- reservas recurrentes.

Referencias:
https://www.gingrapp.com/dog-training-software
https://www.gingrapp.com/

### PetExec

Para entrenamiento y hotel incluye:

- rosters de clases;
- calendario;
- pagos;
- portal del cliente;
- boarding;
- ocupación;
- historial de transacciones;
- reservas;
- recordatorios.

Referencias:
https://www.petexec.net/service/trainers
https://www.petexec.net/service/boarders
https://www.petexec.net/service/scheduled-services

### MoeGo

Su módulo Boarding & Daycare centraliza:

- reservas;
- ocupación;
- estancia;
- cuidado;
- comunicación;
- tareas;
- información del cliente/perro.

Referencia:
https://help.moego.pet/en/articles/14106724-boarding-daycare-overview

### Pawfinity

Ofrece perfiles de cliente/perro, reservas, boarding/daycare, historial de servicios, pagos, notificaciones y dashboard del cliente.

Referencias:
https://www.pawfinity.com/new-features/
https://www.pawfinity.com/dog-daycare-software/

## Qué significa para UCAPSA

El patrón competitivo importante no es “tener CRM”. Es:

**cada dato operativo debe vivir en un sistema canónico y ser consultable por el rol que lo necesita.**

Para UCAPSA la arquitectura objetivo debería separar tres capas:

### 1. System of Record

Datos canónicos:

- cliente;
- perro;
- programas;
- inscripción;
- nivel;
- asistencia;
- pagos/deuda;
- membresía;
- hotel/reservas/entrada/salida;
- eventos/clases;
- seguimiento;
- historial de cambios.

### 2. Vistas por rol

**Secretaría/Administración**
- editar y registrar.

**Admin / operación**
- consultar todo lo necesario para decidir.

**Instructor**
- clases, roster, perro, nivel, asistencias y notas operativas necesarias.

**Cliente**
- sólo sus propios datos y servicios.

### 3. Alertas por excepción

El equipo no debería preguntar “¿a quién tengo que revisar?”. El sistema debe mostrar:

- deuda/pendiente;
- salida de hotel próxima;
- sobreocupación;
- cliente sin continuidad;
- 30 días sin asistencia;
- cambios/cancelaciones;
- clase próxima con inscritos.

## Gap confirmado por inspección del repo

La app ya tiene clientes, perros, clases, inscripciones, asistencias, membresías y pagos.

No se encontró actualmente un módulo de **hotel / boarding / hospedaje / reservas de estancia** en el repositorio.

Eso significa que, aunque UCAPSA App ya puede reducir parte de la dependencia de Secretaría, **las preguntas de hotel todavía no tienen una fuente digital canónica dentro de la app**.

## Cursos útiles

### HubSpot Academy

Cursos gratuitos para entender fundamentos de CRM, contactos, procesos y reportes:

https://academy.hubspot.com/es/courses
https://academy.hubspot.com/lessons/setting-up-your-crm

Útil para:
- modelar cliente;
- pipeline/seguimiento;
- propiedad de datos;
- reporting;
- automatización básica.

### Salesforce Trailhead — CRM Fundamentals

Ruta gratuita de fundamentos de CRM y modelado de cuentas/contactos/reportes:

https://trailhead.salesforce.com/content/learn/trails/crm-essentials-lightning-experience

Útil para:
- entender objetos/registros;
- relaciones entre datos;
- diseño de sistema;
- dashboards;
- procesos administrativos.

## Recomendación provisional

**No comprar todavía HubSpot/Salesforce/MoeGo/Gingr.**

Primero mapear 10–15 preguntas operativas que hoy requieren preguntarle a Secretaría.

Para cada una registrar:

1. pregunta;
2. quién la hace;
3. frecuencia;
4. de dónde obtiene la respuesta Secretaría;
5. si ese dato ya existe en UCAPSA App;
6. si está actualizado;
7. quién debe poder verlo;
8. quién debe poder editarlo;
9. qué pasa si no está disponible.

Después podremos decidir con evidencia entre:

- ampliar UCAPSA App como sistema operativo principal;
- usar un CRM externo;
- usar software vertical pet-care;
- integrar dos sistemas.

## Próximo experimento

Durante una semana, cada vez que alguien le pregunte algo a Secretaría, registrar la pregunta.

Métrica:

**Consultas a Secretaría que podrían haberse resuelto con un dato estructurado/autoservicio.**

Esto convierte una percepción en evidencia cuantitativa.
