# Launch T3 Code dev modes without the environment traps that make manual
# launches fail silently:
#   1. Node must be >= 24. Node 22 + --experimental-strip-types runs the
#      dev-runner but exits 0 with zero output (Effect CLI no-op).
#   2. node_modules\.bin must be on PATH or `vp run ...` fails with spawn ENOENT.
#   3. The repo runs plain .ts scripts for everything that matters, so the
#      interpreter choice is the whole game.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\dev-launch.ps1            # desktop app (default)
#   powershell -ExecutionPolicy Bypass -File scripts\dev-launch.ps1 web        # browser dev stack
#   powershell -ExecutionPolicy Bypass -File scripts\dev-launch.ps1 server     # server only
#   ... -Mode desktop -HomeDir C:\path\to\state -Share -DryRun -Background

param(
  [ValidateSet("desktop", "web", "server")] [string]$Mode = "desktop",
  [string]$HomeDir = "",
  [switch]$Share,
  [switch]$DryRun,
  # Run detached with logs in %TEMP%\opencode\t3-dev-<mode>.log instead of in
  # this console. Useful for agents; humans usually want -Background:$false.
  [switch]$Background
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-NodeExe {
  # Prefer fnm-installed node 24+ (this machine runs node 22 on default PATH).
  $candidates = @()
  $fnmDir = Join-Path $env:APPDATA "fnm\node-versions"
  if (Test-Path $fnmDir) {
    $candidates += Get-ChildItem $fnmDir -Directory -Filter "v24*" -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName "installation\node.exe" }
  }
  $candidates += $null # sentinel: fall back to PATH node

  foreach ($candidate in $candidates) {
    if ($null -eq $candidate) { return "node" }
    if (Test-Path $candidate) { return $candidate }
  }
}

$nodeExe = Get-NodeExe
$nodeVersion = [version](& $nodeExe -v 2>$null | ForEach-Object { $_.TrimStart("v") })
if ($nodeVersion.Major -lt 24) {
  Write-Error @"
Node >= 24 is required (repo engines: ^24.13.1). Found $nodeVersion.
On Node 22 the dev-runner exits 0 with no output (silent no-op). Install Node 24
(e.g. via fnm) or put it first on PATH, then retry.
"@
}

if ($nodeExe -eq "node") {
  # Explicit .ts running still needs the type-stripping opt-in on some versions.
  $env:NODE_OPTIONS = if ($env:NODE_OPTIONS) { "$env:NODE_OPTIONS --experimental-strip-types" } else { "--experimental-strip-types" }
}

if (-not (Test-Path (Join-Path $repoRoot "node_modules\.bin"))) {
  Write-Error "node_modules is missing. Run 'pnpm install' in $repoRoot first."
}

$env:PATH = "{0};{1};{2}" -f (Join-Path $repoRoot "node_modules\.bin"), (Split-Path -Parent $nodeExe), $env:PATH

$modeArg = @{ desktop = "dev:desktop"; web = "dev"; server = "dev:server" }[$Mode]
$nodeArgs = @("scripts/dev-runner.ts", $modeArg)
if ($HomeDir) { $nodeArgs += @("--home-dir", $HomeDir) }
if ($DryRun) { $nodeArgs += "--dry-run" }
if ($Share) { $nodeArgs += "--share" }

$logFile = Join-Path $env:TEMP "opencode\t3-dev-$Mode.log"
$errFile = Join-Path $env:TEMP "opencode\t3-dev-$Mode.err.log"

if ($Background) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null
  Remove-Item $logFile, $errFile -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath $nodeExe -ArgumentList $nodeArgs `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $logFile -RedirectStandardError $errFile `
    -WindowStyle Hidden -PassThru
  Write-Host "dev:desktop stack starting detached (pid $($proc.Id))."
  Write-Host "  log:  $logFile"
  Write-Host "  err:  $errFile"
} else {
  Push-Location $repoRoot
  try { & $nodeExe @nodeArgs } finally { Pop-Location }
}
