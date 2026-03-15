#Requires -Version 5.1
<#
.SYNOPSIS
    milAIdy installer for Windows PowerShell.

.DESCRIPTION
    Checks for Node.js >= 22.12.0, installs it if needed, then installs
    milady globally via npm or bun.

    Run with:
      irm https://milady-ai.github.io/milady/install.ps1 | iex

    Or save and run:
      Invoke-WebRequest -Uri https://milady-ai.github.io/milady/install.ps1 -OutFile install.ps1
      .\install.ps1

.PARAMETER SkipSetup
    Skip the post-install `milady setup` step.

.PARAMETER UseBun
    Prefer bun over npm for installation.

.PARAMETER Version
    Install a specific version (default: latest).

.PARAMETER NonInteractive
    Skip all prompts (assume yes).

.EXAMPLE
    irm https://milady-ai.github.io/milady/install.ps1 | iex
#>

[CmdletBinding()]
param(
    [switch]$SkipSetup,
    [switch]$UseBun,
    [string]$Version = "latest",
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Info    { param([string]$Msg) Write-Host "  i  $Msg" -ForegroundColor Blue }
function Write-Ok      { param([string]$Msg) Write-Host "  +  $Msg" -ForegroundColor Green }
function Write-Warn    { param([string]$Msg) Write-Host "  !  $Msg" -ForegroundColor Yellow }
function Write-Err     { param([string]$Msg) Write-Host "  x  $Msg" -ForegroundColor Red }
function Write-Step    { param([string]$Msg) Write-Host "`n  > $Msg" -ForegroundColor Cyan }

function Test-CommandExists {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Compare-SemVer {
    # Returns $true if $Current >= $Required
    param([string]$Current, [string]$Required)

    # Strip leading v and any pre-release suffix
    $Current  = ($Current  -replace '^v', '') -replace '-.*$', ''
    $Required = ($Required -replace '^v', '') -replace '-.*$', ''

    $c = $Current.Split('.')  | ForEach-Object { [int]$_ }
    $r = $Required.Split('.') | ForEach-Object { [int]$_ }

    for ($i = 0; $i -lt 3; $i++) {
        $cv = if ($i -lt $c.Count) { $c[$i] } else { 0 }
        $rv = if ($i -lt $r.Count) { $r[$i] } else { 0 }
        if ($cv -gt $rv) { return $true  }
        if ($cv -lt $rv) { return $false }
    }
    return $true
}

function Confirm-Prompt {
    param([string]$Question, [bool]$DefaultYes = $true)
    if ($NonInteractive) { return $DefaultYes }

    $suffix = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
    $answer = Read-Host "  $Question $suffix"
    if ([string]::IsNullOrWhiteSpace($answer)) {
        return $DefaultYes
    }
    return $answer -match '^[Yy]'
}

# ── Banner ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  +--------------------------------------+" -ForegroundColor Cyan
Write-Host "  |       milAIdy installer              |" -ForegroundColor Cyan
Write-Host "  |  cute agents for the acceleration    |" -ForegroundColor Cyan
Write-Host "  +--------------------------------------+" -ForegroundColor Cyan
Write-Host ""

$RequiredNodeVersion = "22.12.0"
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
Write-Info "System: Windows ($arch)"

# ── Step 1: Check Node.js ───────────────────────────────────────────────────

Write-Step "Checking Node.js"

$nodeOk = $false
if (Test-CommandExists "node") {
    $nodeVersion = (node --version 2>$null) -replace '^v', ''
    if (Compare-SemVer -Current $nodeVersion -Required $RequiredNodeVersion) {
        Write-Ok "Node.js v$nodeVersion (>= $RequiredNodeVersion required)"
        $nodeOk = $true
    } else {
        Write-Warn "Node.js v$nodeVersion found, but >= $RequiredNodeVersion is required"
    }
} else {
    Write-Warn "Node.js not found"
}

if (-not $nodeOk) {
    Write-Step "Installing Node.js >= $RequiredNodeVersion"

    $installed = $false

    # 1. fnm
    if (Test-CommandExists "fnm") {
        Write-Info "Installing Node.js via fnm..."
        fnm install $RequiredNodeVersion
        fnm use $RequiredNodeVersion
        # Refresh PATH
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + $env:PATH
        Write-Ok "Node.js installed via fnm"
        $installed = $true
    }

    # 2. nvm-windows
    if (-not $installed -and (Test-CommandExists "nvm")) {
        Write-Info "Installing Node.js via nvm-windows..."
        nvm install $RequiredNodeVersion
        nvm use $RequiredNodeVersion
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + $env:PATH
        Write-Ok "Node.js installed via nvm-windows"
        $installed = $true
    }

    # 3. winget
    if (-not $installed -and (Test-CommandExists "winget")) {
        Write-Info "Installing Node.js via winget..."
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        # Refresh PATH from registry
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                     [System.Environment]::GetEnvironmentVariable("PATH", "User")
        Write-Ok "Node.js installed via winget"
        $installed = $true
    }

    # 4. Chocolatey
    if (-not $installed -and (Test-CommandExists "choco")) {
        Write-Info "Installing Node.js via Chocolatey..."
        choco install nodejs-lts -y
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                     [System.Environment]::GetEnvironmentVariable("PATH", "User")
        Write-Ok "Node.js installed via Chocolatey"
        $installed = $true
    }

    # 5. Scoop
    if (-not $installed -and (Test-CommandExists "scoop")) {
        Write-Info "Installing Node.js via Scoop..."
        scoop install nodejs-lts
        Write-Ok "Node.js installed via Scoop"
        $installed = $true
    }

    # 6. Direct download
    if (-not $installed) {
        if (Confirm-Prompt "No package manager found. Download Node.js installer from nodejs.org?") {
            $nodeArch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
            $msiUrl = "https://nodejs.org/dist/v${RequiredNodeVersion}/node-v${RequiredNodeVersion}-${nodeArch}.msi"
            $msiPath = Join-Path $env:TEMP "node-v${RequiredNodeVersion}-${nodeArch}.msi"

            Write-Info "Downloading Node.js installer..."
            Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing

            Write-Info "Running installer (may require elevation)..."
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn" -Wait -Verb RunAs

            # Refresh PATH
            $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                         [System.Environment]::GetEnvironmentVariable("PATH", "User")

            Remove-Item $msiPath -ErrorAction SilentlyContinue
            Write-Ok "Node.js installed from nodejs.org"
            $installed = $true
        }
    }

    if (-not $installed) {
        Write-Err "Could not install Node.js automatically."
        Write-Err "Please install Node.js >= $RequiredNodeVersion from https://nodejs.org"
        exit 1
    }

    # Verify
    if (-not (Test-CommandExists "node")) {
        Write-Err "Node.js still not found on PATH after installation."
        Write-Err "Please restart your terminal and re-run this script."
        exit 1
    }

    $nodeVersion = (node --version 2>$null) -replace '^v', ''
    if (-not (Compare-SemVer -Current $nodeVersion -Required $RequiredNodeVersion)) {
        Write-Err "Node.js v$nodeVersion is still below $RequiredNodeVersion."
        Write-Err "Please update manually: https://nodejs.org"
        exit 1
    }
    Write-Ok "Node.js v$nodeVersion"
}

# ── Step 2: Check package manager ───────────────────────────────────────────

Write-Step "Checking package manager"

$pm = $null

if ($UseBun -and (Test-CommandExists "bun")) {
    $bunVer = bun --version 2>$null
    Write-Ok "bun v$bunVer"
    $pm = "bun"
}

if (-not $pm -and (Test-CommandExists "npm")) {
    $npmVer = npm --version 2>$null
    Write-Ok "npm v$npmVer"
    $pm = "npm"
}

if (-not $pm -and (Test-CommandExists "bun")) {
    $bunVer = bun --version 2>$null
    Write-Ok "bun v$bunVer"
    $pm = "bun"
}

if (-not $pm) {
    Write-Err "No package manager found (npm or bun required)."
    Write-Err "npm should have been installed with Node.js. Try restarting your terminal."
    exit 1
}

# ── Step 3: Install milady ─────────────────────────────────────────────────

Write-Step "Installing milady"

$pkg = if ($Version -ne "latest") { "miladyai@$Version" } else { "miladyai" }

# Check if already installed
if (Test-CommandExists "milady") {
    $currentVer = (milady --version 2>$null | Select-Object -Last 1).Trim()
    if ($Version -eq "latest" -or $currentVer -eq $Version) {
        Write-Ok "milady $currentVer already installed"
    } else {
        Write-Info "Upgrading milady $currentVer -> $Version"
        if ($pm -eq "npm") { npm install -g $pkg }
        else               { bun install -g $pkg }
    }
} else {
    Write-Info "Running: $pm install -g $pkg"
    if ($pm -eq "npm") { npm install -g $pkg }
    else               { bun install -g $pkg }

    # Refresh PATH and verify
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + $env:PATH

    if (Test-CommandExists "milady") {
        $installedVer = (milady --version 2>$null | Select-Object -Last 1).Trim()
        Write-Ok "milady $installedVer installed"
    } else {
        Write-Err "milady command not found after installation."
        Write-Err "The npm global bin directory may not be on your PATH."
        Write-Err "Try: npm config get prefix  (then add that path\bin to PATH)"
        exit 1
    }
}

# ── Step 4: Setup ───────────────────────────────────────────────────────────

if ($SkipSetup -or $env:MILADY_SKIP_SETUP -eq "1") {
    Write-Info "Skipping setup (-SkipSetup)"
} else {
    Write-Step "Initializing milady workspace"
    milady setup
}

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ======================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  ======================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Get started:"
Write-Host "    milady start        " -ForegroundColor Cyan -NoNewline; Write-Host "Start the agent runtime"
Write-Host "    milady setup        " -ForegroundColor Cyan -NoNewline; Write-Host "Re-run workspace setup"
Write-Host "    milady configure    " -ForegroundColor Cyan -NoNewline; Write-Host "Configuration guidance"
Write-Host "    milady --help       " -ForegroundColor Cyan -NoNewline; Write-Host "Show all commands"
Write-Host ""
Write-Host "  Docs: https://docs.milady.ai" -ForegroundColor Blue
Write-Host ""
