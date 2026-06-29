# UCAPSA v5

Incluye:
- Tabla de socios tipo Excel: todos los encabezados visibles ordenan con ▲/▼.
- Se elimina el control separado de Orden.
- Acción reversible: Pagado este mes ↔ Pendiente de pago.
- Fila de socio abre ficha de socio.
- Perfil admin conectado a panel de usuarios o Mi UCAPSA según el caso.
- Pantalla admin/users real para clientes, socios y admins.
- Inicio: corona solo para admin o socio; cliente normal usa huella.

Aplicar:

```powershell
cd C:\Users\Omen\Documents\Proyectos\ucapsa-app
Expand-Archive -Path ".\ucapsa-redesign-v5.zip" -DestinationPath "." -Force
powershell -ExecutionPolicy Bypass -File ".\APPLY-UCAPSA-V5.ps1"
npx tsc --noEmit
npx expo config --type public
npx expo start -c
```
