# UCAPSA Puntos — auditoría UX histórica

**Estado: SUPERADA por Plan UCAPSA Rango 1.**

La auditoría anterior asumía un solo perro representante por socio y una pantalla centrada en `Puntos UCAPSA / Perro del Año`. Esa arquitectura ya no es la vigente.

La fuente canónica actual es [`docs/UCAPSA_RANGO_1.md`](./UCAPSA_RANGO_1.md).

Principios UX vigentes:

1. **General → particular:** resumen → contexto/listado → ficha → detalle/acción.
2. **No saturar:** Rango, Ranking, Exámenes, Ajustes, Premios y Temporadas son productos separados y pueden usar tabs/subpantallas.
3. **Una sola fuente verdadera:** la UI consume datos derivados de hechos canónicos; no recalcula ni mantiene totales paralelos.

Dirección actual del cliente:

```text
Mi perro
└── Competencia UCAPSA
    ├── Rango
    ├── Ranking
    ├── Exámenes
    │   └── Resultado por ejercicio
    └── Temporadas anteriores
```

Dirección actual de Admin:

```text
Admin
└── Competencia UCAPSA
    ├── Ranking
    ├── Rangos / Constancia
    ├── Exámenes
    ├── Puntos y ajustes
    ├── Premios
    └── Temporadas
```

El contenido previo permanece en el historial de Git para auditoría, pero no debe guiar nuevas implementaciones.