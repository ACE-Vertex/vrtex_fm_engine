[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot

Push-Location -LiteralPath $repositoryRoot
try {
    & pnpm run verify
    if ($LASTEXITCODE -ne 0) {
        throw "Verification failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
