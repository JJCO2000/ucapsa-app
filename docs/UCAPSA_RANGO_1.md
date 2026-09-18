# Plan UCAPSA Rango 1 — arquitectura canónica

Estado: **Rango 1 funcionalmente cerrado**. Fuente canónica, temporadas, Constancia, Exámenes, importación, ajustes, premios, puntaje competitivo, Rangos, Ranking, Podio y superficies Admin/Cliente están implementados y protegidos por guards.

Este documento reemplaza como fuente de producto a las decisiones anteriores de `UCAPSA_POINTS.md` y `UCAPSA_POINTS_UX_AUDIT.md` cuando exista contradicción.

## Tres reglas obligatorias

1. **General → particular.** Resumen → contexto/listado → ficha concreta → detalle/acción.
2. **Una pantalla = un trabajo principal útil.** No saturar: cada pantalla responde una necesidad clara; si un producto necesita profundidad, baja a tabs/subpantallas en lugar de concentrarlo todo en Inicio, Mi perro o el Home de Admin.
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

## Propósito estratégico del Rango de Constancia

UCAPSA usa esta capa para apoyar una estrategia de **sostener y mantener** haciendo visible el valor ya entregado. El Rango no existe para gamificar por gamificar: convierte hechos de participación en una lectura simple de aprovechamiento y continuidad.

La cadena de información debe conservar esta jerarquía:

```text
TIENES → APROVECHASTE → CONSEGUISTE → SIGUE
```

- **Tienes:** membresía, programa y servicios disponibles.
- **Aprovechaste:** asistencias, visitas y frecuencia real. Aquí vive Constancia.
- **Conseguiste:** exámenes, progresión y reconocimientos realmente registrados.
- **Sigue:** próxima actividad o acción útil.

Una asistencia demuestra participación/aprovechamiento; por sí sola no demuestra aprendizaje ni mejora. Esos resultados requieren sus propios hechos canónicos.

## Multi-perro

La cuenta y la membresía pueden ser compartidas; la identidad competitiva siempre es **`dog_id + season_id`**.

Un mismo usuario puede tener, por ejemplo:

- Tuka → Oro · #1
- Luna → Plata · #12

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

Cada evento canónico de Constancia vale **1 punto** en el score competitivo:
- una asistencia válida a Comandos = 1 punto;
- una visita de socio acreditada al perro = 1 punto.

El **Rango** sigue siendo un sistema separado del Ranking: se deriva únicamente de la Constancia relativa del perro dentro de su temporada. Participan **todos los perros** de la temporada, incluso los de 0 actividad, para conservar el contexto completo del grupo.

Presentación pública simplificada:
- con **menos de 10 perros** en la temporada → **Constancia en formación**; se muestran actividades reales, pero no se asigna todavía un nivel comparativo;
- desde **10 perros**: top 10% → **Oro** · constancia destacada;
- >10% a 40% → **Plata** · constancia sostenida;
- >40% a 100% → **Cobre** · constancia en desarrollo.

Dentro de Oro, el **top 5%** recibe la distinción derivada **Constancia sobresaliente** únicamente cuando la temporada tiene **20 o más perros**. No es un cuarto nivel ni un premio permanente.

Los empates de Constancia comparten percentil/nivel; no se separan con un criterio secundario. Como regla de cordura, un perro con **0 eventos** siempre queda en Cobre aunque forme parte del denominador percentil.

La interfaz Cliente no debe exponer mecánicas tipo XP, subniveles I/II/III ni castigos arbitrarios por inactividad. Debe demostrar hechos útiles: nivel de Constancia, actividades registradas, Comandos, visitas y última actividad. El percentil exacto pertenece al detalle, no al resumen.

La inactividad se comunica inicialmente como **última actividad registrada**, sin degradación por un número arbitrario de días. Un umbral de 30/60/90/100 días sólo podrá convertirse en regla de producto cuando exista evidencia operativa de la cadencia real de UCAPSA y su relación con abandono/renovación.

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

La fórmula canónica es:

```text
1 punto por evento de Constancia
+ puntos oficiales de Exámenes
+ Ajustes Admin
= score competitivo efectivo
```

Sólo perros elegibles entran a la clasificación oficial. Un perro no elegible conserva toda su constancia, exámenes parciales y ajustes; simplemente no ocupa posición hasta cumplir los exámenes obligatorios.

Orden determinista del Ranking:
1. score competitivo DESC;
2. asistencias válidas a Comandos DESC;
3. puntos oficiales de Exámenes DESC;
4. `dog_id ASC` únicamente como desempate técnico estable.

🥇🥈🥉 son las posiciones dinámicas 1, 2 y 3 del Ranking, no logros permanentes. Si cambia un hecho canónico, cambia el score y el podio se reordena automáticamente.

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

## Cierre de Rango 1

Rango 1 queda funcionalmente cerrado con estas superficies:

- Admin: Temporadas, Rangos / Constancia, Ranking + Podio, Exámenes manuales/Excel, Ajustes y Premios.
- Cliente: resumen dog-specific, Rango, Ranking + Podio, Constancia, Exámenes oficiales y temporadas anteriores mediante selector de temporada.
- Offline cliente: caché silenciosa y refresh remoto para Competencia; el aviso de datos guardados sólo aparece ante fallback real.
- SSOT: Rango, score, Ranking y Podio son derivados; ninguna pantalla mantiene copias editables.

La base actual puede devolver listas vacías mientras no exista una temporada no-borrador con población competitiva real; eso es un estado de datos, no una funcionalidad pendiente.

El sistema histórico `UCAPSA Points` queda retirado como superficie y como fuente de nuevos movimientos: las rutas antiguas redirigen a Competencia/Rango 1, y el trigger que sumaba puntos por asistencia se elimina sin borrar su ledger histórico.

## Fuera de alcance deliberadamente



- normalización porcentual de exámenes con máximos diferentes: Rango 1 usa los puntos oficiales capturados tal cual;
- bonificaciones, topes o rachas adicionales;
- automatizar `Perro del Año` desde el #1;
- convertir Podio en logro permanente;
- OTA/EAS Build/AAB/Google Play.

La UI de Ranking/Rango/Podio y el leaderboard seguro forman parte de la implementación actual de Rango 1.

La fundación SQL versionada para estas decisiones está en `supabase/sql/ucapsa-rango-1-foundation.sql`.