# UCAPSA Web — enlace privado de pruebas ($0)

**Estado:** preparada la ruta técnica; **no se ha creado ni desplegado un sitio**.
No existe un enlace accesible todavía. Se necesita una cuenta de Cloudflare autorizada
para crear un proyecto y activar Cloudflare Access. Todo permanece en el PR #346.

## Proveedor y costo

- Hosting: **Cloudflare Pages, plan Free** (según límites vigentes).
- Acceso: **Cloudflare Access** con correos autorizados y verificación de identidad.
- Sitio oficial ucapsa.mx: **no se toca**. Para la prueba se utiliza *.pages.dev.
- Repositorio y Supabase: un único código y SSOT, pero la prueba debe usar **otro proyecto
  Supabase**, no producción.
- Nunca colocar `service_role` o claves secretas en el frontend.

No usar Vercel Hobby para UCAPSA: sus términos restringen uso comercial.

## Configuración de Cloudflare Pages (sólo por el dueño de la cuenta)

1. Crear/iniciar sesión en https://dash.cloudflare.com/ en su **plan gratuito**.
   No seleccionar mejoras de pago ni proporcionar tarjeta a solicitud de esta guía.
2. Crear proyecto Pages a través de GitHub, elegir **JJCO2000/ucapsa-app**.
   Dejar **main** como rama de producción, pero introducir desde el inicio el comando
   de compilación protegido de abajo para que no pueda publicarse main accidentalmente.
3. Configuración de compilación:
   - Root directory: `/` (raíz del repositorio).
   - Build command:
     `npm ci && node scripts/check-web-preview-env.mjs && npx expo export --platform web --output-dir dist --clear`
   - Output directory: `dist`.
   - Node.js: `NODE_VERSION=22`.
   - Variables del entorno de **preview** (nunca producción):
     `CF_PAGES_BRANCH` se configura automáticamente por Cloudflare.
     `EXPO_PUBLIC_UCAPSA_REVIEW_BUILD=true`.
     `EXPO_PUBLIC_SUPABASE_URL=https://<PROYECTO-SUPABASE-PRUEBAS>.supabase.co`.
     `EXPO_PUBLIC_SUPABASE_ANON_KEY=<CLAVE-PUBLICABLE-DE-PRUEBAS>`.
   - La variable `CF_PAGES` es suministrada por Cloudflare.
4. Después de crear el proyecto, entrar en **Settings > Builds > Branch control**:
   desactivar compilaciones automáticas de la rama producción/main;
   configurar Preview branch > Custom branches > permitir sólo
   `feat/web-unified-portal-foundation`.
5. **Antes de habilitar una publicación que contenga datos reales**, activar la protección:
   Pages > **Settings > General > Enable access policy**;
   en Cloudflare Zero Trust/Access permitir sólo correos autorizados.
   Los preview URLs son **públicos por defecto** si esto no se activa.
   Proteger también el dominio base `<proyecto>.pages.dev`: de lo contrario
   podría quedar público aunque las previews estén protegidas.
   Referencia: https://developers.cloudflare.com/pages/platform/known-issues/
6. Comprobar desde ventana de incógnito y sin sesión de Cloudflare que el enlace
   exige autenticación **antes de mostrar cualquier contenido**. Sólo entonces
   invitar a revisión. No publicar datos reales o usar cuentas productivas.
7. Configurar en el **Supabase de pruebas** únicamente los Redirect URLs permitidos:
   `https://<URL-PREVIEW-VALIDADA>/auth/update-password`.
   No utilizar `*` como comodín de redirección de Auth en producción.
8. Comprobar con cuentas ficticias que Admin, Entrenador y Cliente sólo acceden a
   operaciones permitidas. Descargar Excel, comparar las 4 hojas y validar cierre
   de sesión. Ver `docs/qa/UCAPSA_WEB_FOUNDATION.md`.

### Puertas que BLOQUEAN el despliegue

- `scripts/check-web-preview-env.mjs` falla ante: main, entorno no Cloudflare,
  proyecto Supabase de producción, URL ficticia, modo revisión apagado o clave
  secreta de Supabase.
- **Cloudflare Access NO puede verificarse con un script de GitHub**: hay que
  configurarlo en el panel y probarlo sin una sesión iniciada.
- Nunca activar la rama principal como producción de este proyecto de pruebas.
- Publicar una compilación estática por sí solo no demuestra que las rutas
  dinámicas, autorizaciones RLS o recuperación funcionen.
- Si la cuenta Cloudflare o Supabase requiere pagar, **detenerse** y no autorizar
  cobros ni cambiar de plan.

## Regla UCAPSA #7 — plataforma única y multiplataforma

> UCAPSA debe funcionar como un solo sistema en Android, iOS y web, compartiendo
> datos, permisos y lógica de negocio. Antes de desarrollar cada función, evaluar
> su impacto y compatibilidad en las tres plataformas, adaptando únicamente
> la interfaz cuando sea necesario, sin duplicar código ni comprometer lo existente.

La ejecución CI de verificación del repositorio prueba el código; la protección
de acceso externo sólo se certifica mediante pruebas posteriores a la configuración
del proveedor.

### Enlaces de referencia

- Pages Git: https://developers.cloudflare.com/pages/configuration/git-integration/
- Pages Access previews: https://developers.cloudflare.com/pages/configuration/preview-deployments/
- Config de compilación: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Known issues de Access para dominio base:
  https://developers.cloudflare.com/pages/platform/known-issues/
