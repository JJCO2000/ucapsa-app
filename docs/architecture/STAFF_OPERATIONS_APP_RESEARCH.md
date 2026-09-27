# Hipótesis de arquitectura — UCAPSA Staff / Operaciones

**Fecha:** 27 de septiembre de 2026  
**Estado:** investigación / no implementar todavía

## Hipótesis

Separar la experiencia del cliente de la experiencia operativa del personal:

- **UCAPSA App**: cliente/socio.
- **UCAPSA Staff**: empleados, entrenadores, supervisión y operación.
- **Supabase**: núcleo operativo compartido y capa de seguridad.
- **CRM (p. ej. Pipedrive)**: relación con cliente, seguimiento, conversaciones, próxima acción y pipeline.
- Integración CRM ↔ Supabase sólo desde backend/funciones seguras. Nunca guardar secretos del CRM en las apps móviles.

No crear dos bases de datos maestras para el mismo dato.

## Por qué considerar un front-end Staff separado

Los trabajos son distintos.

Cliente:
- próxima clase;
- asistencias;
- pagos;
- perro;
- logros;
- siguiente paso.

Personal:
- perros actualmente en instalaciones;
- asignación de perrera;
- cuidado diario;
- pendientes por turno;
- control de calidad del internado;
- evaluaciones por nivel;
- evidencia/fotos/videos;
- handoffs;
- incidencias;
- saber qué requiere atención hoy.

Mantenerlos en una sola navegación incrementa densidad y riesgo de mezclar superficies que no comparten el mismo trabajo.

## Benchmark de software del sector

### Gingr

El producto incluye:
- reportes de alimentación y medicación por estancia;
- checklist diario con registro de quién completó una tarea y a qué hora;
- calendarios de instalaciones;
- ocupación/lodging;
- report cards para clientes;
- gestión de personal y acceso por ubicación.

Esto confirma que el patrón "operación interna + comunicación al dueño" existe en software vertical de pet care.

### KennelBooker

Incluye:
- boarding / board & train;
- asignación de habitaciones;
- registro de alimentación, ejercicio y otras actividades;
- to-do lists asignables al personal;
- tareas ligadas a una reservación/cliente;
- tareas recurrentes.

### PetExec

Incluye:
- boarding, daycare, grooming y training;
- schedules;
- employee locations/tasks/time clock;
- portal/app separada para pet parents.

### BusyPaws

Incluye:
- dog training;
- notas compartidas;
- report cards;
- progreso;
- booking;
- comunicación;
- portal del cliente y LMS.

## Implicación

El patrón común no es "una sola pantalla para todos".

El patrón es:
1. una base operativa común;
2. una superficie de trabajo para staff;
3. una superficie de autoservicio/comunicación para cliente;
4. roles/permisos;
5. registro auditable de acciones.

## Recomendación provisional

Para UCAPSA, explorar **dos front-ends compartiendo Supabase**, no dos sistemas aislados.

Arquitectura conceptual:

```
UCAPSA Cliente ───────┐
                      ├── Supabase (núcleo operativo)
UCAPSA Staff ─────────┘          │
                                 ├── Edge Functions / integración
                                 │
                                 └── CRM (Pipedrive u otro)
```

## Propiedad provisional de datos

### Supabase — maestro operativo
- perros;
- programas;
- clases/asistencias;
- internado/estancias;
- perrera/ubicación;
- cuidado diario;
- evaluaciones;
- niveles;
- evidencias;
- pagos/estado que necesita consultar el cliente;
- auditoría de quién hizo qué.

### CRM — maestro de relación
- contacto;
- prospecto/oportunidad;
- canal;
- historial de conversación;
- WhatsApp;
- seguimiento;
- próxima acción;
- responsable comercial/relacional;
- fuente de recomendación.

Sincronizar identificadores; no usar "last write wins" entre sistemas.

## MVP de UCAPSA Staff — hipótesis

### Hoy
- perros presentes;
- entradas/salidas;
- cuidados pendientes;
- tareas vencidas;
- evaluaciones que tocan;
- actualización al cliente pendiente.

### Perros
- ficha activa;
- estancia/servicio;
- perrera;
- responsable;
- cuidado;
- observaciones;
- evidencias.

### Internado
- nivel;
- semana actual;
- objetivos;
- evaluación semana 3;
- resultado;
- pendiente para semana 4;
- garantía/retrabajo.

### Tareas / handoff
- qué falta;
- responsable;
- turno;
- fecha/hora;
- quién completó;
- estado.

### CRM
No duplicar el CRM dentro de Staff.
Mostrar sólo contexto y deep-links/acciones necesarias cuando corresponda.

## Regla de adopción

No asumir que una app resolverá la falta de adherencia.

La evidencia del sticker de perreras sugiere que UCAPSA responde bien a señales visibles en el punto de trabajo.

La app debe diseñarse junto con:
- trabajo estandarizado;
- señalización/gestión visual;
- checklists mínimos;
- responsables;
- revisión diaria;
- auditoría simple;
- máximo de fricción muy bajo.

Una hipótesis a probar: QR visible por perrera/perro que abra directamente la tarea/ficha correspondiente.

## Investigación / formación

Revisar:
- Lean Enterprise Institute: Standardized Work y Leader Standard Work;
- ASQ: Quality Control / Quality Management;
- Operations Management;
- Pipedrive Academy, si Pipedrive se selecciona;
- HubSpot Academy Service/CRM como referencia de customer service y CRM, aunque no se adopte HubSpot.

## No hacer todavía

- no construir la Staff App antes de mapear 5–10 flujos críticos;
- no usar CRM para alimentación, baños o evaluaciones;
- no duplicar la base de perros en CRM y Supabase como maestras;
- no asumir que "notificación" resuelve un proceso sin dueño;
- no ampliar UCAPSA Cliente con herramientas internas sólo porque ya existe esa app.

## Pregunta pendiente de INT-001

Después de esta pausa de arquitectura, retomar con:

> Pensando desde que entra un cliente o un perro a UCAPSA hasta que termina y le damos seguimiento: ¿en qué partes dependemos demasiado de que alguien se acuerde, pregunte o haga algo manualmente?

Objetivo: descubrir dolores adicionales sin dirigirlo hacia los ya encontrados.
