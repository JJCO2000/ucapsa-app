# UCAPSA Puntos — auditoría UX y colocación

Estado: decisión de producto y estructura. No activa puntos ni modifica Supabase remoto.

## Veredicto

**No añadir una sexta pestaña inferior.**

La navegación de cliente ya tiene cinco destinos principales: Inicio, Servicios, Clases, Pagos y Perros. El ranking es una función del Dog Club para socios, no un área principal equivalente a Pagos o Perros.

La pantalla debe existir como una ruta propia, conceptualmente `Puntos UCAPSA / Perro del Año`, pero entrar desde superficies ya existentes.

### Entrada principal recomendada

En **Servicios > Tu acceso como socio**, sustituir `Clases incluidas` por `Perro del Año` cuando la función esté activa.

Motivo:
- `Clases` ya existe como pestaña principal y ese acceso está duplicado.
- `Perro del Año` es un beneficio específico de socio y encaja naturalmente junto a Credencial e Historial de visitas.
- Mantiene tres accesos, no convierte el bloque en un grid 2x2 más pesado.

Quedaría:

- Credencial digital
- Perro del Año
- Historial de visitas

### Entrada secundaria futura

Cuando el sistema ya tenga datos reales, Inicio puede mostrar una franja compacta solo para socios:

`Perro del Año 2026 · #12 · 43 pts · Bronce  >`

No mostrar el podio completo en Inicio. Inicio debe seguir respondiendo primero qué pasa hoy con el perro y la cuenta.

### Perros

En Perros, el perro elegido para competir puede mostrar una franja contextual pequeña:

`Perro del Año · #12 · 43 pts`

No convertir Perros en otra tabla de clasificación. Su trabajo principal sigue siendo progreso, clases e historial.

### Admin

No añadir otro tab admin. La gestión futura vive en:

`Más > Puntos UCAPSA`

Ahí se podrán revisar reglas, temporada, ajustes, eventos especiales y auditoría del ledger.

---

## Benchmark aplicado

### Kahoot

La mecánica útil para UCAPSA no es copiar el juego completo, sino su jerarquía:

- clasificación visible durante la experiencia;
- podio final con 1.º, 2.º y 3.º;
- feedback claro de puntuación;
- celebración de cambios relevantes.

UCAPSA adapta eso a una temporada anual: podio arriba, clasificación debajo y la posición del usuario siempre recuperable aunque esté lejos del top.

### Don’t Make Me Think

Aplicación directa:

- no preguntar qué ranking quiere ver si solo hay una temporada activa;
- no pedir elegir perro si el socio tiene uno solo;
- no hacer que el usuario busque su nombre en una lista larga;
- no mezclar puntos, insignias, logros y rango como si fueran lo mismo;
- mostrar primero el resultado y después el detalle de cómo se obtuvo.

### Navegación móvil

La barra inferior debe reservarse para destinos principales. UCAPSA ya tiene cinco; Puntos debe ser una pantalla de segundo nivel accesible desde una superficie contextual.

---

## Pantalla propuesta

Orden de lectura: **temporada → podio → tú → resto → cómo ganas puntos → historial**.

```text
┌──────────────────────────────────┐
│ PERRO DEL AÑO 2026               │
│ Puntos UCAPSA · Dog Club         │
│                                  │
│          🥇                      │
│         HÉCTOR                   │
│        82 PUNTOS                 │
│      ┌────────┐                  │
│ 🥈   │   1    │   🥉             │
│ APOLO│        │ HUNTER           │
│  80  └────────┘   79             │
│                                  │
│ TU POSICIÓN                      │
│ ┌──────────────────────────────┐ │
│ │ #12  Tuka          43 pts   │ │
│ │ 🥉 Bronce · 7 para Plata    │ │
│ │ ███████████░░░░░            │ │
│ └──────────────────────────────┘ │
│                                  │
│ CLASIFICACIÓN                    │
│ 4  Dash                    78    │
│ 5  Kai                     72    │
│ 6  Nacho                   63    │
│ ...                              │
│                                  │
│ ¿Cómo gano puntos?             > │
│ Mis movimientos de puntos      > │
└──────────────────────────────────┘
```

El podio debe seguir el patrón visual 2.º izquierda, 1.º centro y más alto, 3.º derecha. La jerarquía debe funcionar aunque el usuario no distinga colores: siempre mostrar número de posición y texto.

---

## Qué se muestra y qué NO

### Sí

- nombre del perro participante;
- posición;
- puntos;
- rango/medalla de temporada;
- progreso hacia el siguiente rango;
- motivos de sus propios movimientos de puntos;
- reglas activas de la temporada.

### No

- email, teléfono, UUID o nombre completo del dueño de otros participantes;
- saldo editable sin historial;
- puntos optimistas por una acción todavía pendiente de sincronización;
- valores de puntos hardcodeados en la app;
- una segunda clasificación distinta de la publicada por UCAPSA sin decidir antes cuál es la fuente de verdad.

---

## Hallazgos críticos antes de activar

### 1. La web ya tiene una clasificación 2026

La app no puede lanzar un ranking nuevo con números diferentes. Antes de activar hay que decidir si:

- se importa el estado actual de la web como saldo inicial auditable; o
- la app pasa a ser la fuente de verdad y la web consume el mismo backend; o
- la temporada nueva empieza en una fecha explícita.

La estructura reserva `legacy_import` para un saldo inicial trazable si se necesita.

### 2. Un socio puede tener varios perros

El ranking público es `Perro del Año`, pero `member_visits` pertenece a la cuenta del socio. No se puede adjudicar una visita a un perro al azar.

Decisión de estructura: cada socio tiene **un participante por temporada**, asociado a un perro representante. Si tiene un solo perro, la app no pregunta. Si tiene varios, se elige uno antes de competir. Una vez que el participante recibe puntos, el perro queda bloqueado para esa temporada salvo corrección administrativa auditada.

### 3. Empates

La API futura debe calcular una posición estable. Recomendación: usar ranking por puntos y exponer si existe empate; no inventar desempates ocultos basados en hora, nombre o antigüedad.

### 4. Medallas vs logros

Hoy la app usa `Logros` e `Insignias`. Para no crear tres conceptos indistinguibles:

- **Puntos**: cantidad acumulable de temporada.
- **Rango de temporada**: Bronce / Plata / Oro.
- **Logro**: hito principal (Puppy, niveles, etc.).
- **Insignia/parche**: reconocimiento concreto de actividad o evento.

En UI se puede representar Bronce/Plata/Oro con una medalla, pero el texto principal debe decir `Rango` o `Medalla de temporada`, no mezclarlo con los Logros permanentes.

### 5. Offline

Leaderboard y movimientos propios pueden cachearse para lectura. El puntaje definitivo es servidor-autoritativo.

Si un QR queda pendiente:

`Visita guardada · pendiente de sincronizar`

No:

`+10 puntos`

hasta que el servidor acepte y deduplique el evento.

---

## Fuentes de puntos preparadas

La arquitectura debe soportar desde el inicio:

- `member_visit`
- `class_attendance`
- `evaluation`
- `special_event`
- `admin_adjustment`
- `legacy_import`

El MVP limita **quién participa** a socios. Eso no obliga a que para siempre exista una sola fuente de puntos.

Para acciones automáticas, cada premio necesita una clave idempotente. Ejemplo:

`member_visit:<visit_uuid>`

Un retry de red no puede otorgar puntos dos veces.

---

## Medidas de simplicidad

La implementación pasa si cumple:

1. Un socio puede llegar a `Perro del Año` desde Servicios con un solo toque.
2. En cinco segundos identifica quién va 1.º, 2.º y 3.º.
3. Encuentra su propia posición sin desplazarse por toda la lista.
4. Entiende por qué tiene sus puntos en un toque adicional.
5. Bronce/Plata/Oro no depende solo del color.
6. Un no socio no ve controles muertos de Puntos.
7. Un usuario offline ve la última clasificación guardada con estado claro, nunca datos inventados.
8. Ninguna acción cliente puede escribir puntos directamente.

---

## Secuencia de implementación

1. Estructura versionada de temporadas, reglas, participantes, rangos y ledger.
2. Resolver/importar la clasificación web 2026.
3. Definir economía inicial de puntos y umbrales.
4. RPCs servidor: resumen, leaderboard, movimientos propios y adjudicación idempotente.
5. Cache local de lectura.
6. Pantalla `Perro del Año`.
7. Activar entrada en Servicios para socios.
8. Añadir franja compacta en Inicio solo después de validar que aporta valor.
9. Admin `Más > Puntos UCAPSA` para reglas, eventos y correcciones.

No se debe adelantar el paso 6 con datos ficticios en producción.