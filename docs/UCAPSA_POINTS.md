# UCAPSA Puntos — documento histórico

**Estado: SUPERADO por Plan UCAPSA Rango 1.**

La propuesta anterior modelaba `Perro del Año` alrededor de un único perro representante por socio y mezclaba puntos, rango y ranking de una forma que ya no corresponde con las decisiones vigentes de producto.

La fuente canónica actual es:

- [`docs/UCAPSA_RANGO_1.md`](./UCAPSA_RANGO_1.md)
- fundación SQL: `supabase/sql/ucapsa-rango-1-foundation.sql`

Reglas actuales que sustituyen este diseño anterior:

- cuenta/membresía pueden ser compartidas, pero competencia es `dog_id + season_id`;
- una visita de socio es un solo evento y puede acreditar a varios perros mediante `member_visit_dogs`;
- Rango deriva de constancia; Ranking deriva de constancia + exámenes + ajustes Admin;
- exámenes guardan resultados por ejercicio, no sólo un total;
- 🥇🥈🥉 son posiciones dinámicas, no logros permanentes;
- `Perro del Año` es un premio permanente otorgado explícitamente;
- Admin puede sumar/restar puntos sin motivo obligatorio, con auditoría automática;
- no se guardan como fuente editable `total_points`, `rank_position`, rango ni podio.

El contenido previo permanece disponible en el historial de Git para auditoría, pero no debe usarse para nuevas implementaciones.