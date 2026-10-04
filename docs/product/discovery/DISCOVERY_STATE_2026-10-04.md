# Estado consolidado de discovery — 4 de octubre de 2026

Este documento sincroniza el repositorio con el estado alcanzado en entrevistas y revisión de producto. No sustituye los transcripts/snapshots disponibles; separa evidencia de cliente, evidencia operativa e hipótesis.

## Outcome Cliente

> **Que el cliente pueda saber por sí mismo qué le toca a su perro, cómo va y qué sigue, sin depender de preguntar a UCAPSA.**

## CLIENT-OPP-001 — Entender programa, clases y estado actual

**Estado:** oportunidad confirmada.

### Evidencia

- INT-007: interpretó un contador de “actividad” como clases restantes.
- INT-009: volvió a mezclar clases, actividad, prácticas y progreso.
- INT-010: contraste positivo; clases tomadas/restantes fueron comprensibles y útiles.
- INT-011: contraste positivo adicional; valoró sustituir la tarjeta física y saber cuántas clases quedan/cómo va.

### Decisión

Corregir semántica/jerarquía antes de añadir información:
- programa/nivel;
- clases tomadas/restantes cuando son finitas;
- acceso ilimitado cuando es socio;
- siguiente clase/acción;
- historial separado de progreso técnico.

Asistencia **no** equivale automáticamente a aprendizaje.

## CLIENT-CAND-002 — Enterarme de cambios excepcionales por un canal oficial

**Estado:** observación.

### Evidencia

INT-011 describe dificultad para enterarse de cambios/cancelaciones y dependencia del grupo de WhatsApp. Quiere aviso visible en Inicio y alerta en el celular.

### Solución ya existente que debe validarse

UCAPSA App ya implementa:
- anuncios;
- anuncio automático al cancelar clase;
- preferencias de push;
- recordatorios/cancelaciones de clase.

Antes de crear otra función, probar la solución actual en versión instalada y en ambos modelos de acceso: tarjeta finita y socio.

## CLIENT-CAND-003 — Estado administrativo/pagos

**Estado:** evidencia parcial.

INT-010 expresó interés en consultar pagos/fechas/adeudos. INT-011 sugiere pago en línea, pero no reconstruyó un episodio concreto suficiente para aprobar esa solución.

Decisión: auditar fuente de verdad y proceso antes de ampliar pagos.

## CLIENT-CAND-004 — Visibilidad durante servicio prolongado

**Estado:** evidencia cliente todavía insuficiente; evidencia operacional mayor.

Existe un proceso de videos/actualizaciones durante entrenamiento. No convertir automáticamente eso en galería o módulo de progreso hasta distinguir:
- incumplimiento del proceso actual;
- información insuficiente aun cuando se cumple.

## HYP-CLIENT-01 — Mantenimiento y continuidad postentrenamiento

**Estado:** hipótesis estratégica, no oportunidad cliente confirmada.

El recorrido incluye entrenamiento → cambio de mando → entrega → seguimiento. Debe investigarse qué ocurre semanas/meses después antes de crear recordatorios, prácticas, rachas o mantenimiento digital.

INT-011 demuestra continuidad Puppy → Comandos, pero **no** valida mantenimiento postentrenamiento.

## Outcome Operacional separado

> Que el equipo UCAPSA pueda saber qué necesita atención, quién es responsable y qué ya se hizo sin depender de memoria o comunicación informal.

Problemas operativos de tratamientos, incidencias, información interna, handoffs y cumplimiento recurrente permanecen separados del OST Cliente.

Una futura UCAPSA Staff es una **solución candidata**, no una conclusión del discovery.

## Regla de decisión

1. Problema respaldado por evidencia.
2. Separar problema de solución sugerida.
3. Revisar si una solución ya existe antes de crear otra.
4. Probar el supuesto crítico.
5. Sólo entonces diseño, datos, permisos y privacidad.
