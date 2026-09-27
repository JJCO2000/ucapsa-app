# INT-001 — Propietario / Operación

**Estado:** en curso  
**Objetivo:** entender por qué el valor de UCAPSA App no resulta obvio para una persona con conocimiento profundo del negocio, sin asumir que su problema representa al cliente final.

## Contexto

Esta entrevista tiene dos capas distintas:

1. **Operación/Admin:** cómo administra hoy clientes, perros, clases, continuidad y decisiones.
2. **Comprensión del producto:** qué entiende que la app aporta y qué no.

No mezclar ambas capas.

## Parte 1 — Historia operativa

Abrir con:

> Piensa en la última vez que necesitaste saber qué clientes iban a venir a una clase, o detectar a alguien a quien había que darle seguimiento. ¿Qué pasó?

Seguir el guion general sin mencionar primero las nuevas funciones.

Profundizar:

- ¿Cómo supiste quién venía?
- ¿Dónde estaban esos datos?
- ¿Tuviste que preguntarle a alguien?
- ¿Cómo detectas hoy que alguien dejó de asistir?
- ¿Cómo sabes que un perro terminó Puppy pero no siguió?
- ¿Qué haces cuando lo detectas?
- ¿Qué tan tarde suele aparecer el problema?
- ¿Qué información te falta en ese momento?

## Parte 2 — Alternativa sin app

> Si la app no existiera, ¿cómo harías todo esto mañana?

Registrar el flujo completo.

No asumir que WhatsApp, memoria o Excel son alternativas inferiores.

## Parte 3 — Home sin explicación

Mostrar Home 10–15 segundos.

Retirar.

Preguntar literalmente:

> ¿Para qué sirve esta app?

> ¿Qué valor le da a un cliente de UCAPSA?

> ¿Qué valor le da a UCAPSA como negocio?

> ¿Qué recuerdas haber visto?

> ¿Qué harías primero?

No corregir hasta terminar las respuestas.

## Parte 4 — Admin

Pedir:

> Selecciona el próximo sábado y dime quién debería venir a Puppy.

> Dime cuántas personas hay en Comandos Básico, Intermedio y Avanzado.

> Encuentra a alguien que necesite seguimiento.

> Dime exactamente por qué necesita seguimiento.

Registrar éxito, tiempo, dudas y confianza.

## Parte 5 — contraste

Después de observar:

> ¿Qué de esto reemplaza algo que hoy haces manualmente?

> ¿Qué parte no reemplaza nada importante?

> ¿Qué dato seguirías confirmando fuera de la app?

> ¿Qué tendría que ocurrir para que dijeras: “esto sí le da valor real a UCAPSA”?

Si responde con una solución (“que mande X alerta”), preguntar:

> ¿Qué problema resolvería esa alerta?

## Cierre

No decidir en la reunión qué construir.

Después de la entrevista completar un snapshot separado usando `INTERVIEW_SNAPSHOT_TEMPLATE.md`.

### Hipótesis previas

**No llenar.**

La prueba debe empezar sin seleccionar una explicación favorita.


---

# Evidencia en vivo — 27 de septiembre de 2026

## Bloque A — supervisión diaria del cuidado

Ante una pregunta abierta sobre qué cosas del día a día requieren que él esté pendiente, el propietario mencionó de forma espontánea que necesita comprobar personalmente aspectos como:

- si un perro ya fue lavado;
- si comió;
- cómo comió;
- si se mantuvo bien;
- revisión general de que todo esté en orden.

Frases representativas:

> “Yo tengo que estar viendo: ¿ya lavado?, ¿comieron bien?, ¿qué tal comió ese perro?”

> “Yo tengo que estar checando eso.”

### Diagnóstico provisional

Existe una posible dependencia de **supervisión personal para conocer el estado operativo/cuidado de cada perro**.

Todavía NO sabemos:
- dónde se registra hoy esa información;
- si se registra de forma persistente;
- si el problema es falta de datos, falta de disciplina o falta de visibilidad;
- qué ocurre cuando el propietario no está presente;
- frecuencia o consecuencia de errores.

No convertir todavía en solución de software.

### CAND-009 — observación

> Operación necesita conocer el estado básico de cuidado de cada perro sin depender de que el propietario pregunte o inspeccione personalmente.

Estado: observación; falta reconstruir un episodio real.

---

## Bloque B — sistemas internos que pierden adherencia

El propietario describe un patrón operativo:

1. se define un sistema;
2. se enseña;
3. el personal lo sigue inicialmente;
4. después de semanas empieza a abandonar el procedimiento y vuelve a la rutina más fácil.

Ejemplo concreto: asignación de perreras.

Antes:
- un perro podía ser colocado un día en una perrera y otro día en otra;
- los números/pizarrones no bastaban para mantener la consistencia.

Intervención:
- stickers/letreros visibles en la perrera correspondiente.

Resultado reportado:
- el personal empezó a colocar consistentemente al perro en el lugar indicado.

### Lo que sí soporta este ejemplo

Un recordatorio/señal visible **en el punto de acción** mejoró la adherencia para esa tarea específica.

### Lo que todavía NO soporta

No demuestra que:
- todos los procesos necesiten stickers;
- una app vaya a resolver la adherencia;
- el problema sea sólo de capacitación;
- el comportamiento mejorado se mantenga indefinidamente.

### CAND-010 — observación

> Operación necesita que los procedimientos críticos sigan ejecutándose de forma consistente después del periodo inicial de capacitación.

Estado: observación con un caso concreto de solución física exitosa.

---

## Bloque C — recaída de hábitos en clientes

El propietario extendió el mismo patrón a clientes:

- reciben indicaciones sobre qué hacer con el perro;
- las siguen inicialmente;
- semanas después pueden volver a hábitos anteriores.

Ejemplos mencionados:
- volver a permitir subir al sillón;
- tolerar conductas que habían trabajado durante el entrenamiento.

### Clasificación

Esto se registra como **hipótesis del propietario sobre adherencia del cliente**, no como evidencia directa del cliente.

No abrir todavía una oportunidad de producto basada sólo en esta observación. Validar con clientes mediante historias reales de práctica en casa.

---

## Siguiente pregunta — sólo Bloque A

Objetivo: descubrir cómo se obtiene hoy el estado de cuidado cuando el propietario no puede observarlo directamente.

> Hoy, si tú no estás ahí, ¿cómo puedes saber que cada perro ya comió, fue lavado y está bien? Cuéntame la última vez que tuviste que averiguarlo.

Condición de cierre:
- identificar fuente actual;
- saber si existe registro o sólo comunicación verbal;
- reconstruir un episodio concreto;
- conocer la consecuencia si el dato no está disponible.

Después de alcanzar esto, cerrar Bloque A y pasar a adherencia de sistemas.


## Continuación — control de calidad del internado

El propietario describe un proceso de control de calidad para perros en internado/entrenamiento.

### Proceso esperado por nivel

- cada nivel dura **4 semanas**;
- en la **tercera semana** el perro debería dominar los ejercicios del nivel;
- la **cuarta semana** se usa para pulir, mecanizar y dar claridad a los comandos;
- por eso, el control de calidad debería ocurrir en la tercera semana, antes de la entrega final.

Ejemplo expresado:

> “Juan, vas a sacar el perro. [...] A la tercera semana el perro ya debe de saber hacer todo.”

La evaluación consiste en que el entrenador muestre el perro y el responsable compruebe si realmente cumple el nivel.

### Problema actual

El propietario reporta que han intentado delegar esa revisión:

> “Ale, vas a checar a Juan.”

Pero el seguimiento no se mantiene de forma consistente: puede hacerse una vez y luego dejar de repetirse.

Consecuencia conceptual señalada por el propietario:

> “Si no lo evalúo y lo dejo que se lo entregue al cliente, no tengo control de calidad.”

### Hipótesis de solución expresada por el entrevistado

El propietario propuso espontáneamente:

> un sistema que avise cuándo toca evaluar cada perro, por ejemplo en la tercera semana de cada nivel.

**No tratar el recordatorio como requisito validado.** La necesidad subyacente es asegurar que la evaluación ocurra a tiempo y de forma consistente.

### CAND-011 — observación

> Operación necesita asegurar que cada perro del internado sea evaluado en el punto correcto del nivel antes de entregarlo al cliente.

Evidencia:
- proceso definido por semanas;
- evaluación necesaria para control de calidad;
- seguimiento delegado que se degrada con el tiempo.

Estado: observación con alta relevancia operativa.

---

## Cierre del Bloque A — visibilidad del cuidado en la sede inferior

Ante la pregunta sobre cómo sabe si los perros comieron, fueron bañados y están bien cuando él no está:

- **Alejandra supervisa** esa operación;
- desde la sede superior no existe una forma directa de consultar ese estado;
- para conocerlo deben:
  - contactar a Alejandra; o
  - trasladarse físicamente a la otra sede.

El propietario indica que ya casi no baja personalmente porque:
- necesita permanecer entrenando/atendiendo en la sede superior;
- el tráfico entre ambas zonas puede volver el traslado muy lento;
- un viaje operativo puede consumir una parte sustancial del día.

Por esta razón, gran parte de la atención a clientes se concentra ahora en la sede superior.

### Diagnóstico de CAND-009

La fuente actual de verdad para el cuidado cotidiano en la sede inferior es **Alejandra + observación física**.

El problema no es necesariamente que el cuidado falle; el problema es que la visibilidad del propietario depende de una persona o de un traslado físico.

**Objetivo del bloque alcanzado. No profundizar más en cómo se consulta el estado básico salvo que aparezca un incidente concreto nuevo.**

---

## Siguiente bloque — control de calidad del internado

Objetivo:
reconstruir un caso real donde la evaluación de tercera semana no se haya realizado a tiempo y conocer la consecuencia.

Pregunta:

> Cuéntame la última vez que un perro llegó a la tercera semana y no se evaluó cuando tocaba. ¿Qué pasó después?

Condición de cierre:
- saber si realmente ocurre;
- saber qué consecuencia produjo;
- saber cómo se detectó;
- saber si se corrigió antes o después de la entrega.

Después de eso, cerrar el bloque de control de calidad y pasar al siguiente proceso.
