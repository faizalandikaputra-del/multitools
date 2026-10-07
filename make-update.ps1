# make-update.ps1 - builds update.json (the update feed read by the panel). Run it through Make-Update.bat.
#   - lists every file of this folder with its SHA-256,
#   - takes the new version from version.json (or from the first argument, which is also written back to version.json),
#   - takes the "What's new" text from changelog.txt (optional, plain text, one change per line).
# Then push everything (including update.json) to the PUBLIC GitHub repository named in version.json.
param([string]$Version = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding($false)

$vpath = Join-Path $root "version.json"
$vj = [IO.File]::ReadAllText($vpath, $utf8).TrimStart([char]0xFEFF) | ConvertFrom-Json
if ($Version -ne "") { $ver = $Version } else { $ver = [string]$vj.version }
if ($ver -notmatch '^\d+(\.\d+)*$') { throw "Invalid version '$ver' (use numbers and dots, e.g. 1.9.0)" }

# keep version.json in step (fresh installs read it); the panel keeps its own copy of repo/branch/feed
$vj.version = $ver
[IO.File]::WriteAllText($vpath, ($vj | ConvertTo-Json -Depth 5), $utf8)

$changelog = ""
$cl = Join-Path $root "changelog.txt"
if (Test-Path -LiteralPath $cl) { $changelog = ([IO.File]::ReadAllText($cl, $utf8)).Trim() }

$skip = @("update.json", "version.json", "Auto-Install.bat", "Make-Update.bat", "make-update.ps1", "changelog.txt", ".gitignore")
$prefix = $root.TrimEnd('\') + '\'
$list = New-Object System.Collections.ArrayList
Get-ChildItem -LiteralPath $root -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($prefix.Length).Replace('\', '/')
    if ($rel -like ".git/*") { return }
    if ($skip -contains $rel) { return }
    if ($_.Extension -eq ".zip" -or $_.Extension -eq ".mtold") { return }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLower()
    [void]$list.Add([ordered]@{ path = $rel; sha256 = $hash })
}

$feed = [ordered]@{ latest_version = $ver; changelog = $changelog; files = $list.ToArray() }
[IO.File]::WriteAllText((Join-Path $root "update.json"), ($feed | ConvertTo-Json -Depth 6), $utf8)
Write-Host ""
Write-Host "update.json ready: version $ver, $($list.Count) files."
Write-Host "Now push this folder (with update.json) to GitHub."
