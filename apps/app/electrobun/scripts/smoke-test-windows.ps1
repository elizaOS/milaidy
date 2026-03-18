param(
  [string]$ArtifactsDir = (Join-Path $PSScriptRoot "..\\artifacts"),
  [string]$BuildDir = (Join-Path $PSScriptRoot "..\\build"),
  [int]$BackendPort = 2138,
  [int]$TimeoutSeconds = 240
)

$ErrorActionPreference = "Stop"

$resolvedArtifactsDir = (Resolve-Path $ArtifactsDir).Path
$resolvedBuildDir = $null
try {
  $resolvedBuildDir = (Resolve-Path $BuildDir).Path
} catch {
  $resolvedBuildDir = $null
}
# Milady writes its startup log to AppData\Roaming\Milady on Windows, not the
# Unix-style ~/.config/Milady path used on macOS/Linux.
$startupLog = Join-Path $env:APPDATA "Milady\\milady-startup.log"
$selfExtractionRoot = Join-Path $env:LOCALAPPDATA "com.miladyai.milady\\canary\\self-extraction"
$tempExtractDir = Join-Path $env:RUNNER_TEMP ("milady-windows-smoke-" + [Guid]::NewGuid().ToString("N"))
$persistLauncherDir = $env:MILADY_TEST_WINDOWS_LAUNCHER_DIR
$persistLauncherPathFile = $env:MILADY_TEST_WINDOWS_LAUNCHER_PATH_FILE

function Find-Launcher([string]$Root) {
  if (-not (Test-Path $Root)) {
    return $null
  }

  return Get-ChildItem -Path $Root -Recurse -File -Filter "launcher.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName |
    Select-Object -First 1
}

function Expand-PackagedTarball([string]$ArchivePath, [string]$DestinationPath) {
  $tarCommand = if (Test-Path "C:\\Windows\\System32\\tar.exe") {
    "C:\\Windows\\System32\\tar.exe"
  } else {
    "tar"
  }

  New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
  & $tarCommand -xf $ArchivePath -C $DestinationPath
}

function Write-ReusableLauncherPath([System.IO.FileInfo]$Launcher, [string]$TemporaryRoot) {
  if (-not $Launcher -or [string]::IsNullOrWhiteSpace($persistLauncherPathFile)) {
    return $Launcher
  }

  $launcherPath = $Launcher.FullName
  if (
    -not [string]::IsNullOrWhiteSpace($TemporaryRoot) -and
    $launcherPath.StartsWith($TemporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    $stageDir = if ([string]::IsNullOrWhiteSpace($persistLauncherDir)) {
      Join-Path $env:RUNNER_TEMP "milady-windows-ui-launcher"
    } else {
      $persistLauncherDir
    }

    $appRoot = Split-Path -Parent (Split-Path -Parent $launcherPath)
    Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
    Copy-Item -Path (Join-Path $appRoot "*") -Destination $stageDir -Recurse -Force
    $launcherPath = Join-Path $stageDir "bin\\launcher.exe"
  }

  $pathFileParent = Split-Path -Parent $persistLauncherPathFile
  if ($pathFileParent) {
    New-Item -ItemType Directory -Force -Path $pathFileParent | Out-Null
  }
  Set-Content -Path $persistLauncherPathFile -Value $launcherPath -Encoding utf8
  return Get-Item $launcherPath
}

function Stop-MiladyProcesses() {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessName -in @("launcher", "bun") -or
      $_.ProcessName -like "Milady*" -or
      $_.ProcessName -like "Milady-Setup*"
    } |
    Stop-Process -Force
}

function Get-ObservedBackendPorts([int]$DefaultPort) {
  $ports = [System.Collections.Generic.List[int]]::new()
  $ports.Add($DefaultPort)

  if (-not (Test-Path $startupLog)) {
    return $ports.ToArray()
  }

  $logLines = Get-Content $startupLog -Tail 200 -ErrorAction SilentlyContinue
  foreach ($line in $logLines) {
    if (
      $line -match 'Runtime started -- agent: .* port: ([0-9]+), pid:' -or
      $line -match 'Server bound to dynamic port ([0-9]+)' -or
      $line -match 'Waiting for health endpoint at http://(?:localhost|127\.0\.0\.1):([0-9]+)/api/health'
    ) {
      $observedPort = [int]$Matches[1]
      if (-not $ports.Contains($observedPort)) {
        $ports.Add($observedPort)
      }
    }
  }

  return $ports.ToArray()
}

Write-Host "Artifacts dir: $resolvedArtifactsDir"
if ($resolvedBuildDir) {
  Write-Host "Build dir: $resolvedBuildDir"
}

Stop-MiladyProcesses
$env:ELECTROBUN_CONSOLE = "1"

if (Test-Path $selfExtractionRoot) {
  Remove-Item $selfExtractionRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$launcher = Find-Launcher $resolvedArtifactsDir
$launcherSource = $null
$packagedTarball = $null
$installer = $null
$installerProcess = $null
$launcherProcess = $null
$launcherStarted = $false

if ($resolvedBuildDir) {
  $launcher = Find-Launcher $resolvedBuildDir
  if ($launcher) {
    $launcherSource = "build"
  }
}

if (-not $launcher) {
  $launcher = Find-Launcher $resolvedArtifactsDir
  if ($launcher) {
    $launcherSource = "artifacts"
  }
}

if (-not $launcher) {
  $packagedTarball = Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*.tar.zst" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($packagedTarball) {
    Write-Host "Using packaged tarball: $($packagedTarball.FullName)"
    try {
      Expand-PackagedTarball -ArchivePath $packagedTarball.FullName -DestinationPath $tempExtractDir
      $launcher = Find-Launcher $tempExtractDir
      if (-not $launcher) {
        Write-Warning "Packaged tarball extracted but no launcher.exe was found. Falling back to installer path."
      } else {
        $launcherSource = "packaged tarball"
      }
    } catch {
      Write-Warning "Failed to extract packaged tarball: $($_.Exception.Message)"
      Write-Warning "Falling back to installer path."
    }
  }

  if ($launcher) {
    $launcher = Write-ReusableLauncherPath -Launcher $launcher -TemporaryRoot $tempExtractDir
    Write-Host "Using $launcherSource launcher: $($launcher.FullName)"
    $launcherDir = Split-Path -Parent $launcher.FullName
    $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
    $launcherStarted = $true
  } else {
    $installer = Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*Setup*.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1

    if (-not $installer) {
      $installerZip = Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*Setup*.zip" -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if (-not $installerZip) {
        throw "No launcher.exe, packaged .tar.zst, installer .exe, or installer .zip found under $resolvedArtifactsDir"
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
  }
} else {
  $launcher = Write-ReusableLauncherPath -Launcher $launcher -TemporaryRoot $tempExtractDir
  Write-Host "Using $launcherSource launcher: $($launcher.FullName)"
  $launcherDir = Split-Path -Parent $launcher.FullName
  $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
  $launcherStarted = $true
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$healthy = $false

try {
  while ((Get-Date) -lt $deadline) {
    if (-not $launcher) {
      $launcher = Find-Launcher $selfExtractionRoot
      if ($launcher) {
        $launcher = Write-ReusableLauncherPath -Launcher $launcher -TemporaryRoot $null
        Write-Host "Found extracted launcher: $($launcher.FullName)"
      }
    }

    if (
      $launcher -and
      -not (Get-Process -Name "launcher" -ErrorAction SilentlyContinue) -and
      (
        -not $launcherStarted -or
        ($launcherProcess -and $launcherProcess.HasExited)
      )
    ) {
      $launcherDir = Split-Path -Parent $launcher.FullName
      $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
      $launcherStarted = $true
      Write-Host "Started extracted launcher: $($launcher.FullName)"
    }

    if (Test-Path $startupLog) {
      $recentLog = Get-Content $startupLog -Tail 200 -ErrorAction SilentlyContinue
      if ($recentLog -match 'Cannot find module|Child process exited with code|Failed to start:') {
        Write-Host "Recent startup log:"
        $recentLog
        throw "Windows packaged app reported a startup failure."
      }
    }

    foreach ($port in Get-ObservedBackendPorts $BackendPort) {
      try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
          $healthy = $true
          Write-Host "Backend health check passed on port $port."
          break
        }
      } catch {
        # Log the actual error periodically so we can diagnose connection issues
        $elapsed = [int]((Get-Date) - $deadline.AddSeconds(-$TimeoutSeconds)).TotalSeconds
        if ($elapsed % 30 -lt 3) {
          Write-Host "Health check attempt on port ${port} failed ($elapsed s): $($_.Exception.Message)"
        }
        # Fallback: try curl.exe which handles Windows networking differently
        try {
          $curlResult = & curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:${port}/api/health" --connect-timeout 2 2>$null
          if ($curlResult -eq "200") {
            $healthy = $true
            Write-Host "Backend health check passed on port $port (via curl)."
            break
          }
        } catch {}
      }
    }

    if ($healthy) {
      break
    }

    Start-Sleep -Seconds 2
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
