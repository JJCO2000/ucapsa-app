# UCAPSA — revisión Google Play sin datos personales de producción

## Estado y arquitectura

Este procedimiento prepara cuatro identidades (cliente, socio, entrenador y administrador) y datos exclusivamente sintéticos. **No funciona con la versión 9 (1.0.1) ya subida a Google Play**, porque esa compilación utiliza la base de producción.

1. Solicitar confirmación de costo antes de crear una rama persistente de Supabase. No copiar datos de producción.
2. Crear una rama aislada a partir del proyecto UCAPSA `hrfecmviyiluubymsoeq` (misma estructura y permisos, sin datos).
3. Crear y verificar las cuatro cuentas con `scripts/provision-google-play-review.mjs`, usando **solo la clave administrativa de la rama**.
4. Crear los datos ficticios con `scripts/seed-google-play-review.mjs`, **solo en la rama**.
5. Configurar Expo EAS en el entorno **preview** con:
   - `EXPO_PUBLIC_SUPABASE_URL=https://<REVIEW_BRANCH_REF>.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY_DE_LA_RAMA>`
   No registrar ni subir `service_role` a Expo o GitHub.
6. Ejecutar `eas build --platform android --profile playReview --non-interactive`.
   Este perfil mantiene el paquete de Google Play, genera un AAB y usa el canal OTA **play-review**.
   Su protección de build rechaza el ID de producción. Revisar que el AAB use código de versión superior al actual.
7. Sustituir la versión cerrada que apunta a producción por el AAB de revisión, y registrar las credenciales de las cuentas reales. No usar ambos entornos en una misma versión de prueba.
8. Antes de publicar una versión de producción general, construir nuevamente el perfil `production` con su backend normal y credenciales de revisión adecuadas para esa versión. Google necesita mantener acceso a las funciones revisables durante las revisiones.

**Importante:** el entorno `preview` de EAS es compartido por los perfiles que lo utilicen, incluido el APK preview existente. Comprueba las variables antes de cada compilación y no alteres el entorno `production`.

## Comandos de provisión local (Windows PowerShell)

Se requiere un Gmail bajo control del responsable y los valores de la rama creada. No enviar las claves administrativas por chat ni almacenarlas en Git.

```powershell
git checkout main
git pull origin main
npm ci
$env:PLAY_REVIEW_PROJECT_REF = "<REVIEW_BRANCH_REF>"
$env:SUPABASE_URL = "https://<REVIEW_BRANCH_REF>.supabase.co"
$env:PLAY_REVIEW_INBOX = "tu-bandeja-de-revision@gmail.com"
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = "<PUBLISHABLE_KEY_DE_LA_RAMA>"

# Simulaciones seguras: cero cambios
node scripts/provision-google-play-review.mjs
node scripts/seed-google-play-review.mjs

# Antes del siguiente paso, verifica que el panel activo sea la RAMA,
# nunca el proyecto principal. Introduce localmente la secret/service role
# de ESA RAMA. No uses una clave de producción.
$secret = Read-Host "Clave de Supabase rama de revision" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  node scripts/provision-google-play-review.mjs --apply
  node scripts/seed-google-play-review.mjs --apply
} finally {
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
```

El script de alta imprime las contraseñas **solo en tu consola local**: guárdalas en un gestor seguro antes de cerrarla. Si falla parcialmente, **no lo vuelvas a ejecutar a ciegas**: primero inspecciona Auth y los registros existentes en la rama.

## Campos de Google Play — Datos de inicio de sesión

Usar **Añadir detalles** una vez por rol:

| Campo | Valor |
| --- | --- |
| Nombre | `UCAPSA - Client Review` (análogos para Member, Trainer, Admin) |
| Nombre de usuario | Correo realmente creado (alias `+ucapsa-play-<role>` de la bandeja controlada) |
| Contraseña | Contraseña de ese usuario generada localmente |
| Otra información | Pasos de acceso en inglés y funcionalidades específicas del rol |
| Casilla de acceso completo | Marcar solo después de probar que las cuatro credenciales permiten recorrer todas las partes de revisión, incluidas las restringidas |

Texto de instrucciones (adaptar rol):

```text
1. Open UCAPSA and tap "Iniciar sesión".
2. Sign in with the review email and password above.
3. Explore the features available to this account.
4. This account uses sample data only; no purchase or extra verification is required.
```

No proporcionar acceso a cuentas personales. Las acciones en el entorno de revisión no afectarán a la base de datos de clientes reales.

## Criterios de aceptación pendientes (no asumir completados)

- Las cuatro identidades constan en Auth de la **rama**, verificadas por inicio de sesión y RPC de rol.
- Las tablas de datos de ejemplo contienen solo personas y perros ficticios.
- App Review AAB se conecta solamente a la rama y ofrece Cliente, Socio, Entrenador y Admin.
- Test manual de navegación, permisos, QR/exámenes, descarga de reportes y flujos de error; Google Play Console puede requerir otra revisión.
- Nunca mezclar ni copiar datos sensibles de la base productiva.
