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
│   └── [vacío hasta que exista evidencia]
│
├── OPORTUNIDADES EN OBSERVACIÓN
│   └── [vacío; registrar primero en snapshots]
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
| — | Aún no hay oportunidades confirmadas | — | — | — | — | — | Completar INT-001 |

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

## Outcome de Admin separado

No mezclar problemas del cliente con problemas internos.

Outcome provisional de Admin:

> **Que Admin pueda saber quién necesita atención, quién viene a clase y qué requiere una decisión sin revisar cliente por cliente.**

Este outcome ya tiene soluciones implementadas —Inicio por decisiones, inscritos por clase, seguimiento 14/30—, pero sus oportunidades también deben validarse con historias reales de operación.
