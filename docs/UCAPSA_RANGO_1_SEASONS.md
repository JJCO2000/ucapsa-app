# UCAPSA Rango 1 — Temporadas operativas

Este documento aterriza el punto de temporadas del plan canónico sin definir todavía puntos, escalas, ranking ni podio.

## Estados

- `draft`: configuración administrativa; no visible para socios.
- `active`: temporada competitiva actual. Sólo puede existir una.
- `closed`: temporada finalizada e histórica.
- `reopened`: temporada histórica abierta por Superadmin para correcciones. No se convierte en la temporada actual.

Flujos válidos:

```text
draft -> active -> closed
closed -> reopened -> closed
```

## Permisos

- Crear temporada: Superadmin.
- Editar configuración y fechas: Superadmin; una temporada `closed` debe reabrirse primero.
- Activar temporada: Superadmin.
- Cerrar temporada: Admin o Superadmin.
- Reabrir temporada histórica: Superadmin.

Las operaciones se ejecutan mediante RPCs administrativas y registran automáticamente su acción en `admin_audit_logs`.

## Fechas

Admin captura fecha inicial y fecha final inclusivas. La base conserva el modelo técnico `[starts_at, ends_at)` y convierte la fecha final a medianoche del día siguiente en horario `America/Mexico_City`.

Los periodos no pueden solaparse. Las vistas de constancia siguen derivándose de las fechas canónicas de cada hecho.

## Visibilidad

Los socios autenticados pueden leer temporadas `active`, `closed` y `reopened`. Una temporada `draft` sólo puede ser leída por Admin/Superadmin.

`reopened` existe para permitir correcciones históricas sin violar la regla de una sola temporada `active`.

## SSOT

`ucapsa_competition_seasons` es la fuente canónica del ciclo de vida de temporada. No existe una segunda tabla editable de estado de temporada.

Las pantallas futuras sólo deberán consumir y accionar este contrato:

```text
Temporadas
-> temporada concreta
-> configuración / activar / cerrar / reabrir
```

No se mezclan en esta pantalla fórmulas de puntos, resultados de exámenes, ranking o podio.
