# UCAPSA Web — fundamento multiplataforma (fase 1)

Estado: **propuesta en rama, NO desplegada**. Ningún cambio a `main` ni a Supabase de producción.

## Propósito y alineación

La plataforma de navegador complementa la aplicación móvil y permite trabajar desde computadora sin trasladar registros entre dispositivos.

Fuentes estratégicas suministradas por UCAPSA:
- Análisis interno (EFI): presencia digital básica y oferta de servicios integrados.
- Análisis externo (Porter): necesidad de comunicar el valor y la confianza de forma comprobable.
- PESTELG priorizado: la presencia web oficial se identifica como oportunidad tecnológica.

**Límite de esta fase:** habilitar navegación web sensible al rol y comprobar compilación; **no** cambiar el contenido comercial, las reglas de negocio ni la jerarquía de permisos.

## Arquitectura

- Aplicación móvil: conserva `src/app/(tabs)/_layout.tsx`.
- Navegador: `src/app/(tabs)/_layout.web.tsx` evita duplicar la barra de pestañas móvil.
- Contenedor web: `WebAppShell.web.tsx` muestra menú lateral en pantallas amplias y menú horizontal en pantallas estrechas.
- Contenedor nativo: `WebAppShell.tsx` no altera ninguna pantalla.
- Sesiones: mismo proveedor Supabase Auth y mismas políticas RLS existentes, con persistencia de sesión adecuada al navegador.
- Los menús reflejan las capacidades actuales. **No representan una concesión de permisos** y no reemplazan validación del servidor.
- La cuenta y los registros siguen teniendo una única fuente de verdad: el proyecto Supabase actual.

## Puerta de calidad obligatoria

Antes de cualquier merge o publicación:

1. `npm ci` y `npm run verify:release` completos, sin errores.
2. Exports Android, iOS y Web completos en CI.
3. Pruebas interactivas en Chrome y Edge: sesión, navegación y acceso a formularios.
4. Pruebas negativas por rol: cliente no puede abrir/ejecutar operaciones de administrador; entrenador no puede gestionar pagos o roles.
5. Pruebas de registro y consulta cruzada: cambio desde navegador visible correctamente en móvil, sin duplicados.
6. Recuperación de contraseña web y redirecciones permitidas en Supabase Auth verificadas.
7. Descarga de Excel y carga de archivos con APIs del navegador (no depender de `expo-sharing`).
8. Revisión de protección de datos, expiración de sesión y MFA para personal administrativo.
9. Aprobación operativa de administración, verificación de regreso atrás y validación estratégica.
10. Coordinar con el proveedor del sitio `ucapsa.mx` el futuro acceso al subdominio sin concederle permisos sobre Supabase.

## Pendientes posteriores

- Pantallas de escritorio específicas para listados/tablas: clientes, clases, pagos y reportes.
- Formularios de registro y vinculación de cuentas bajo control de Superadmin.
- Experiencia web de socios/clientes (perros, calendario, membresía y reportes personales).
- Espacio de entrenador y pruebas integrales de exámenes/estadísticas.
- DNS, TLS, URL de retorno de Auth y publicación solamente tras autorización explícita.

**No declarar la web terminada por el hecho de que CI esté en verde.**
