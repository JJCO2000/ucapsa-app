# UCAPSA Web — abrir desde GitHub sin instalar nada

## Acceso rápido

**[ABRIR VISTA WEB PRIVADA EN GITHUB CODESPACES](https://codespaces.new/JJCO2000/ucapsa-app/tree/feat/web-unified-portal-foundation?quickstart=1)**

1. Inicia sesión con **tu cuenta de GitHub**.
2. Elige **2-core**, si aparece, y pulsa **Create codespace** / **Crear Codespace**.
   No aceptes cargos ni selecciones configuraciones de pago; confirma tu cuota
   gratuita disponible en https://github.com/settings/billing.
3. GitHub instala las dependencias y genera la web automáticamente.
   En la pestaña **Ports / Puertos**, abre el puerto **8081** (o pulsa la vista
   previa que se abra). No hace falta instalar nada en la computadora.
4. Al terminar: GitHub > https://github.com/codespaces > menú del Codespace >
   **Stop codespace**. Detenerlo evita seguir consumiendo horas de ejecución.

**Privacidad:** deja el puerto 8081 como **Private / Privado** (valor por defecto).
Los puertos privados exigen inicio de sesión en GitHub y sólo puede acceder
quien creó el Codespace. No cambies el puerto a Public.

## Alcance REAL de esta demo

- Esta vista **muestra solamente la estructura visual del navegador** y las
  secciones que pueden usarse sin inicio de sesión; **NO incluye usuarios,
  asistencia, pagos, Excel operativo ni datos productivos**.
- El inicio de sesión está deshabilitado en este modo; no escribas contraseñas.
- Se compila únicamente desde la rama `feat/web-unified-portal-foundation`.
- `scripts/github-web-preview.mjs` sustituye las variables públicas de
  Supabase por valores ficticios en una exportación local. No toca producción.
- Un acceso privado de GitHub **no sustituye** autenticación ni RLS del producto.
  Las funciones administrativas reales sólo deben probarse con un Supabase
  de staging, usuarios ficticios y pruebas de permisos por rol.
- Si la demo visual no inicia, revisa `/tmp/ucapsa-github-preview.log` en
  la terminal de Codespaces; no introduzcas variables de producción.

## Coste y límites

GitHub ofrece una cuota gratuita mensual **para cuentas personales** (en
octubre de 2026, GitHub informa 120 core-hours / 60 horas en máquina de 2
núcleos, y 15 GB de almacenamiento incluidos). Esta cuota no es ilimitada.
El uso fuera del límite gratuito podría generar cargos si tu cuenta permite
gasto; por eso sólo el usuario puede crear el Codespace y revisar su
configuración de facturación. La preparación en GitHub no inicia máquinas.

## Objetivo multiplataforma — regla UCAPSA #7

UCAPSA debe funcionar como un solo sistema en Android, iOS y web, compartiendo
datos, permisos y lógica de negocio. Antes de desarrollar cada función, evaluar
su impacto y compatibilidad en las tres plataformas, adaptando únicamente la
interfaz cuando sea necesario, sin duplicar código ni comprometer lo existente.

## Enlaces oficiales

- Códigospaces privados: https://docs.github.com/en/codespaces/reference/security-in-github-codespaces
- Previsualizar por puerto: https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
- Cuota: https://github.com/features/codespaces

**Estado:** esto es una **demo visual**. PR #346 permanece borrador.
No se fusionan cambios, ni se publica UCAPSA, ni se conectan datos reales.
