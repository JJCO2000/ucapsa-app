param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$Stamp = (Get-Date -Format 'yyyyMMdd_HHmmss')
)

$ErrorActionPreference = 'Stop'
Set-Location $ProjectRoot
if (-not (Test-Path 'supabase\config.toml')) { throw 'Falta supabase/config.toml.' }

$npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue)
if (-not $npx) { $npx = (Get-Command npx -ErrorAction SilentlyContinue) }
if (-not $npx) { throw 'No encontre npx en PATH.' }

$audit = Join-Path $ProjectRoot 'supabase\sql\audit'
New-Item -ItemType Directory -Force -Path $audit | Out-Null
$types = Join-Path $ProjectRoot 'src\types\database.generated.ts'
$tmpTypes = Join-Path $env:TEMP "ucapsa_database_types_$Stamp.ts"
$typesErr = Join-Path $env:TEMP "ucapsa_database_types_$Stamp.err.txt"

function Run-Capture {
  param([string[]]$Arguments, [string]$OutputPath)
  $errorPath = "$OutputPath.stderr.txt"
  Remove-Item $OutputPath, $errorPath -Force -ErrorAction SilentlyContinue
  & $npx.Source @Arguments 1> $OutputPath 2> $errorPath
  $code = $LASTEXITCODE
  if (Test-Path $errorPath) {
    Get-Content $errorPath -ErrorAction SilentlyContinue | Add-Content $OutputPath -Encoding utf8
    Remove-Item $errorPath -Force -ErrorAction SilentlyContinue
  }
  return $code
}

Write-Host '[1/4] Generando tipos desde Supabase remoto...'
Remove-Item $tmpTypes, $typesErr -Force -ErrorAction SilentlyContinue
& $npx.Source supabase gen types --linked --schema public --lang typescript 1> $tmpTypes 2> $typesErr
$typesCode = $LASTEXITCODE
if ($typesCode -ne 0 -or -not (Test-Path $tmpTypes) -or (Get-Item $tmpTypes).Length -lt 1000) {
  $detail = if (Test-Path $typesErr) { (Get-Content $typesErr -Raw -ErrorAction SilentlyContinue) } else { '' }
  throw "No se pudieron generar tipos remotos (exit $typesCode). $detail"
}
Copy-Item $tmpTypes $types -Force
Copy-Item $tmpTypes (Join-Path $audit "database.types.generated_STEP9_$Stamp.ts") -Force
if (Test-Path $typesErr) {
  $errText = Get-Content $typesErr -Raw -ErrorAction SilentlyContinue
  if (-not [string]::IsNullOrWhiteSpace($errText)) {
    $errText | Out-File (Join-Path $audit "database_types_STEP9_$Stamp.stderr.txt") -Encoding utf8
  }
}
$typesHash = (Get-FileHash $types -Algorithm SHA256).Hash
Write-Host '[1/4] Tipos OK.' -ForegroundColor Green

$schemaStatus = 'SKIPPED_NO_DOCKER'
$schemaHash = ''
$schemaOut = ''
Write-Host '[2/4] Esquema public: dump local opcional...'
$docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $docker) { $docker = Get-Command docker -ErrorAction SilentlyContinue }
if ($docker) {
  & $docker.Source info *> $null
  if ($LASTEXITCODE -eq 0) {
    $schemaOut = Join-Path $audit "remote_public_schema_STEP9_$Stamp.sql"
    Remove-Item $schemaOut -Force -ErrorAction SilentlyContinue
    & $npx.Source supabase db dump --linked --schema public --file $schemaOut
    $schemaCode = $LASTEXITCODE
    if ($schemaCode -eq 0 -and (Test-Path $schemaOut) -and (Get-Item $schemaOut).Length -ge 1000) {
      $schemaStatus = 'OK'
      $schemaHash = (Get-FileHash $schemaOut -Algorithm SHA256).Hash
      Write-Host '[2/4] Esquema local OK.' -ForegroundColor Green
    } else {
      $schemaStatus = "FAILED_EXIT_$schemaCode"
      Write-Warning 'No se pudo generar el dump local. Los tipos siguen siendo validos; usa la captura remota versionada en supabase/sql/audit para revisar RLS, funciones, triggers e indices.'
    }
  } else {
    Write-Warning 'Docker no esta corriendo. Se omite el dump local; no es requisito para trabajar en UCAPSA.'
  }
} else {
  Write-Warning 'Docker no esta instalado. Se omite el dump local; no es requisito para trabajar en UCAPSA.'
}

Write-Host '[3/4] Historial de migraciones (diagnostico best effort)...'
$migrationOut = Join-Path $audit "migration_list_STEP9_$Stamp.txt"
$migrationCode = Run-Capture -Arguments @('supabase','migration','list','--linked') -OutputPath $migrationOut
if ($migrationCode -ne 0) { Write-Warning 'migration list no estuvo disponible; la salida quedo guardada.' }

Write-Host '[4/4] DB lint remoto (diagnostico best effort)...'
$lintOut = Join-Path $audit "database_lint_STEP9_$Stamp.txt"
$lintCode = Run-Capture -Arguments @('supabase','db','lint','--linked','--schema','public','--level','warning','--fail-on','none') -OutputPath $lintOut
if ($lintCode -ne 0) { Write-Warning 'db lint remoto no estuvo disponible; la salida quedo guardada.' }

$meta = @"
UCAPSA STEP 9 SOURCE OF TRUTH
Stamp: $Stamp
Generated types: OK
Types SHA256: $typesHash
Local public schema dump: $schemaStatus
Schema SHA256: $schemaHash
Migration list exit: $migrationCode
DB lint exit: $lintCode
No db push, db pull, db reset or migration repair executed.
Authoritative remote schema metadata is versioned separately in supabase/sql/audit and does not require Docker Desktop.
"@
$meta | Out-File -FilePath (Join-Path $audit "source_of_truth_STEP9_$Stamp.txt") -Encoding utf8

Write-Host ''
Write-Host 'SOURCE OF TRUTH TYPES: OK' -ForegroundColor Green
Write-Host $types
if ($schemaStatus -eq 'OK') { Write-Host $schemaOut }
