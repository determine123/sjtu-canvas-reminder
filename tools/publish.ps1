param(
    [string]$Message = 'Update SJTU Canvas reminder',
    [string[]]$IncludePaths = @()
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$configPath = Join-Path $projectRoot '.publish-local.json'
$config = if (Test-Path -LiteralPath $configPath) { Get-Content -Raw -Encoding UTF8 -LiteralPath $configPath | ConvertFrom-Json } else { $null }
$nodeCommand = if ($config.node) { $config.node } else { 'node' }
$pythonCommand = if ($config.python) { $config.python } else { 'python' }
function Invoke-GitChecked([string[]]$GitArguments) {
    & git @GitArguments
    if ($LASTEXITCODE -ne 0) { throw "Git command failed: $($GitArguments[0])" }
}
Push-Location -LiteralPath $projectRoot
try {
    $remote = (& git remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0 -or $remote -notin @('https://github.com/determine123/sjtu-canvas-reminder.git','https://github.com/determine123/sjtu-canvas-reminder','git@github.com:determine123/sjtu-canvas-reminder.git')) { throw 'Unexpected Git origin; inspect it before publishing.' }
    if ((& git branch --show-current).Trim() -ne 'main') { throw 'Switch to the reviewed main branch before publishing.' }
    & $nodeCommand --test tests/core.test.cjs tests/worker.test.cjs tests/auto-sign.test.cjs tests/hints.test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed.' }
    & $pythonCommand tools/validate.py
    if ($LASTEXITCODE -ne 0) { throw 'Extension resource validation failed.' }
    Invoke-GitChecked -GitArguments @('fetch','origin')
    & git rev-parse --verify --quiet origin/main *> $null
    if ($LASTEXITCODE -eq 0) {
        $remoteAhead = [int](& git rev-list --count HEAD..origin/main)
        if ($remoteAhead -gt 0) { throw 'GitHub has newer commits. Reconcile them before publishing; no files were reset.' }
    }
    $sourceManifest = Get-Content -Raw -Encoding UTF8 manifest.json | ConvertFrom-Json
    foreach ($directory in $config.installDirectories) {
        $destination = [IO.Path]::GetFullPath($directory)
        if ($destination -eq $projectRoot) { continue }
        $installedManifest = Join-Path $destination 'manifest.json'
        if (-not (Test-Path -LiteralPath $installedManifest)) { throw "Installation manifest not found: $destination" }
        if ((Get-Content -Raw -Encoding UTF8 -LiteralPath $installedManifest | ConvertFrom-Json).name -ne $sourceManifest.name) { throw "Not an SJTU extension installation: $destination" }
        Get-ChildItem -LiteralPath $projectRoot -File | Where-Object { $_.Extension -in @('.js','.html','.css','.wav') -or $_.Name -in @('manifest.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md') } | Copy-Item -Destination $destination -Force
        foreach ($asset in @('icons','vendor')) { Copy-Item -LiteralPath (Join-Path $projectRoot $asset) -Destination $destination -Recurse -Force }
        Write-Output "Updated installed extension: $destination"
    }
    foreach ($relative in $IncludePaths) {
        $absolute = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
        if (-not $absolute.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'IncludePaths must stay inside this project.' }
        Invoke-GitChecked -GitArguments @('add','--',$relative)
    }
    Invoke-GitChecked -GitArguments @('add','--update')
    Invoke-GitChecked -GitArguments @('diff','--cached','--check')
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 1) { Invoke-GitChecked -GitArguments @('commit','-m',$Message) }
    elseif ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staged diff.' }
    Invoke-GitChecked -GitArguments @('push','-u','origin','main')
    $head = (& git rev-parse HEAD).Trim()
    $remoteHead = ((& git ls-remote origin refs/heads/main) -split '\s+')[0]
    if ($head -ne $remoteHead) { throw 'Remote HEAD differs from the local commit; verify GitHub.' }
    Write-Output "Published and verified: https://github.com/determine123/sjtu-canvas-reminder/commit/$head"
    Write-Output 'Reload the installed extension in edge://extensions to activate the copied files.'
} finally { Pop-Location }
