# UCAPSA Puntos — fundamento de producto y datos

Estado: **estructura solamente**. Este documento no activa puntos, no publica UI y no aplica cambios remotos en Supabase.

## Fuente de producto existente

La web publica ya una idea de **Perro del Año**, una clasificación anual y mensajes de puntos acumulables, insignias por eventos y parches por logros. La app no debe inventar una segunda gamificación incompatible: debe convertir esa idea existente en un sistema auditable y ampliable.

Referencia pública:
- https://www.ucapsa.mx/
- https://www.ucapsa.mx/ucapsa/dogclub

## Objetivo

Crear una base que permita:

1. Acumular **Puntos UCAPSA** por acciones reales.
2. Mostrar una clasificación tipo Kahoot: podio 1.º/2.º/3.º y, separado, **tu posición** aunque estés fuera del top.
3. Derivar una medalla por rango de puntos: Bronce, Plata, Oro y futuras categorías sin cambiar código ni esquema.
4. Saber siempre **por qué** existe cada punto.
5. Añadir nuevas fuentes —asistencias, evaluaciones, eventos especiales, bonos administrativos u otras— sin rediseñar la base.
6. Mantener puntos e insignias como conceptos distintos: puntos miden participación; las insignias/logros reconocen hitos concretos.

## MVP

El primer MVP es **solo para Socios / Dog Club**.

No se activan todavía puntos para clientes normales. La primera fuente candidata es una visita de socio confirmada, pero el valor por visita no se fija en esta fase. Debe ser una regla configurable.

La tabla `member_visits` actual registra la visita a nivel de usuario. Por eso los puntos del MVP pertenecen a la cuenta del socio (`user_id`), no se asignan silenciosamente a un perro concreto. Para respetar la presentación pública de "Perro del Año", cada socio podrá tener un `leaderboard_dog_id` opcional que actúe como perro representante en la clasificación. Esto evita inventar a qué perro pertenece una visita cuando una cuenta tenga varios perros.

## Regla central: ledger, no saldo editable

Nunca guardar únicamente `total_points = 120` como verdad principal.

Cada cambio de puntos debe ser una entrada inmutable en un ledger:

- quién recibió los puntos;
- temporada;
- regla/fuente;
- entidad origen, si existe;
- cantidad positiva o negativa;
- razón;
- fecha;
- quién la otorgó;
- clave de deduplicación.

El total se obtiene sumando el ledger. Una corrección crea un ajuste/reverso; no reescribe el pasado. Esto permite auditoría, evita dobles premios y hace posible explicar al usuario "+X por visita de socio".

## Temporadas

La clasificación es por temporada, normalmente anual.

Ejemplo conceptual:

- código: `2026`
- nombre: `Perro del Año 2026`
- inicio / fin
- estado: draft / active / closed
- alcance inicial: members

Cerrar una temporada congela su clasificación histórica. La nueva temporada empieza en cero sin borrar el historial anterior.

## Fuentes de puntos

La estructura reserva estas fuentes desde el inicio, aunque el MVP solo active Socios:

- `member_visit` — visita de socio.
- `class_attendance` — asistencia válida a clase.
- `evaluation` — evaluación/valoración definida por UCAPSA.
- `special_event` — Elotiza, Halloween, Navidad u otro evento especial.
- `admin_adjustment` — corrección o bono explícito con motivo obligatorio.

No se deben codificar valores fijos dentro de pantallas. Cada temporada define reglas configurables.

## Medallas por puntos

Las medallas son **tiers derivados**, no logros manuales.

Ejemplo de producto, no valor definitivo:

- Bronce: desde N puntos.
- Plata: desde N puntos.
- Oro: desde N puntos.

Los umbrales viven en datos por temporada. Así se pueden calibrar sin publicar una nueva versión. No fijar todavía 100/200/300: la clasificación pública actual usa una escala menor, por lo que primero debemos decidir la economía de puntos.

La medalla se calcula a partir del total; nunca se duplica como saldo independiente.

## Insignias y logros

No duplicar el sistema existente de `achievement_definitions` + `user_achievements`.

- **Puntos**: cantidad acumulable y ranking.
- **Medalla Bronce/Plata/Oro**: estado derivado del total de puntos.
- **Insignia/parche**: logro concreto y permanente, por ejemplo asistir a un evento especial o completar una etapa.

En el futuro un mismo evento puede producir ambas cosas: sumar puntos en el ledger y otorgar una insignia existente.

## Clasificación

La pantalla futura debe devolver como mínimo:

- temporada activa;
- top 3 para podio;
- posiciones siguientes;
- posición del usuario aunque no esté visible en el top;
- puntos del usuario;
- medalla actual;
- puntos necesarios para la siguiente medalla;
- perro representante si existe.

La interfaz no debe exponer UUID, correo, teléfono ni otras PII de otros socios.

## Offline y consistencia

La clasificación puede cachearse para lectura offline, pero **los puntos son autoridad del servidor**.

Si una visita/acción queda pendiente de sincronización, la app puede mostrar la acción como pendiente, pero no debe afirmar un nuevo puntaje definitivo hasta que el servidor acepte el evento. Esto es especialmente importante para QR y deduplicación.

Cada evento que pueda reintentarse debe tener una clave idempotente (`dedupe_key`) para impedir dobles puntos.

## Estructura propuesta

- `ucapsa_points_seasons`: temporadas.
- `ucapsa_points_rules`: reglas configurables por temporada.
- `ucapsa_points_profiles`: configuración de participación/representación del socio.
- `ucapsa_points_tiers`: Bronce/Plata/Oro y futuros niveles.
- `ucapsa_points_ledger`: historial inmutable de puntos.

La estructura SQL está bosquejada en `supabase/sql/ucapsa-points-foundation.sql` y **no debe aplicarse al remoto hasta revisar los tipos generados y definir la economía inicial de puntos**.

## Fuera de alcance de esta fase

- No hay pantalla nueva.
- No hay puntos automáticos todavía.
- No hay trigger sobre `member_visits` todavía.
- No hay backfill de visitas históricas.
- No hay cambios en Supabase remoto.
- No hay OTA, EAS Build, AAB ni Google Play.

## Próxima decisión de negocio

Antes de activar el MVP hay que decidir solamente tres cosas:

1. cuántos puntos vale una visita de socio;
2. si las visitas históricas cuentan o el sistema empieza desde una fecha de corte;
3. umbrales iniciales de Bronce / Plata / Oro.

Todo lo demás puede construirse sobre esta base sin cambiar la arquitectura.
