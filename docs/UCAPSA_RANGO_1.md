# Plan UCAPSA Rango 1 — arquitectura canónica

Estado: **fundación estructural**. Esta fase no define valores de puntos, umbrales de rango, desempates, UI final ni publica cambios en Supabase remoto.

Este documento reemplaza como fuente de producto a las decisiones anteriores de `UCAPSA_POINTS.md` y `UCAPSA_POINTS_UX_AUDIT.md` cuando exista contradicción.

## Tres reglas obligatorias

1. **General → particular.** Resumen → contexto/listado → ficha concreta → detalle/acción.
2. **No saturar.** Si un producto necesita profundidad, se divide en tabs/subpantallas; no se concentra todo en Inicio, Mi perro o el Home de Admin.
3. **Una sola fuente verdadera por producto.** Totales, rango, ranking y podio se derivan de hechos canónicos. No se mantienen copias editables que puedan divergir.

## Productos y fuente verdadera

| Producto | Fuente canónica | Derivado |
| --- | --- | --- |
| Entrenamiento | `user_achievements` dog-specific | Puppy → Básico → Intermedio → Avanzado |
| Membresía | `memberships` | condición de socio |
| Comandos | `program_attendances` + `program_enrollments.dog_id` | constancia por perro |
| Visitas de socio | `member_visits` + `member_visit_dogs` | constancia por perro |
| Exámenes | examen → ejercicios → intento → resultado por ejercicio | total del examen |
| Ajustes Admin | movimientos firmados por perro/temporada | ajuste al score efectivo |
| Rango | constancia del perro en temporada | rango actual |
| Ranking | constancia + exámenes + ajustes Admin, sólo elegibles | posición |
| Podio | ranking actual | 🥇 #1, 🥈 #2, 🥉 #3 |
| Premios | premios otorgados explícitamente al perro | historial permanente |
| Temporadas | temporada activa/cerrada | contexto competitivo |

No existe una tabla canónica de `total_points`, `rank_position` o `podium_medal`.

## Multi-perro

La cuenta y la membresía pueden ser compartidas; la identidad competitiva siempre es **`dog_id + season_id`**.

Un mismo usuario puede tener, por ejemplo:

- Tuka → Diamante · #1
- Luna → Esmeralda · #12

Nunca se copia rango, examen o posición entre perros del mismo dueño.

## Visita de socio multi-perro

`member_visits` conserva el hecho real: un escaneo/visita de la membresía.

`member_visit_dogs` congela qué perros recibieron crédito en esa visita. Un escaneo puede acreditar a varios perros sin duplicar el evento.

Ejemplo:

```text
member_visit #542
└── member_visit_dogs
    ├── Tuka
    └── Luna
```

Si la composición de perros cambia en el futuro, el histórico no se reescribe.

## Constancia y Rango

La constancia dog-specific de una temporada consume dos fuentes independientes:

- asistencias válidas a Comandos;
- visitas de socio acreditadas al perro.

Todavía no se decide cuánto pesa cada fuente ni los umbrales de Bronce/Plata/Oro/Esmeralda/Platino/Diamante.

Una clase cancelada es neutral. Una misma sesión sólo puede contar una vez por perro. Cambiar de Básico a Intermedio o Avanzado dentro de la temporada no reinicia la constancia del perro.

## Exámenes

Una temporada puede tener **N exámenes**. Cada examen define sus propios ejercicios/preguntas y el máximo de cada ejercicio.

Jerarquía canónica:

```text
Temporada
└── Examen
    └── Ejercicios
        └── Intento del perro
            └── Resultado por ejercicio
```

El total nunca se captura manualmente: se suma desde los resultados por ejercicio.

### Intentos

Un perro puede tener varios intentos históricos. Sólo un intento puede ser **oficial** por `perro + examen`.

Estados de trabajo:

- `draft`
- `reviewed`
- `published`
- `voided`

Un resultado oficial debe estar publicado. `0 puntos presentado` sí cuenta como examen presentado; ausencia de resultado oficial no.

### Elegibilidad

Un perro entra al Ranking cuando tiene un intento oficial publicado para **todos los exámenes marcados como obligatorios para ranking** de la temporada.

La elegibilidad se deriva; no se guarda un booleano editable paralelo.

## Importación Excel

El Excel no puede reducir un examen a `Tuka = 88`.

Ejemplo válido:

| Identificador | Perro | Sentado | Quieto | Llamado |
| --- | --- | ---: | ---: | ---: |
| UC001 | Tuka | 10 | 16 | 18 |

Los máximos pertenecen a la definición del examen, no al archivo.

Flujo obligatorio:

`archivo → validación → preview → confirmar/importar → revisar → publicar`

Captura manual e importación terminan en las mismas tablas canónicas. Cada importación confirmada conserva un `import_batch_id` para trazabilidad/reversión administrativa.

## Temporadas

Las temporadas son configurables, no están hardcodeadas al año calendario.

Estados:

`draft → active → closed`

Reglas:

- una sola temporada activa;
- periodos no superpuestos;
- Rango, Ranking, Exámenes, Ajustes y Podio pertenecen a temporada;
- membresía, logros de entrenamiento y premios ya otorgados no se reinician;
- las asistencias/visitas reales nunca se borran al cerrar una temporada;
- Superadmin puede reabrir una temporada para corregir hechos y volver a cerrarla.

## Ranking y podio

El score competitivo se deriva conceptualmente de:

```text
Constancia
+ Exámenes oficiales
+ Ajustes Admin
= score competitivo efectivo
```

La escala numérica se define después.

Sólo perros elegibles entran a la clasificación oficial. Un perro no elegible conserva toda su constancia, exámenes parciales y ajustes; simplemente no ocupa posición hasta cumplir los exámenes obligatorios.

🥇🥈🥉 son posiciones dinámicas, no logros permanentes. Si cambia un hecho canónico, cambia el score y el podio se reordena automáticamente.

El criterio exacto de desempate queda pendiente junto con la escala, pero Rango 1 exige posiciones deterministas: no puede haber dos #1 efectivos.

## Ajustes Admin

Admin/Superadmin puede sumar o restar puntos a un perro dentro de una temporada sin motivo obligatorio.

Ejemplo:

`Tuka +100`

No se sobrescribe un total. Se crea un movimiento administrativo firmado con:

- perro;
- temporada;
- cantidad positiva o negativa;
- administrador;
- fecha;
- nota opcional.

La auditoría es automática y no debe estorbar la operación. Una corrección/reverso genera otro movimiento; no se altera silenciosamente el histórico.

## Premios permanentes

Se separan dos familias:

- logros de entrenamiento: Puppy/Básico/Intermedio/Avanzado;
- premios especiales: por ejemplo `Perro del Año`.

`Perro del Año` se otorga explícitamente por Admin; el #1 del ranking no se convierte automáticamente en ganador.

El podio final de una temporada es historial competitivo derivado; un premio es un reconocimiento permanente otorgado.

## Admin Competencia

La navegación base debe permanecer separada por producto:

```text
Admin
└── Competencia UCAPSA
    ├── Ranking
    ├── Rangos / Constancia
    ├── Exámenes
    │   └── Examen
    │       ├── Resumen
    │       ├── Ejercicios
    │       ├── Resultados
    │       └── Importar
    ├── Puntos y ajustes
    ├── Premios
    └── Temporadas
```

El Home de Admin no debe mostrar todas las acciones. Debe ofrecer una entrada `Competencia UCAPSA` y bajar de general a particular.

Los logros Puppy/Básico/Intermedio/Avanzado permanecen en la ficha del perro, no dentro de Competencia.

## Cliente

`Mi perro` sólo resume competencia. El detalle vive en rutas/subpantallas dedicadas.

Dirección conceptual:

```text
Mi perro
└── Competencia UCAPSA
    ├── Rango
    ├── Ranking
    ├── Exámenes
    │   └── Resultado de examen
    │       └── ejercicio por ejercicio
    └── Temporadas anteriores
```

No se mostrará en `Mi perro` el ranking completo, todos los ejercicios, todas las asistencias ni todos los movimientos.

## Contratos de SSOT

Una corrección siempre ocurre en el hecho origen:

```text
resultado de ejercicio
→ total de examen
→ score
→ ranking
→ podio
```

```text
member_visit
→ member_visit_dogs
→ constancia del perro
→ rango / score
→ ranking
```

```text
program_attendance
→ constancia del perro
→ rango / score
→ ranking
```

Ninguna pantalla recalcula una fórmula alternativa.

## Fuera de alcance de esta fundación

Todavía no se define:

- valor de una asistencia a Comandos;
- valor de una visita de socio;
- ponderación de exámenes;
- normalización de exámenes con máximos diferentes;
- umbrales de cada rango;
- criterio definitivo de desempate;
- bonificaciones, topes o rachas;
- UI visual final;
- RPC final de leaderboard;
- aplicación remota de SQL;
- OTA/EAS Build/AAB/Google Play.

La fundación SQL versionada para estas decisiones está en `supabase/sql/ucapsa-rango-1-foundation.sql`.