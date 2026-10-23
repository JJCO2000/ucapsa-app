# UCAPSA — revisión acotada de GHSA-MRHX-C7XC-M3W5 (23 oct 2026)

## Evidencia reproducible

- La ejecución CI de `verify:release` del PR #474 falló en `check:npm-advisory-baseline` tras recibir una nueva alerta alta: `zod: GHSA-MRHX-C7XC-M3W5`. El `npm audit` reportó 7 hallazgos altos, 0 críticos.
- El lockfile oficial instala `zod@3.25.76` bajo `node_modules/zod`. Su **único dependiente directo declarado** en el lockfile es `node_modules/expo/node_modules/@expo/cli` (`zod: ^3.25.76`).
- No hay dependencia directa `zod` declarada por UCAPSA en `package.json`. Esto limita la evidencia de exposición a las herramientas de Expo; **no prueba ausencia de riesgo en todas las rutas de ejecución**.
- El aviso describe posible consumo no acotado de memoria en la validación de colecciones grandes. Las fuentes de GHSA/VulnCheck difieren sobre el alcance de la corrección en Zod 4.6.6: un límite explícito de tamaño mejora la ruta acotada, pero no corrige necesariamente colecciones sin límite.
- Subir Zod 3 a 4 viola el rango de Expo CLI; **no** introducir `overrides` de versión mayor ni `npm audit fix --force` sin pruebas de compatibilidad y una actualización avalada por Expo.

Fuentes de revisión: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 ; https://github.com/colinhacks/zod/pull/6652 ; https://cve.circl.lu/vuln/ghsa-mrhx-c7xc-m3w5

## Control provisional (NO es corrección de vulnerabilidad)

El advisory entra a la lista **explícita y comprobada** de avisos conocidos solo con:
1. Versión exacta `3.25.76`.
2. Único dependiente directo permitido: `expo/node_modules/@expo/cli`.
3. Vencimiento del control: **1 noviembre 2026** (hora UTC). Tras ese día CI falla hasta nueva revisión.
4. Ninguna ampliación del presupuesto a más de 7 hallazgos altos; 0 críticos; cualquier GHSA distinto falla.
5. CI/CodeQL deben seguir verdes. No se actualiza ni despliega ningún paquete.

No declarar el problema como resuelto ni como seguro para desplegar. Antes de publicar AAB: revisar cambio oficial de Expo CLI/Zod, identificar entradas no confiables que lleguen a validadores sin límite y volver a ejecutar `npm audit`; documentar el resultado real. Las pruebas de código de Cliente continúan separadas en el PR #474.
