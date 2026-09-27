# Arquitectura de integración — CRM + Supabase + UCAPSA App

**Estado:** decisión provisional de arquitectura  
**Fecha:** 27 de septiembre de 2026  
**Motivo:** reducir dependencia de memoria/personas como fuente operativa y conectar el sistema existente de UCAPSA sin duplicar datos innecesariamente.

## Principio central

**UCAPSA App no se conectará directamente al CRM.**

Arquitectura objetivo:

```
UCAPSA App
    │
    ▼
Supabase
  ├─ Auth
  ├─ Base de datos UCAPSA
  ├─ RLS / permisos
  ├─ Edge Functions / integración
  ├─ Webhooks entrantes
  └─ Cola / reintentos / auditoría
    │
    ▼
CRM de UCAPSA
```

Supabase funciona como capa segura entre la app y el CRM.

## Por qué no conectar la app directamente al CRM

No queremos:

- exponer API keys o secretos del CRM en el teléfono;
- depender de que el CRM responda cada vez que se abre una pantalla;
- duplicar lógica de permisos entre móvil y CRM;
- crear conflictos de sincronización sin control;
- romper la app cuando el CRM tenga una caída;
- mezclar datos internos de todos los clientes con permisos de cliente final.

La app habla con Supabase.  
Supabase decide qué leer/escribir en el CRM.

## Single Source of Truth por dominio

No todos los datos deben tener el mismo sistema maestro.

La regla será:

> **Cada tipo de dato tiene un único sistema maestro. Los demás sistemas pueden mantener una copia sincronizada, pero no competir por la autoridad.**

### Matriz provisional

| Dominio | Sistema maestro provisional | Copia/consumo |
|---|---|---|
| Identidad del cliente | CRM, si hoy ya es la fuente oficial | Supabase/App |
| Correo/teléfono | CRM, si Secretaría los mantiene ahí | Supabase/App |
| Prospectos/ventas | CRM | opcional en Admin |
| Deuda/cobranza | CRM o sistema administrativo actual; confirmar | Supabase/Admin |
| Reservas de hotel | CRM, si ya están ahí | Supabase/Admin/App según rol |
| Entrada/salida de hotel | CRM | Supabase/Admin |
| Perro — identidad básica | Supabase/UCAPSA, salvo que el CRM ya sea maestro | CRM puede recibir espejo |
| Puppy/Comandos | Supabase/UCAPSA | CRM puede recibir resumen |
| Nivel | Supabase/UCAPSA | CRM puede recibir resumen |
| Inscripciones | Supabase/UCAPSA | CRM puede recibir resumen |
| Asistencias | Supabase/UCAPSA | CRM puede recibir resumen |
| Práctica | Supabase/UCAPSA | no necesario en CRM salvo uso comercial |
| Competencia | Supabase/UCAPSA | no necesario en CRM salvo resumen |
| Logros | Supabase/UCAPSA | no necesario en CRM salvo resumen |
| Membresía | Supabase/UCAPSA, confirmar si CRM ya la administra | CRM/App |
| Pagos | pendiente de definir con proceso real | sincronización según fuente oficial |

Esta matriz es provisional hasta identificar el CRM y mapear el proceso real de Alejandra.

## Flujo App → CRM

Ejemplo: un Admin cambia un dato que pertenece a UCAPSA y debe reflejarse en CRM.

```
App
  ↓
Supabase
  ↓
Transacción local confirmada
  ↓
Evento de sincronización
  ↓
Edge Function / Worker
  ↓
API del CRM
  ↓
Resultado guardado en sync_log
```

La app no espera a que el CRM termine para considerar guardado un cambio local de UCAPSA, salvo que ese dato sea propiedad exclusiva del CRM.

### Requisitos

- idempotencia;
- reintentos;
- registro de error;
- timestamps;
- identificador externo;
- no duplicar contactos;
- no sobrescribir campos maestros del CRM desde UCAPSA si no corresponde.

## Flujo CRM → App

Si Alejandra actualiza el CRM:

```
CRM
  ↓ webhook
Supabase Edge Function
  ↓ valida firma/autenticidad
Mapeo de IDs
  ↓
Actualiza espejo autorizado en Supabase
  ↓
UCAPSA App recibe/consulta el dato actualizado
```

Ejemplos potenciales:

- saldo pendiente;
- fecha de entrada/salida de hotel;
- nueva reserva;
- cambio de teléfono;
- cambio de correo;
- estado comercial.

Si el CRM no tiene webhooks, usar sincronización periódica desde Supabase con la API.

## Nunca usar "último cambio gana" global

Ejemplo peligroso:

- CRM teléfono = A
- App teléfono = B

Si ambos pueden mandar, se genera conflicto.

Solución:

1. definir sistema maestro por campo;
2. rechazar o redirigir cambios que no correspondan;
3. guardar `source_system`;
4. guardar `external_id`;
5. guardar `synced_at`;
6. registrar conflictos explícitamente.

## Identidad y mapeo

Se necesitará una tabla de integración, por ejemplo:

```
integration_entity_links
- id
- system
- entity_type
- local_id
- external_id
- created_at
- updated_at
```

Ejemplos:

- user_id Supabase ↔ contact_id CRM
- dog_id Supabase ↔ pet_id CRM
- reservation_id Supabase ↔ booking_id CRM

Nunca mapear sólo por nombre.

Correo/teléfono pueden ayudar a encontrar candidatos, pero después debe persistirse el ID externo real.

## Sincronización robusta

Se recomienda patrón Outbox:

```
integration_outbox
- id
- event_type
- entity_id
- payload
- status
- attempts
- next_retry_at
- last_error
- created_at
- processed_at
```

Ventajas:

- no perder cambios si el CRM está caído;
- poder reintentar;
- auditar qué se sincronizó;
- evitar duplicados;
- revisar errores sin afectar al usuario.

## Lectura en la app

La app no debería consultar el CRM en vivo cada vez que abre una pantalla.

Preferible:

1. CRM sincroniza a Supabase.
2. Supabase conserva un espejo permitido.
3. La app lee Supabase.

Beneficios:

- menor latencia;
- funciona mejor con cache/offline;
- RLS centralizado;
- menos dependencia del uptime del CRM;
- una interfaz consistente.

## Seguridad

Obligatorio:

- API secrets sólo en Supabase/servidor;
- nunca en Expo/cliente;
- webhook con firma o secreto verificable;
- RLS en datos espejados;
- cada rol ve sólo lo necesario;
- logs de integración sin datos sensibles innecesarios;
- permisos mínimos de API;
- rotación de credenciales;
- no guardar CVV ni credenciales bancarias.

## Alejandra cambia de rol en el sistema

Objetivo:

**Alejandra deja de ser "la base de datos humana".**

Pasa a ser:

- una de las personas que registra/valida datos;
- responsable de procesos que requieren criterio humano;
- no el único canal para consultar información básica.

El equipo consulta el sistema.

Alejandra interviene cuando:
- hay una excepción;
- falta información;
- hay que corregir un dato;
- existe una decisión administrativa.

## Ejemplo futuro

Admin abre un cliente:

> Rocky · Juan Pérez  
> Hotel: 3–7 oct  
> Saldo: $500  
> Comandos: Intermedio  
> Próxima clase: dom 11:30  
> Última asistencia: 20 sep  
> Membresía: activa  
> Seguimiento: ninguno

Posibles orígenes:

- Hotel → CRM
- Saldo → CRM
- Comandos/nivel → Supabase
- Próxima clase → Supabase
- Asistencia → Supabase
- Membresía → Supabase
- Seguimiento → Supabase

La pantalla puede combinar ambos sistemas sin que el usuario tenga que saber dónde vive cada dato.

## Fases de implementación

### Fase 0 — identificar CRM

Necesitamos:
- nombre exacto;
- plan contratado;
- API disponible;
- documentación;
- webhooks;
- límites;
- objetos;
- autenticación;
- sandbox/test environment si existe.

### Fase 1 — mapa de datos

Antes de programar:
- qué campos existen;
- quién los edita;
- cuál es la fuente oficial;
- quién necesita leerlos;
- quién puede modificarlos.

### Fase 2 — integración de lectura

Empezar con bajo riesgo:
- importar/consultar datos del CRM en Supabase;
- no escribir al CRM todavía.

Candidatos:
- contacto;
- saldo;
- hotel/reservas.

### Fase 3 — escritura controlada

Sólo datos claramente propiedad de UCAPSA App o acciones definidas.

### Fase 4 — webhooks

CRM → Supabase casi en tiempo real.

### Fase 5 — monitoreo y recuperación

- dashboard de sync;
- reintentos;
- conflictos;
- alertas;
- auditoría.

## Decisión actual

**Sí: CRM + Supabase + UCAPSA App es la arquitectura preferida si el CRM existente tiene API o un mecanismo de integración razonable.**

No se construirá un CRM paralelo dentro de UCAPSA hasta identificar el sistema actual y evaluar qué debe integrarse versus qué debe permanecer nativo.
