# INT-011 — Socia · Puppy → Comandos

**Fecha:** 4 de octubre de 2026  
**Segmento:** socia / cliente con recorrido Puppy → Comandos  
**Estado:** entrevista cerrada para los temas cubiertos  
**Fuente:** transcripción aportada por el responsable del proyecto

## Contexto

La participante llegó a UCAPSA desde Puppy y actualmente está en Comandos. Evaluó una versión de prueba de UCAPSA App.

## Comprensión general

La participante describió la app como:

> “fácil de usar”

> “muy completa”

Y, al preguntarle si algo de Inicio se había confundido, respondió que no y que:

> “está muy sencillo”

### Lectura

Esto es **evidencia positiva de usabilidad/comprensión para esta participante**. No invalida los problemas de interpretación observados en otras entrevistas; demuestra que el problema no es universal.

## Valor concreto — clases y asistencias

La participante destacó espontáneamente la parte de Puppy porque sustituye la tarjeta física para controlar asistencias:

> “A mí se me perdió esa tarjetita”

Y explicó que en la app es más fácil saber cuántas clases quedan y cómo va, especialmente para personas que no tienen membresía y pagan por nivel.

### Hecho observado

La alternativa actual/referente de comparación es una **tarjeta física de asistencias**, que puede perderse.

### Implicación de producto

Refuerza el valor de mostrar de manera inequívoca:

- clases tomadas;
- clases restantes cuando existe un paquete finito;
- programa/nivel;
- historial.

No demuestra que asistencia sea aprendizaje o dominio.

## Socio vs. tarjeta finita

La participante distingue explícitamente entre:

- personas con membresía;
- personas que pagan por nivel / tarjeta.

### Implicación

La UI no debe usar la misma semántica de “X de Y restantes” para ambos modelos.

- Tarjeta/programa finito → X de Y + restantes.
- Socio → acceso ilimitado + programa/nivel real del perro.

## Cambios de horario, cancelaciones y actividades extraordinarias

La necesidad más concreta adicional fue recibir información oficial ante excepciones:

> “es complicado saber si hay cambios de horarios”

La participante conoce su horario habitual (“domingos 11:30”), pero quiere que cancelaciones, desfases y actividades extraordinarias se muestren desde Inicio y puedan generar una alerta en el celular, para no depender del grupo de WhatsApp.

### Estado de evidencia

**Oportunidad en observación.** Una entrevista directa con un episodio/tensión concreta, todavía sin repetición independiente suficiente para declararla oportunidad confirmada.

### Nota importante

El repositorio ya contiene:

- anuncios de alta prioridad en Inicio;
- cancelaciones que generan anuncio;
- preferencias de notificación;
- push de recordatorios/cancelaciones de clase.

Por tanto, esta entrevista **no justifica inventar una nueva feature**. Primero debe probarse si la solución existente cubre realmente a todos los segmentos y funciona en una versión instalada.

## Pagos

La participante sugirió:

> “debería poder añadir un pago en línea”

Esto se registra como **solución sugerida por una usuaria**, no como oportunidad confirmada.

También mencionó “los pagos” al hablar de posibles complicaciones, pero la conversación no reconstruyó un episodio concreto de pago con suficiente detalle.

**Estado:** hipótesis / requiere historia real antes de ampliar alcance.

## Foto del perro

Sugirió permitir foto del perro en perfil.

**Estado:** preferencia de personalización de una sola participante. Backlog; no afecta el outcome principal demostrado.

## Contacto con Administración

Cuando el entrevistador mencionó a Alejandra, la participante indicó que no sabía quién era; después se aclaró que era la persona detrás del WhatsApp administrativo.

No usar esta respuesta como evidencia de dependencia personal de Alejandra. Para esta participante, el canal conocido es WhatsApp, no una persona identificada.

## Diagnóstico

- [x] Comprensión general positiva
- [x] Valor de control de clases/asistencias
- [x] Alternativa actual concreta: tarjeta física
- [x] Comunicación oficial / cambios de horario
- [x] Dependencia de WhatsApp para excepciones
- [ ] Problema de pagos reconstruido con historia suficiente
- [ ] Necesidad de foto como oportunidad
- [ ] Mantenimiento postentrenamiento

## Alineación con outcome

Outcome:

> Que el cliente pueda saber por sí mismo qué le toca a su perro, cómo va y qué sigue, sin depender de preguntar a UCAPSA.

- **Qué me toca:** horario habitual y cambios excepcionales.
- **Cómo voy:** clases tomadas/restantes.
- **Qué sigue:** continuidad Puppy → Comandos y próxima clase.
- **Autonomía:** menos dependencia de tarjeta física y del grupo de WhatsApp.

## Próximas pruebas

1. Probar una cancelación real en una **versión instalada** con notificaciones habilitadas.
2. Verificar que el socio y el usuario con tarjeta finita reciban el aviso correcto.
3. Verificar que Inicio muestre el anuncio de cancelación sin necesidad de WhatsApp.
4. No abrir desarrollo de pago en línea hasta reconstruir un episodio real de pago y definir fuente/proceso.
