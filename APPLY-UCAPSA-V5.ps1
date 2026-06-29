$ErrorActionPreference = "Stop"

Write-Host "Aplicando UCAPSA v5: tabla tipo Excel, acciones reversibles y perfil admin conectado..."

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$current = (Get-Location).Path

function IsProjectRoot($path) {
  return (Test-Path (Join-Path $path "package.json")) -and (Test-Path (Join-Path $path "src"))
}

if (IsProjectRoot $current) {
  $projectRoot = $current
} elseif (IsProjectRoot $scriptRoot) {
  $projectRoot = $scriptRoot
} elseif (IsProjectRoot (Split-Path -Parent $scriptRoot)) {
  $projectRoot = Split-Path -Parent $scriptRoot
} else {
  throw "No pude encontrar la raíz del proyecto. Ejecuta este script desde C:\Users\Omen\Documents\Proyectos\ucapsa-app."
}

$payloadRoot = Join-Path $scriptRoot "payload-v5"
if (!(Test-Path $payloadRoot)) {
  throw "No encuentro payload-v5 junto al script. Extrae de nuevo el ZIP v5."
}

Set-Location $projectRoot

# Limpieza de paquetes anteriores que no deben quedarse dentro del proyecto.
Remove-Item (Join-Path $projectRoot "ucapsa-visual-redesign-v2-clean") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "ucapsa-redesign-v2-fixed") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "ucapsa-v3-work") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "payload") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "payload-v3") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "payload-v4") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot ".ucapsa-backups") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "_backup_before_visual_redesign_*") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "README-FIXED.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "README-V3.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "README-V4.md") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "APPLY-REDESIGN-V2-FIX.ps1") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "APPLY-UCAPSA-V3.ps1") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $projectRoot "APPLY-UCAPSA-V4.ps1") -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path "assets\images\brand" | Out-Null
New-Item -ItemType Directory -Force -Path "src\constants" | Out-Null
New-Item -ItemType Directory -Force -Path "src\components\ui" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\(tabs)" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\admin" | Out-Null

Copy-Item (Join-Path $payloadRoot "assets\images\brand\ucapsa-wordmark.png") "assets\images\brand\ucapsa-wordmark.png" -Force
Copy-Item (Join-Path $payloadRoot "assets\images\brand\ucapsa-mark.png") "assets\images\brand\ucapsa-mark.png" -Force

$files = @(
  @{ Source = "src\constants\brand.ts.txt"; Dest = "src\constants\brand.ts" },
  @{ Source = "src\components\ui\SocialLinksRow.tsx.txt"; Dest = "src\components\ui\SocialLinksRow.tsx" },
  @{ Source = "src\components\ui\UcapsaDetailModal.tsx.txt"; Dest = "src\components\ui\UcapsaDetailModal.tsx" },
  @{ Source = "src\app\(tabs)\_layout.tsx.txt"; Dest = "src\app\(tabs)\_layout.tsx" },
  @{ Source = "src\app\(tabs)\home.tsx.txt"; Dest = "src\app\(tabs)\home.tsx" },
  @{ Source = "src\app\(tabs)\announcements.tsx.txt"; Dest = "src\app\(tabs)\announcements.tsx" },
  @{ Source = "src\app\(tabs)\calendar.tsx.txt"; Dest = "src\app\(tabs)\calendar.tsx" },
  @{ Source = "src\app\(tabs)\membership.tsx.txt"; Dest = "src\app\(tabs)\membership.tsx" },
  @{ Source = "src\app\(tabs)\profile.tsx.txt"; Dest = "src\app\(tabs)\profile.tsx" },
  @{ Source = "src\app\admin\_layout.tsx.txt"; Dest = "src\app\admin\_layout.tsx" },
  @{ Source = "src\app\admin\announcements.tsx.txt"; Dest = "src\app\admin\announcements.tsx" },
  @{ Source = "src\app\admin\events.tsx.txt"; Dest = "src\app\admin\events.tsx" },
  @{ Source = "src\app\admin\users.tsx.txt"; Dest = "src\app\admin\users.tsx" }
)

foreach ($file in $files) {
  $sourcePath = Join-Path $payloadRoot $file.Source
  $destPath = Join-Path $projectRoot $file.Dest
  if (!(Test-Path $sourcePath)) {
    throw "Falta archivo payload: $sourcePath"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $destPath) | Out-Null
  Copy-Item $sourcePath $destPath -Force
}

Write-Host "Listo. V5 aplicado."
Write-Host "Ahora corre:"
Write-Host "npx tsc --noEmit"
Write-Host "npx expo config --type public"
Write-Host "npx expo start -c"
