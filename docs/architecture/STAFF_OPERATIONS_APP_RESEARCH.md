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


---

## Revisión de la base actual — perro y cartilla

El código actual ya tiene una base útil en `dogs` / `DogProfile`:

- nombre;
- raza;
- fecha de nacimiento;
- sexo;
- peso;
- alergias;
- medicamentos;
- notas de alimentación;
- notas de comportamiento;
- veterinario y teléfono;
- contacto de emergencia;
- notas generales.

Sin embargo, la pantalla actual del cliente sólo permite editar:
- nombre;
- raza;
- fecha de nacimiento;
- sexo;
- peso.

**Vacunación/cartilla no está modelada actualmente como una entidad propia.**

Esto significa que no conviene crear un segundo perfil de perro exclusivo de Staff. Debe ampliarse el mismo registro canónico.

## Propuesta de dominio compartido — datos del perro

### Cliente puede aportar
- datos básicos;
- foto;
- contacto veterinario;
- contacto de emergencia;
- alergias/medicamentos declarados;
- cartilla/certificado de vacunación;
- fechas de vacunación declaradas;
- instrucciones de alimentación para una estancia.

### Staff verifica / opera
- estado de verificación de vacunas;
- vacuna requerida / vigente / por vencer / vencida;
- documento revisado;
- restricciones de ingreso;
- observaciones operativas;
- perrera;
- estancia;
- alimentación realizada;
- medicamento administrado;
- baño/limpieza;
- incidentes;
- evaluaciones de entrenamiento.

### Cliente ve
- estado útil, no ruido interno:
  - cartilla recibida / pendiente de revisión;
  - vacunas vigentes / por vencer / vencidas;
  - datos básicos;
  - información de seguridad relevante;
  - progreso/servicio que corresponda.

## Vacunación — modelo mínimo sugerido

No guardar únicamente una foto de la cartilla.

Separar:
- `dog_documents`: archivo privado, tipo, fecha, cargado por, revisado por;
- `dog_vaccinations`: perro, tipo de vacuna, fecha aplicada, fecha de vencimiento, estado de verificación, fuente/documento;
- `vaccination_requirements`: requisitos configurables de UCAPSA.

Flujo:
1. cliente sube cartilla/foto/PDF;
2. queda **pendiente de revisión**;
3. Staff verifica fechas;
4. sistema calcula vigencia;
5. Staff y cliente ven alertas según rol;
6. una estancia puede bloquearse o advertir si falta un requisito, según política UCAPSA.

Los archivos deben vivir en almacenamiento privado con acceso por rol, no en URLs públicas.

## Qué sí demuestra el benchmark vertical

Gingr, PetExec y KennelBooker tratan vacunación como parte operativa del perfil del animal, no como nota suelta.

Patrones útiles:
- carga de documentos por el dueño;
- verificación por personal;
- fechas de expiración;
- alertas;
- restricciones/avisos al reservar o hacer check-in;
- historial accesible desde la ficha del animal.

Por tanto, **cartilla/vacunación sí pertenece al núcleo compartido Cliente ↔ Staff**, si UCAPSA la requiere para sus servicios.

---

## Revisión Pipedrive móvil

Pipedrive tiene aplicación móvil con:
- contactos;
- deals/pipeline;
- actividades;
- calendario;
- notas;
- archivos/fotos;
- push;
- modo offline.

Esto lo vuelve viable como herramienta móvil separada para la capa CRM.

### WhatsApp

La integración oficial de WhatsApp:
- está disponible en Growth o superior;
- sigue en beta a septiembre de 2026;
- puede vincular chats con contactos/deals;
- permite responder, plantillas y seguimiento;
- admite coexistencia con WhatsApp Business móvil;
- la coexistencia puede importar historial reciente durante la configuración.

**No diseñar una dependencia crítica de UCAPSA sobre esta beta sin una prueba real de cuenta/plan/disponibilidad.**

### Decisión de alcance

No replicar Pipedrive dentro de UCAPSA Staff.

UCAPSA Staff debe mostrar, como máximo:
- cliente vinculado;
- responsable;
- estado de seguimiento;
- próxima acción;
- botón/deep link al CRM si hace falta.

Pipedrive debe seguir siendo el workspace de:
- prospectos;
- relación;
- conversaciones;
- seguimientos;
- actividades;
- reactivación;
- pipeline comercial.

## Integración recomendada

```
                     ┌─────────────────┐
                     │ UCAPSA Cliente  │
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │    Supabase     │
                     │ SSOT operativo  │
                     └───────┬─────────┘
                             ▲
                             │
                     ┌───────┴─────────┐
                     │  UCAPSA Staff   │
                     └─────────────────┘
                             │
                       sólo contexto /
                    integración server-side
                             │
                             ▼
                     ┌─────────────────┐
                     │    Pipedrive    │
                     │  SSOT relación  │
                     └─────────────────┘
```

### Eventos útiles Supabase → CRM
- cliente creado/vinculado;
- internado iniciado;
- perro entregado;
- seguimiento post-entrega requerido;
- garantía/retrabajo abierto;
- mantenimiento próximo;
- servicio terminado.

### Eventos útiles CRM → Supabase
Sólo los que afecten experiencia/operación:
- identificador CRM;
- responsable relacional;
- siguiente seguimiento;
- estado relacional relevante.

No sincronizar conversaciones completas al teléfono cliente.

---

## Staff App — mapa funcional actualizado

### 1. Hoy
Responder en menos de 10 segundos:
- ¿qué perros están aquí?;
- ¿qué falta hacer?;
- ¿qué está vencido?;
- ¿qué evaluación toca?;
- ¿qué perro sale hoy?;
- ¿qué actualización a cliente falta?

### 2. Ficha del perro
- identidad/foto;
- dueño;
- vacunas;
- alertas médicas;
- alimentación;
- medicamentos;
- contacto de emergencia;
- estancia actual;
- perrera;
- entrenador/responsable;
- nivel de entrenamiento.

### 3. Cuidado diario
Checklist de eventos, no un único booleano diario:
- comida;
- agua/revisión;
- medicamento;
- baño/limpieza;
- observación;
- incidencia.

Cada registro:
- hora;
- empleado;
- estado;
- nota opcional;
- evidencia opcional.

### 4. Internado
- nivel 1–4 o modelo real que defina UCAPSA;
- semana actual;
- objetivos del nivel;
- evaluación de semana 3;
- quién evaluó;
- resultado;
- pendientes de semana 4;
- apto/no apto para entrega;
- garantía/retrabajo.

### 5. Cambio de mando
- programado;
- responsable;
- puntos a enseñar al cliente;
- realizado;
- observaciones;
- recursos entregados;
- dudas del cliente.

### 6. Salida y seguimiento
- fecha de entrega;
- seguimiento a 3 días;
- problema reportado;
- video recibido;
- práctica presencial;
- garantía;
- estado resuelto.

La tarea relacional vive en CRM, pero Staff puede reflejar el estado cuando sea necesario para la operación.

### 7. Mantenimiento
No construir todavía una cadencia rígida.
Preparar el modelo para:
- fecha sugerida de revisión;
- último contacto;
- práctica/mantenimiento recomendado;
- resultado.

La cadencia debe definirse por servicio y evidencia, no por un valor fijo inventado.
