# UCAPSA Puntos — fundamento de producto y datos

Estado: **estructura solamente**. No activa puntos, no publica UI y no aplica cambios remotos en Supabase.

## Producto existente

UCAPSA ya publica `Perro del Año`, una clasificación anual, puntos acumulables, insignias por eventos y parches por logros. La app debe convertir esa idea en un sistema único, auditable y ampliable; no crear una gamificación paralela.

Referencias públicas:
- https://www.ucapsa.mx/
- https://www.ucapsa.mx/ucapsa/dogclub

## MVP

El primer MVP es **solo para Socios / Dog Club**.

Esto define elegibilidad, no limita la arquitectura a una sola fuente. Las reglas pueden estar desactivadas hasta que UCAPSA decida activarlas.

Fuentes preparadas:
- visita de socio;
- asistencia válida a clase;
- evaluación/valoración confirmada;
- evento especial;
- ajuste administrativo;
- importación inicial del ranking existente.

## Entidad que compite

`Perro del Año` debe representar un perro, no un UUID de usuario.

Sin embargo, varias acciones —por ejemplo una visita libre de socio— existen hoy a nivel de cuenta. Para no inventar qué perro recibió esa acción:

- cada socio puede tener **un participante por temporada**;
- el participante se asocia a un perro representante;
- si el socio tiene un solo perro, no se le obliga a elegir;
- si tiene varios, elige uno antes de entrar en la competencia;
- después del primer movimiento de puntos, el perro de esa temporada queda bloqueado salvo corrección administrativa auditada.

Así, una visita de socio suma al participante de esa temporada sin repartir puntos arbitrariamente entre perros.

## Temporadas

La clasificación es por temporada, normalmente anual.

Ejemplo:
- código `2026`;
- nombre `Perro del Año 2026`;
- inicio y fin;
- estado `draft`, `active` o `closed`;
- elegibilidad inicial `members`.

Cerrar una temporada conserva su clasificación histórica. La nueva temporada comienza desde cero sin borrar la anterior.

## Ledger como fuente de verdad

Nunca guardar únicamente `total_points = 120` como verdad principal.

Cada cambio de puntos es una entrada inmutable:
- participante;
- temporada;
- regla;
- tipo de fuente;
- entidad origen;
- puntos positivos o negativos;
- razón;
- fecha del hecho;
- quién otorgó o corrigió;
- clave idempotente de deduplicación.

El total se calcula sumando el ledger. Una corrección genera un reverso/ajuste, no reescribe el pasado.

## Reglas configurables

Los valores de puntos son datos por temporada, no constantes de React Native.

Una regla define:
- código;
- etiqueta;
- tipo de fuente;
- puntos por defecto;
- activa/inactiva;
- límite opcional de premios por día;
- metadata para futuras restricciones.

Esto permite cambiar una economía de puntos sin publicar otra versión de la app.

## Rangos de temporada

Bronce, Plata y Oro son rangos derivados del total de puntos. Sus umbrales también viven en datos por temporada.

No se fijan todavía valores como 100/200/300 porque la web pública actual muestra una escala distinta y también existe material del Dog Club con otros ejemplos de puntaje. Primero se debe definir la economía real.

La app calcula:
- rango actual;
- siguiente rango;
- puntos que faltan.

No se guarda una segunda copia editable de la medalla.

## Diferencia entre puntos, rangos, logros e insignias

- **Puntos**: cantidad acumulable durante la temporada.
- **Rango**: Bronce / Plata / Oro, derivado del total.
- **Logro**: hito principal y permanente de entrenamiento/programa.
- **Insignia/parche**: reconocimiento concreto de actividad o evento.

El sistema existente `achievement_definitions` + `user_achievements` se reutiliza para insignias/logros; no se duplica.

Un evento especial puede hacer dos cosas en una sola operación de servidor: sumar puntos y otorgar una insignia.

## Ranking

La API futura debe devolver solo campos seguros para mostrar:
- temporada;
- rank;
- nombre del perro;
- puntos;
- rango;
- si es el participante actual;
- indicador de empate cuando aplique.

Nunca exponer en la tabla pública email, teléfono, UUID o nombre completo del dueño.

La pantalla debe ofrecer:
- podio 1.º/2.º/3.º;
- siguientes posiciones;
- posición propia separada si no está visible;
- puntos actuales;
- progreso al siguiente rango;
- movimientos propios;
- reglas activas.

## Empates

No introducir un desempate oculto por nombre, antigüedad o por ser el primero en llegar.

La consulta futura debe utilizar ranking por total y exponer empates. La UI debe poder presentar `Empate #2` sin romper el podio.

## Compatibilidad con la web actual

Antes de activar la app se debe definir una sola fuente de verdad para `Perro del Año 2026`.

Opciones válidas:
1. importar el estado de la web como `legacy_import` y continuar en Supabase;
2. migrar la web a consumir el backend común;
3. iniciar una temporada nueva con fecha de corte explícita.

No es válido mantener dos tablas con puntajes distintos.

## Offline

Leaderboard, resumen y movimientos propios pueden cachearse para lectura.

Los puntos definitivos son autoridad del servidor. Una acción pendiente de sincronización no puede modificar el total confirmado en UI.

Todos los eventos reintentables deben usar `dedupe_key`, por ejemplo:

`member_visit:<visit_uuid>`

## Seguridad

- cliente: lectura de su propio participante y ledger;
- leaderboard: RPC dedicado que devuelve campos de presentación seguros;
- escritura de puntos: solo RPC/Edge Function revisada o service role;
- cliente nunca inserta directamente en ledger;
- correcciones administrativas requieren razón y quedan trazadas.

## Tablas propuestas

- `ucapsa_points_seasons`
- `ucapsa_points_rules`
- `ucapsa_points_participants`
- `ucapsa_points_tiers`
- `ucapsa_points_ledger`

El SQL versionado está en `supabase/sql/ucapsa-points-foundation.sql` y **no debe aplicarse al remoto todavía**.

## Fuera de alcance de esta fase

- valores reales de puntos;
- umbrales Bronce/Plata/Oro;
- trigger automático sobre visitas;
- importación del ranking web;
- RPC público de leaderboard;
- cambios remotos de Supabase;
- navegación visible en producción;
- OTA, EAS Build, AAB o Google Play.

## Decisiones necesarias antes de activar

1. fuente de verdad / importación de `Perro del Año 2026`;
2. valores iniciales de cada regla activa;
3. umbrales de Bronce, Plata y Oro;
4. regla exacta de inscripción de socios con varios perros.

La arquitectura está diseñada para que esas decisiones sean configuración, no una reescritura.