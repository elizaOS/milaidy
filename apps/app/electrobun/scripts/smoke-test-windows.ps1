$ErrorActionPreference = "Stop"

param(
  [string]$ArtifactsDir = (Join-Path $PSScriptRoot "..\\artifacts"),
  [int]$BackendPort = 2138,
  [int]$TimeoutSeconds = 120
)

$resolvedArtifactsDir = (Resolve-Path $ArtifactsDir).Path
$startupLog = Join-Path $env:USERPROFILE ".config\\Milady\\milady-startup.log"

Write-Host "Artifacts dir: $resolvedArtifactsDir"

$launcher = Get-ChildItem -Path $resolvedArtifactsDir -Recurse -File -Filter "launcher.exe" |
  Select-Object -First 1

if (-not $launcher) {
  throw "No launcher.exe found under $resolvedArtifactsDir"
}

Write-Host "Using launcher: $($launcher.FullName)"

Get-Process -Name "launcher","bun" -ErrorAction SilentlyContinue | Stop-Process -Force

$proc = Start-Process -FilePath $launcher.FullName -PassThru
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$healthy = $false

try {
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/health" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        $healthy = $true
        Write-Host "Backend health check passed on port $BackendPort."
        break
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  if (-not $healthy) {
    Write-Host "Launcher exited: $($proc.HasExited)"
    if ($proc.HasExited) {
      Write-Host "Launcher exit code: $($proc.ExitCode)"
    }
    if (Test-Path $startupLog) {
      Write-Host "Recent startup log:"
      Get-Content $startupLog -Tail 200
    }
    throw "Windows packaged app did not become healthy within $TimeoutSeconds seconds."
  }
} finally {
  Get-Process -Name "launcher","bun" -ErrorAction SilentlyContinue | Stop-Process -Force
}
