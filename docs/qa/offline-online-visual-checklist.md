# UCAPSA — cierre offline/online y visual

Este checklist complementa los guards automáticos. CI protege contratos de código; **esta parte requiere una app instalada en un dispositivo real** y no debe marcarse como aprobada sin ejecutarla.

## 1. Preparación online

- [ ] Iniciar sesión con una cuenta cliente/socio de prueba.
- [ ] Abrir una vez: Inicio, Clases, Perros y Pagos para calentar sus cachés.
- [ ] Abrir Racha y práctica y confirmar que carga actividad remota.
- [ ] Confirmar que Pagos muestra saldo y movimientos, pero no muestra CLABE en la pantalla resumen.
- [ ] Si existe un cargo abierto, abrir su detalle y confirmar que `Transferir` es una acción posterior al detalle.

## 2. Modo avión

Activar modo avión sin cerrar sesión.

- [ ] Inicio sigue mostrando la última información válida y avisa que es información guardada.
- [ ] Clases muestra clases guardadas y no bloquea la pantalla con un spinner.
- [ ] Mi perro conserva perro, entrenamiento/logros disponibles e historial guardado; un fallo de clases no debe ocultar los logros.
- [ ] Pagos conserva únicamente el resumen financiero guardado.
- [ ] Pagos **no muestra banco, titular ni CLABE** desde caché.
- [ ] Intentar abrir `Transferir`: debe pedir reconexión/verificación y nunca mostrar una CLABE anterior como vigente.

## 3. Escrituras offline

### Asistencia / visita

- [ ] Registrar una asistencia o visita con el flujo QR mientras no hay red.
- [ ] Confirmar que la app informa que el registro queda pendiente/local, sin duplicarlo al repetir la vista.

### Práctica

- [ ] Completar una práctica sin red.
- [ ] Confirmar que aparece inmediatamente en Racha/Historial con estado pendiente.
- [ ] Anotar su hora visible; debe conservarse después de sincronizar.

## 4. Recuperación de red

Desactivar modo avión y llevar la app a segundo plano y de nuevo a primer plano.

- [ ] La cola de asistencia/visita se reintenta automáticamente.
- [ ] La cola de prácticas se reintenta automáticamente sin exigir volver a abrir Racha.
- [ ] La asistencia/visita aparece una sola vez en servidor/UI.
- [ ] La práctica aparece una sola vez y conserva la hora real en que se terminó offline.
- [ ] El estado pendiente de la práctica desaparece después de confirmación remota.
- [ ] Inicio/Clases/Perros se actualizan sin borrar primero el contenido válido guardado.
- [ ] Abrir de nuevo `Transferir` y confirmar que la cuenta bancaria se verifica en vivo antes de habilitar Copiar CLABE.

## 5. Multi-perro — spot check físico

Sólo si existe una cuenta de prueba con dos perros; no crear datos ficticios en una cuenta productiva sólo para esta revisión.

- [ ] Seleccionar perro A: sólo aparecen sus programas, historial y medallas.
- [ ] Seleccionar perro B: sólo aparecen sus programas, historial y medallas.
- [ ] Si ambos tienen la misma medalla (por ejemplo Puppy), cada perro conserva su propio estado.
- [ ] Un logro abierto desde Inicio lleva al perro correcto.
- [ ] La próxima clase y `Tu programa` corresponden al mismo perro/inscripción.

## 6. Capturas de cierre visual

Capturar, como mínimo, una pantalla completa de cada nivel relevante y revisar que no haya títulos duplicados, tarjetas anidadas innecesarias, texto cortado ni acciones profundas en el resumen.

- [ ] Inicio — resumen general.
- [ ] Ajustes de cuenta → Mis datos → Notificaciones.
- [ ] Mi perro — perro seleccionado, entrenamiento, logros e historial.
- [ ] Racha y práctica → Historial → Detalle de práctica.
- [ ] Clases → Detalle de clase → Registrar asistencia.
- [ ] Pagos → Cargos abiertos → Detalle de cargo → Transferir.
- [ ] Pagos → Historial → Detalle de pago.
- [ ] Servicios — hub de membresía/accesos.
- [ ] Repetir las pantallas clave en formato socio/premium si la cuenta de prueba lo permite.

## Criterio de cierre

Paso 9 sólo tiene dos estados distintos:

- **Automatización PASS:** `check:offline-roundtrip`, `verify:release`, auditoría crítica y export Android pasan en CI.
- **Dispositivo PASS:** todos los puntos aplicables de este documento fueron ejecutados físicamente y se revisaron las capturas resultantes.

No confundir un export Android correcto con una prueba física. Hasta que exista un harness autenticado de dispositivo/emulador seguro, el segundo estado requiere ejecución manual en el teléfono.
