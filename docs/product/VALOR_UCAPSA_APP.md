# UCAPSA App — hacer visible el valor

**Revisión:** 27 de septiembre de 2026

## Problema observado

UCAPSA App ya contiene muchas capacidades útiles, pero una lista de funciones no explica por sí sola por qué alguien debería usarla.

La tesis de producto ya existente en el código es:

**TIENES → APROVECHASTE → CONSEGUISTE → SIGUE**

El trabajo ahora no es añadir funciones por añadirlas, sino hacer visible esa secuencia con resultados concretos.

## Propuesta de valor a probar

### Cliente

**Tu próxima clase, tus clases tomadas, tus logros y el siguiente paso de tu perro, en un solo lugar.**

La app debe responder rápidamente cuatro preguntas:

1. ¿Qué me toca ahora?
2. ¿Qué he aprovechado?
3. ¿Qué consiguió mi perro?
4. ¿Qué sigue?

### Admin

**Saber quién necesita atención, quién viene a clase y qué requiere una decisión.**

La app debe reducir trabajo de memoria y seguimiento:

- quién debería venir a cada clase;
- quién dejó de asistir;
- quién terminó Puppy y no continuó;
- quién tiene pagos o membresías que requieren atención;
- qué perros están listos para una decisión de nivel.

## Antes / después que debemos comunicar

### Cliente

**Antes**
- preguntar por mensaje cuándo toca clase;
- recordar cuántas asistencias lleva;
- no tener una vista única de logros, competencia y siguiente paso;
- consultar información en lugares separados.

**Con UCAPSA App**
- próxima clase visible;
- clases tomadas (asistencias registradas) y práctica visibles;
- logros y Competencia visibles;
- siguiente acción visible;
- pagos, membresía y calendario en la misma cuenta.

### Admin

**Antes**
- contar inscritos manualmente;
- descubrir inactividad tarde;
- revisar clientes uno por uno;
- depender de memoria para continuidad y decisiones.

**Con UCAPSA App**
- inscritos por clase y nivel desde Calendario;
- seguimiento automático a los 14 días post-Puppy y 30 días sin asistencia;
- Inicio Admin centrado en decisiones;
- ficha única por cliente/perro.

## Principios de producto

1. **Resultado antes que función.** No presentar "QR, calendario, ranking" como el valor. Presentar lo que permiten saber o hacer.
2. **Prueba visible.** Cuando sea posible, mostrar datos reales del usuario: próxima clase, asistencias, logros, posición o siguiente paso.
3. **No sobreprometer aprendizaje.** Asistencia y práctica son evidencia de uso; UCAPSA App no debe presentarlas como prueba automática de dominio o aprendizaje.
4. **Una jerarquía corta.** Lo más importante debe poder entenderse desde Home; detalles y herramientas avanzadas permanecen detrás.
5. **Admin por excepción.** El Inicio Admin muestra lo que requiere intervención, no un menú de todo el sistema.

## Prueba de comprensión recomendada

Probar primero con el fundador/familia y después con 5–10 clientes.

Mostrar Home durante 10–15 segundos y preguntar, sin explicar:

- "¿Para qué crees que sirve esta app?"
- "¿Qué te resolvería a ti?"
- "¿Qué harías primero aquí?"
- "La última vez que necesitaste saber horario, asistencias o qué seguía para tu perro, ¿cómo lo resolviste?"

Criterio inicial de éxito:

- la mayoría debe poder describir el beneficio sin enumerar funciones;
- deberían mencionar al menos dos de estas ideas: **qué toca, cómo va, qué consiguió, qué sigue**.

No preguntar primero "¿te gusta?", porque mide opinión superficial y no comprensión del valor.

## Referencias utilizadas

- Strategyzer — Value Scenes: make visible how your product creates value  
  https://www.strategyzer.com/programs/value-scenes-make-visible-how-your-product-creates-value
- April Dunford — A Quickstart Guide to Positioning  
  https://www.aprildunford.com/post/a-quickstart-guide-to-positioning
- April Dunford — Obviously Awesome  
  https://www.aprildunford.com/books
- Teresa Torres / Product Talk — Opportunity Mapping  
  https://www.producttalk.org/opportunity-mapping/
- Teresa Torres / Product Talk — Product Discovery Fundamentals  
  https://www.producttalk.org/product-discovery-fundamentals-course/
- Intercom — Understanding the Aha Moments in Your Product  
  https://www.intercom.com/blog/understanding-your-aha-moments-and-putting-them-to-work/

## Próximo experimento

No rediseñar todo Home de una vez.

Primera prueba:
- hacer explícita en Home la promesa concreta "próxima clase · clases tomadas · logros · siguiente paso";
- observar si las personas pueden explicar el valor más rápido;
- conservar la instrumentación de continuidad ya existente para estudiar uso posterior, sin interpretar correlación como causalidad.


## Sistema de investigación

La validación de esta propuesta se gestiona en `docs/product/discovery/`.

El sistema combina:

- **April Dunford:** entender la alternativa actual y el valor diferencial desde lo que la persona hace hoy sin UCAPSA App.
- **Teresa Torres:** outcome, entrevistas de historias reales, oportunidades respaldadas por evidencia, pruebas de soluciones y revisión continua.

El Opportunity Solution Tree empieza deliberadamente sin oportunidades confirmadas. Las oportunidades sólo se añaden cuando existe evidencia documentada en Interview Snapshots.
