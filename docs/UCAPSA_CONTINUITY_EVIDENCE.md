# UCAPSA — Evidencia de continuidad y valor visible

## Objetivo estratégico

La estrategia es **sostener y mantener** haciendo visible el valor que UCAPSA ya entrega.

La hipótesis operativa es:

> Cuando el cliente puede ver de forma simple y comprobable cómo está aprovechando UCAPSA con su perro, esa información puede asociarse con mayor continuidad de actividad y pago.

Esto es una hipótesis medible, no una conclusión asumida.

## Las tres leyes prácticas

1. **General → particular.** Resumen → contexto/listado → ficha → detalle/acción.
2. **Una pantalla = un trabajo principal útil.** La profundidad baja a otra pantalla; Inicio, Mi perro y Admin Home no cargan todo.
3. **Una sola fuente verdadera.** Actividad, Constancia, pagos y membresía vienen de hechos canónicos; no se duplican ni se recalculan con otra fórmula.

## Qué significa “demostrar valor”

La cadena de información es:

```text
TIENES → APROVECHASTE → CONSEGUISTE → SIGUE
```

- **Tienes:** membresía, programa y servicios.
- **Aprovechaste:** asistencias, visitas y frecuencia real.
- **Conseguiste:** exámenes, progresión y reconocimientos registrados.
- **Sigue:** próxima actividad o acción útil.

Una asistencia demuestra participación/aprovechamiento. Por sí sola no demuestra aprendizaje.

## Unidad de análisis

La unidad estratégica es **cliente/pagador + temporada**, no perro.

Los perros aportan hechos de uso. La membresía y los pagos pertenecen a la cuenta del cliente. Esto evita duplicar a una persona con varios perros como si fueran varios pagadores.

## Exposición a valor visible

Sólo se registran dos superficies con significado:

- `constancy_summary`: el resumen de Competencia permaneció enfocado con el Nivel de Constancia ya renderizado durante al menos **750 ms**. Esto significa **resumen mostrado**, no prueba que la persona lo leyó;
- `constancy_detail`: el cliente abrió explícitamente el detalle de Constancia y el contenido quedó disponible.

La exposición se deduplica por:

```text
cliente + perro + temporada + superficie + día
```

Un refresh o varias aperturas el mismo día no inflan la métrica.

La exposición usa un **outbox local durable**: primero se guarda en el dispositivo y después se intenta sincronizar. Si no hay conexión, conserva el `occurred_at` original y lo envía cuando vuelve la red; el servidor deriva el día en `America/Mexico_City`. Así, una exposición offline no desaparece ni se mueve artificialmente al día de sincronización.

## Resultados observables

UCAPSA no tiene una “renovación de membresía” periódica: la membresía activa es de por vida del perro. Por eso no se crea una métrica ficticia de renovación.

Se observan hechos reales:

- actividad posterior a la primera exposición;
- **cualquier pago UCAPSA** posterior;
- **pago de membresía/mensualidad** posterior, separado del resto;
- estado actual de membresía;
- solicitud de eliminación posterior a la exposición;
- última actividad y días desde esa actividad.

Para evitar atribuir actividad previa del mismo día, **actividad posterior empieza al día siguiente de la primera exposición**.

La pantalla Admin permite observar ventanas de **7, 30, 60 y 90 días** después de la exposición. Esas ventanas son periodos de medición, no umbrales de “cliente bueno/malo” ni reglas de inactividad.

## Comparación expuesto / no expuesto

Para evitar comparar clientes con tiempos de seguimiento distintos, la comparación principal usa una cohorte con ancla común:

1. primera actividad del cliente en la temporada;
2. ventana de exposición temprana: primeros **7 días** desde esa actividad;
3. ventana de resultados: los **30 días siguientes** (días 8–37);
4. sólo entran clientes que ya completaron los **37 días** de seguimiento.

Se comparan:

- **Exposición temprana:** tuvo al menos una exposición registrada dentro de los primeros 7 días;
- **Sin exposición temprana:** no tuvo esa exposición en la misma ventana.

Para ambos grupos se observa actividad, cualquier pago y mensualidad durante los días 8–37.

Esto mejora la comparabilidad y evita que un cliente observado durante meses se compare directamente contra otro que apenas lleva días. Aun así, sigue siendo una comparación observacional: clientes más comprometidos pueden ser más propensos tanto a abrir la app como a seguir asistiendo/pagando.

## Qué NO concluye este modelo

No crea ni debe crear:

- `risk_score`;
- `churn_score`;
- umbrales arbitrarios de “cliente en riesgo”;
- penalización por 30/60/90/100 días;
- causalidad automática;
- renovación ficticia.

La pantalla Admin dice explícitamente que la lectura es **observacional**.

## Cómo interpretar la evidencia

Ejemplo:

```text
Cliente vio su Nivel de Constancia
→ 8 días después registró otra actividad
→ 21 días después aparece un pago
```

Eso significa “actividad y pago ocurrieron después de la exposición”.

No significa automáticamente:

```text
la pantalla causó la actividad o el pago
```

La cohorte expuesto/no expuesto mejora la comparación temporal, pero no elimina sesgo de selección. Para aproximarse a causalidad, una fase posterior necesitaría asignación controlada, rollout escalonado u otro diseño experimental.

## Privacidad y acceso

Cliente sólo puede registrar exposición mediante un RPC que valida:

- sesión autenticada;
- propiedad del perro;
- pertenencia del perro a la temporada.

La tabla de exposiciones no tiene acceso directo para usuarios autenticados.

Las observaciones agregadas sólo son accesibles mediante un RPC que valida rol Admin/Superadmin.

## Estado de datos

La infraestructura puede estar completamente operativa y devolver cero observaciones si todavía no existe una temporada competitiva poblada o si ningún cliente ha visto las superficies medidas.

Cero observaciones es un estado de datos, no un fallo del producto.
