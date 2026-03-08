param(
  [string]$ArtifactsDir = (Join-Path $PSScriptRoot "..\\artifacts"),
  [int]$BackendPort = 2138,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

$resolvedArtifactsDir = (Resolve-Path $ArtifactsDir).Path
$startupLog = Join-Path $env:USERPROFILE ".config\\Milady\\milady-startup.log"
$selfExtractionRoot = Join-Path $env:LOCALAPPDATA "com.miladyai.milady\\canary\\self-extraction"
$tempExtractDir = Join-Path $env:RUNNER_TEMP ("milady-windows-smoke-" + [Guid]::NewGuid().ToString("N"))

function Find-Launcher([string]$Root) {
  if (-not (Test-Path $Root)) {
    return $null
  }

  return Get-ChildItem -Path $Root -Recurse -File -Filter "launcher.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Stop-MiladyProcesses() {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessName -in @("launcher", "bun") -or
      $_.ProcessName -like "Milady-Setup*"
    } |
    Stop-Process -Force
}

Write-Host "Artifacts dir: $resolvedArtifactsDir"

Stop-MiladyProcesses
$env:ELECTROBUN_CONSOLE = "1"

if (Test-Path $selfExtractionRoot) {
  Remove-Item $selfExtractionRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$launcher = Find-Launcher $resolvedArtifactsDir
$installer = $null
$installerProcess = $null
$launcherProcess = $null

if (-not $launcher) {
  $installer = Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*Setup*.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $installer) {
    $installerZip = Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*Setup*.zip" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if (-not $installerZip) {
      throw "No launcher.exe, installer .exe, or installer .zip found under $resolvedArtifactsDir"
    }

    New-Item -ItemType Directory -Force -Path $tempExtractDir | Out-Null
    Expand-Archive -Path $installerZip.FullName -DestinationPath $tempExtractDir -Force
    $installer = Get-ChildItem -Path $tempExtractDir -Recurse -File -Filter "*Setup*.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
  }

  if (-not $installer) {
    throw "No installer executable found for Windows smoke test."
  }

  Write-Host "Using installer: $($installer.FullName)"
  $installerProcess = Start-Process -FilePath $installer.FullName -WorkingDirectory (Split-Path -Parent $installer.FullName) -PassThru
} else {
  Write-Host "Using launcher: $($launcher.FullName)"
  $launcherDir = Split-Path -Parent $launcher.FullName
  $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$healthy = $false

try {
  while ((Get-Date) -lt $deadline) {
    if (-not $launcher) {
      $launcher = Find-Launcher $selfExtractionRoot
      if ($launcher) {
        Write-Host "Found extracted launcher: $($launcher.FullName)"
      }
    }

    if (
      $launcher -and
      -not (Get-Process -Name "launcher" -ErrorAction SilentlyContinue) -and
      $installerProcess -and
      $installerProcess.HasExited
    ) {
      $launcherDir = Split-Path -Parent $launcher.FullName
      $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
      Write-Host "Started extracted launcher: $($launcher.FullName)"
    }

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
    if ($installerProcess) {
      Write-Host "Installer exited: $($installerProcess.HasExited)"
      if ($installerProcess.HasExited) {
        Write-Host "Installer exit code: $($installerProcess.ExitCode)"
      }
    }
    if ($launcherProcess) {
      Write-Host "Launcher exited: $($launcherProcess.HasExited)"
      if ($launcherProcess.HasExited) {
        Write-Host "Launcher exit code: $($launcherProcess.ExitCode)"
      }
    }
    if (Test-Path $startupLog) {
      Write-Host "Recent startup log:"
      Get-Content $startupLog -Tail 200
    }
    if (Test-Path $selfExtractionRoot) {
      Write-Host "Self-extraction contents:"
      Get-ChildItem -Path $selfExtractionRoot -Recurse -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
    }
    throw "Windows packaged app did not become healthy within $TimeoutSeconds seconds."
  }
} finally {
  Stop-MiladyProcesses
  if (Test-Path $tempExtractDir) {
    Remove-Item $tempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
