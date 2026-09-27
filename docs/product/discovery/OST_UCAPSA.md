# Opportunity Solution Tree — UCAPSA App

**Estado:** descubrimiento inicial  
**Regla:** no añadir oportunidades sin evidencia.

## Outcome de producto

> **Que el cliente pueda saber por sí mismo qué le toca a su perro, cómo va y qué sigue, sin depender de preguntar a UCAPSA.**

### Conexión con resultados de negocio

Este outcome puede contribuir a:

- reducir consultas administrativas repetitivas;
- aumentar uso útil de la app;
- mejorar continuidad entre programas;
- detectar abandono antes;
- mejorar retención.

Estas relaciones son **hipótesis** hasta contar con evidencia. No deben presentarse como causalidad demostrada.

---

## Árbol actual

```
OUTCOME
Que el cliente pueda saber por sí mismo:
qué le toca → cómo va → qué sigue
sin depender de preguntar a UCAPSA.

├── OPORTUNIDADES CONFIRMADAS
│   └── CAND-005 Usuario necesita distinguir progreso actual, historial, visitas y prácticas (INT-007 + INT-009)
│
├── OPORTUNIDADES EN OBSERVACIÓN
│   ├── CAND-001 Personal necesita consultar información operativa sin depender de una sola persona (INT-002)
│   ├── CAND-002 Personal necesita una fuente oficial y actualizada para confiar en los datos operativos (INT-002)
│   ├── CAND-006 Usuario necesita entender claramente qué puede hacer dentro de cada programa (INT-009)
│   ├── CAND-007 Cliente necesita consultar estado/historial de pagos sin depender de una persona (INT-010; apoyo INT-002)
│   └── CAND-008 Cliente podría necesitar avisar una ausencia desde la app sin recurrir a WhatsApp (INT-010)
│
└── SOLUCIONES
    └── No añadir soluciones antes de identificar la oportunidad.
```

## Qué cuenta como oportunidad

Una oportunidad describe una necesidad, dolor o deseo del usuario.

**Sí:**
- “No recuerdo cuándo me toca la siguiente clase.”
- “No sé cuántas clases llevo.”
- “No sé qué ocurre después de Puppy.”
- “Tengo que preguntarle a alguien para confiar en el horario.”

**No:**
- “Necesitamos un calendario mejor.”
- “Hay que poner push notifications.”
- “Debemos agregar una tarjeta nueva.”
- “Hay que rediseñar Home.”

Las segundas son soluciones.

## Registro de oportunidades

| ID | Oportunidad | Estado | Evidencia | Segmentos | Frecuencia observada | Impacto | Próxima prueba |
|---|---|---|---|---|---:|---|---|
| CAND-001 | Consultar información operativa sin depender de una sola persona | observación | INT-002: deudas, hotel y programación se consultan a Secretaría/Administración | operación/admin | 1 entrevista, múltiples ejemplos | alta potencial, sin medir | reconstruir un episodio de indisponibilidad y medir consultas durante 1 semana |
| CAND-002 | Tener una fuente oficial y actualizada para confiar en datos operativos | observación | INT-002: Secretaría/Administración funciona como fuente confiable de facto | operación/admin | 1 entrevista | media-alta potencial | preguntar por qué confía en esa fuente y qué necesitaría para confiar en el sistema |
| CAND-005 | Distinguir progreso actual, historial de clases, visitas de socio y prácticas | **confirmada** | INT-007 + INT-009: dos socios independientes confundieron las métricas; INT-007 además respondió incorrectamente cuántas clases faltaban | socio | 2 entrevistas independientes | alta | diseñar una solución y probar comprensión sin cambiar todavía el modelo de datos |
| CAND-006 | Entender claramente qué puede hacer dentro de cada programa y qué no ofrece la app | observación | INT-009: al ver Comandos/niveles esperaba evaluación, tips, ejercicios o clase grabada | socio | 1 entrevista | media potencial | repetir prueba con otro usuario sin explicar el alcance |
| CAND-007 | Consultar estado e historial de pagos de forma directa y confiable | observación | INT-010: envía comprobantes a Alejandra y consulta qué está pagado/no pagado; INT-002 aporta evidencia operativa relacionada con deuda/saldos concentrados en Secretaría | socio + operación | 1 entrevista cliente + apoyo cruzado | alta potencial | reconstruir una historia de pago con otro socio sin sugerir la app |
| CAND-008 | Informar una ausencia/cambio de asistencia sin abrir WhatsApp | observación | INT-010: preguntó espontáneamente si podía avisar desde la app que no asistiría a la siguiente sesión | socio | 1 entrevista | media potencial | observar si otro cliente intenta resolver la misma tarea espontáneamente |

## Árbol de soluciones

No se abrirá una rama de solución hasta que exista una oportunidad con evidencia suficiente.

Cuando se abra, usar:

```
OPP-###
└── SOL-### propuesta
    ├── ASSUMP-DES-### deseabilidad
    ├── ASSUMP-USA-### usabilidad
    ├── ASSUMP-FEA-### viabilidad técnica
    └── ASSUMP-BUS-### viabilidad de negocio
```

## Oportunidades de Operación / Admin en observación

| ID | Oportunidad | Estado | Evidencia | Segmento | Próxima prueba |
|---|---|---|---|---|---|
| CAND-009 | Conocer el estado básico de cuidado de cada perro sin depender de supervisión personal del propietario | observación | INT-001: el propietario reporta que debe revisar personalmente comida, lavado y estado general | operación | reconstruir un episodio cuando no estuvo presente y verificar fuente/registro actual |
| CAND-010 | Mantener adherencia a procedimientos críticos después de la capacitación inicial | observación | INT-001: los sistemas se siguen inicialmente y luego se degradan; stickers de perreras mejoraron una tarea concreta | operación | identificar un procedimiento aún problemático y reconstruir la última falla |

## Outcome de Admin separado

No mezclar problemas del cliente con problemas internos.

Outcome provisional de Admin:

> **Que Admin pueda saber quién necesita atención, quién viene a clase y qué requiere una decisión sin revisar cliente por cliente.**

Este outcome ya tiene soluciones implementadas —Inicio por decisiones, inscritos por clase, seguimiento 14/30—, pero sus oportunidades también deben validarse con historias reales de operación.
