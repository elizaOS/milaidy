param(
  [string]$ArtifactsDir = (Join-Path $PSScriptRoot "..\artifacts"),
  [int]$BackendPort = 2138,
  [int]$TimeoutSeconds = 240
)

# NOTE: $ErrorActionPreference MUST come after param() in PowerShell.
# Placing it before param() causes a ParseError because PowerShell treats
# the param() block as a regular function call when it is not the first
# statement, making typed parameters like [string]$x = expr invalid.
$ErrorActionPreference = "Stop"

# Milady writes its startup log to AppData\Roaming\Milady on Windows,
# NOT to $USERPROFILE\.config\Milady (which is a Unix-style path).
$startupLog        = Join-Path $env:APPDATA "Milady\milady-startup.log"
$selfExtractionRoot = Join-Path $env:LOCALAPPDATA "com.miladyai.milady\canary\self-extraction"
$tempExtractDir    = Join-Path $env:RUNNER_TEMP ("milady-windows-smoke-" + [Guid]::NewGuid().ToString("N"))

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Find-Launcher([string]$Root) {
  if (-not (Test-Path $Root)) { return $null }
  return Get-ChildItem -Path $Root -Recurse -File -Filter "launcher.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Stop-MiladyProcesses {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessName -in @("launcher", "bun") -or
      $_.ProcessName -like "Milady*" -or
      $_.ProcessName -like "Milady-Setup*"
    } |
    Stop-Process -Force
}

# Read the startup log to detect any port the backend actually bound to,
# in addition to the default port.  Electrobun apps sometimes choose a
# dynamic port and log it.
function Get-ObservedBackendPorts([int]$DefaultPort) {
  $ports = [System.Collections.Generic.List[int]]::new()
  $ports.Add($DefaultPort)

  if (-not (Test-Path $startupLog)) { return $ports.ToArray() }

  $logLines = Get-Content $startupLog -Tail 200 -ErrorAction SilentlyContinue
  foreach ($line in $logLines) {
    if (
      $line -match 'Runtime started -- agent: .* port: ([0-9]+), pid:' -or
      $line -match 'Server bound to dynamic port ([0-9]+)' -or
      $line -match 'Waiting for health endpoint at http://localhost:([0-9]+)/api/health'
    ) {
      $observedPort = [int]$Matches[1]
      if (-not $ports.Contains($observedPort)) { $ports.Add($observedPort) }
    }
  }

  return $ports.ToArray()
}

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

$resolvedArtifactsDir = (Resolve-Path $ArtifactsDir).Path
Write-Host "Artifacts dir: $resolvedArtifactsDir"

Stop-MiladyProcesses
$env:ELECTROBUN_CONSOLE = "1"

# Clear any stale self-extraction from a previous run.
if (Test-Path $selfExtractionRoot) {
  Remove-Item $selfExtractionRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# Locate launcher / installer
# ---------------------------------------------------------------------------

$launcher          = Find-Launcher $resolvedArtifactsDir
$installer         = $null
$installerProcess  = $null
$launcherProcess   = $null
$launcherStarted   = $false

if (-not $launcher) {
  # No pre-extracted launcher: look for a Setup exe or zip to self-extract.
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
  $installerProcess = Start-Process -FilePath $installer.FullName `
    -WorkingDirectory (Split-Path -Parent $installer.FullName) -PassThru
} else {
  Write-Host "Using launcher: $($launcher.FullName)"
  $launcherDir    = Split-Path -Parent $launcher.FullName
  $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
}

# ---------------------------------------------------------------------------
# Health-check loop
# ---------------------------------------------------------------------------

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$healthy  = $false

try {
  while ((Get-Date) -lt $deadline) {
    # If we ran an installer, wait for self-extraction to place launcher.exe
    # before attempting to start it ourselves.
    if (-not $launcher) {
      $launcher = Find-Launcher $selfExtractionRoot
      if ($launcher) {
        Write-Host "Found extracted launcher: $($launcher.FullName)"
      }
    }

    # Start the launcher once it exists and is not already running.
    if (
      $launcher -and
      -not (Get-Process -Name "launcher" -ErrorAction SilentlyContinue) -and
      (
        -not $launcherStarted -or
        ($launcherProcess -and $launcherProcess.HasExited)
      )
    ) {
      $launcherDir    = Split-Path -Parent $launcher.FullName
      $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
      $launcherStarted = $true
      Write-Host "Started extracted launcher: $($launcher.FullName)"
    }

    # Bail early if the startup log shows a terminal error.
    if (Test-Path $startupLog) {
      $recentLog = Get-Content $startupLog -Tail 200 -ErrorAction SilentlyContinue
      if ($recentLog -match 'Cannot find module|Child process exited with code|Failed to start:') {
        Write-Host "Recent startup log:"
        $recentLog
        throw "Windows packaged app reported a startup failure."
      }
    }

    # Check all ports the app may have bound to.
    foreach ($port in (Get-ObservedBackendPorts $BackendPort)) {
      try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
          $healthy = $true
          Write-Host "Backend health check passed on port $port."
          break
        }
      } catch {
        # Not ready yet — try next port / next iteration.
      }
    }

    if ($healthy) { break }
    Start-Sleep -Seconds 2
  }

  # ---------------------------------------------------------------------------
  # Report failure
  # ---------------------------------------------------------------------------

  if (-not $healthy) {
    if ($installerProcess) {
      Write-Host "Installer exited: $($installerProcess.HasExited)"
      if ($installerProcess.HasExited) { Write-Host "Installer exit code: $($installerProcess.ExitCode)" }
    }
    if ($launcherProcess) {
      Write-Host "Launcher exited: $($launcherProcess.HasExited)"
      if ($launcherProcess.HasExited) { Write-Host "Launcher exit code: $($launcherProcess.ExitCode)" }
    }
    if (Test-Path $startupLog) {
      Write-Host "Recent startup log ($startupLog):"
      Get-Content $startupLog -Tail 200
    } else {
      Write-Host "No startup log found at $startupLog"
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
