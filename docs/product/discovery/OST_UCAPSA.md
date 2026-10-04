# Opportunity Solution Tree — UCAPSA App

**Estado:** discovery activo  
**Regla:** no añadir soluciones como si fueran oportunidades.

## Outcome de producto

> **Que el cliente pueda saber por sí mismo qué le toca a su perro, cómo va y qué sigue, sin depender de preguntar a UCAPSA.**

### Conexión con resultados de negocio

Este outcome puede contribuir a reducir consultas repetitivas, aumentar uso útil y mejorar continuidad. Esas relaciones siguen siendo hipótesis mientras no exista evidencia causal.

---

## Árbol actual

```
OUTCOME CLIENTE
qué me toca → cómo voy → qué sigue
sin depender de preguntar a UCAPSA
│
├── CLIENT-OPP-001 CONFIRMADA
│   Entender programa, clases y estado actual sin ambigüedad
│   Evidencia: INT-007 + INT-009
│   Contraste/valor positivo: INT-010 + INT-011
│
├── CLIENT-CAND-002 OBSERVACIÓN
│   Enterarme de cambios/cancelaciones por un canal oficial
│   Evidencia: INT-011
│   Solución existente a validar: anuncios + push + cancelaciones
│
├── CLIENT-CAND-003 EVIDENCIA PARCIAL
│   Consultar estado administrativo/pagos con autonomía
│   Evidencia principal: INT-010
│   INT-011 sugiere pago en línea, pero eso sigue siendo solución propuesta
│
├── CLIENT-CAND-004 EVIDENCIA INCOMPLETA
│   Saber cómo va el perro durante un servicio prolongado
│   Evidencia operacional mayor que evidencia cliente
│
└── HYP-CLIENT-01 HIPÓTESIS
    Mantenimiento/continuidad postentrenamiento
    No construir hasta validar comportamiento real posterior a entrega
```

## CLIENT-OPP-001 — Entender programa, clases y estado actual

**Estado:** confirmada.

### Qué cuenta como evidencia

- INT-007: confusión entre “actividad” y clases restantes.
- INT-009: confusión repetida entre clases, actividad, prácticas y progreso.
- INT-010: cuando clases tomadas/restantes se presentan con claridad, son útiles.
- INT-011: la participante valora que la app sustituya la tarjeta física perdida y permita saber cuántas clases quedan/cómo va.

### Decisión de solución ya autorizada

Corregir la semántica de la experiencia existente:
- programa/nivel;
- clases tomadas/restantes para tarjeta finita;
- acceso ilimitado para socio;
- siguiente clase/acción;
- historial de clases/visitas/prácticas por separado.

**No** convertir asistencia en porcentaje de aprendizaje o dominio.

## CLIENT-CAND-002 — Cambios y cancelaciones por canal oficial

**Estado:** observación.

INT-011 describe dificultad para enterarse de cambios de horario/cancelaciones y quiere evitar depender del grupo de WhatsApp.

La app ya tiene anuncios, cancelaciones y notificaciones. Por tanto, el siguiente paso no es crear otro módulo sino comprobar que la solución existente:
- aparece en Inicio;
- envía push en una versión instalada;
- cubre tanto tarjeta finita como membresía.

## CLIENT-CAND-003 — Pagos/autonomía administrativa

**Estado:** evidencia parcial.

No confundir:
- problema/estado administrativo;
- propuesta de pago en línea.

INT-011 menciona pago en línea como sugerencia. No se aprueba esa solución hasta reconstruir una historia real de pago y confirmar la fuente de verdad.

## CLIENT-CAND-004 — Visibilidad durante servicio prolongado

**Estado:** no cerrada.

Hay evidencia operacional sobre videos/actualizaciones. Aún debe distinguirse entre:
- incumplimiento de un contacto prometido;
- necesidad de información adicional incluso cuando el contacto se cumple.

## HYP-CLIENT-01 — Mantenimiento

**Estado:** hipótesis estratégica.

La continuidad Puppy → Comandos observada en INT-011 demuestra que existe recorrido entre programas, pero no prueba una necesidad de mantenimiento postentrenamiento.

---

## Outcome de operación separado

> **Que el equipo UCAPSA pueda saber qué necesita atención, quién es responsable y qué ya se hizo sin depender de memoria o comunicación informal.**

Las observaciones CAND-001/CAND-002/CAND-003 de INT-002 pertenecen a esta rama operacional, no al OST Cliente.

Una futura UCAPSA Staff, CRM o integración son **soluciones candidatas** y no conclusiones automáticas.

## Regla de evidencia

Una observación individual puede generar una hipótesis/candidata. Una oportunidad se confirma cuando:
- el patrón aparece en 2 o más historias independientes; o
- aparece una vez, bloquea una tarea crítica y puede reproducirse; o
- existe evidencia cuantitativa consistente.

## Estado consolidado

Ver `DISCOVERY_STATE_2026-10-04.md` para la síntesis actual y `INTERVIEW_011_SOCIA_PUPPY_COMANDOS.md` para la evidencia nueva.
