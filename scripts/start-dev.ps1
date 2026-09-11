[CmdletBinding()]
param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

try {
    $Host.UI.RawUI.WindowTitle = "VRTEX FM Engine - Developer"
    Set-Location -LiteralPath $projectRoot

    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm was not found. Install Node.js and pnpm, then try again."
    }

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw "Rust/Cargo was not found. Install the Rust MSVC toolchain, then try again."
    }

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules\.pnpm"))) {
        Write-Host "Preparing dependencies for the first launch..." -ForegroundColor Cyan
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            throw "Dependency installation failed with exit code $LASTEXITCODE."
        }
    }

    if ($CheckOnly) {
        Write-Host "Developer launcher prerequisites: OK" -ForegroundColor Green
        return
    }

    Write-Host "Starting VRTEX FM Engine in desktop development mode..." -ForegroundColor Cyan
    Write-Host "Keep this window open while developing." -ForegroundColor DarkGray
    & pnpm run tauri dev
    if ($LASTEXITCODE -ne 0) {
        throw "Development launch failed with exit code $LASTEXITCODE."
    }
}
catch {
    Write-Host ""
    Write-Host "VRTEX FM Engine could not be started." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    Write-Host ""
    [void](Read-Host "Press Enter to close")
    exit 1
}
