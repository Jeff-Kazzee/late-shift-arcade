[CmdletBinding(DefaultParameterSetName = 'Audit')]
param(
    [Parameter(ParameterSetName = 'Audit')]
    [switch]$Audit,

    [Parameter(Mandatory = $true, ParameterSetName = 'Close')]
    [string]$Path,

    [Parameter(ParameterSetName = 'Close')]
    [string]$Base = 'dev'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'Run this script from inside the Late Shift Arcade repository.'
}

$records = @()
$current = $null
foreach ($line in (& git worktree list --porcelain)) {
    if ($line -match '^worktree (.+)$') {
        if ($null -ne $current) { $records += [pscustomobject]$current }
        $current = @{ Path = $Matches[1]; Branch = ''; Head = ''; Locked = $false }
        continue
    }
    if ($null -eq $current) { continue }
    if ($line -match '^HEAD (.+)$') { $current.Head = $Matches[1]; continue }
    if ($line -match '^branch refs/heads/(.+)$') { $current.Branch = $Matches[1]; continue }
    if ($line -match '^locked') { $current.Locked = $true; continue }
}
if ($null -ne $current) { $records += [pscustomobject]$current }

if ($PSCmdlet.ParameterSetName -eq 'Audit') {
    foreach ($record in $records) {
        $dirty = @(& git -C $record.Path status --porcelain)
        $merged = $false
        if ($record.Branch) {
            & git merge-base --is-ancestor $record.Branch dev 2>$null
            $merged = ($LASTEXITCODE -eq 0)
        }
        [pscustomobject]@{
            Path = $record.Path
            Branch = $record.Branch
            Head = $record.Head
            Dirty = ($dirty.Count -gt 0)
            Locked = $record.Locked
            MergedToDev = $merged
        }
    }
    exit 0
}

$resolvedTarget = (Resolve-Path -LiteralPath $Path).Path
$target = $records | Where-Object {
    [System.StringComparer]::OrdinalIgnoreCase.Equals(
        [System.IO.Path]::GetFullPath($_.Path),
        [System.IO.Path]::GetFullPath($resolvedTarget)
    )
}

if ($null -eq $target) { throw "The target is not a registered Git worktree: $resolvedTarget" }
if ([System.StringComparer]::OrdinalIgnoreCase.Equals(
    [System.IO.Path]::GetFullPath($repoRoot),
    [System.IO.Path]::GetFullPath($resolvedTarget)
)) { throw 'Refusing to remove the main worktree.' }
if ($target.Locked) { throw "Refusing to remove a locked worktree: $resolvedTarget" }
if (-not $target.Branch) { throw "Refusing to remove a detached worktree without an explicit branch: $resolvedTarget" }

$dirty = @(& git -C $resolvedTarget status --porcelain)
if ($dirty.Count -gt 0) { throw "Refusing to remove a dirty worktree. Bank or park its work first: $resolvedTarget" }

& git merge-base --is-ancestor $target.Branch $Base
if ($LASTEXITCODE -ne 0) { throw "Refusing to remove an unmerged branch '$($target.Branch)' from '$resolvedTarget'." }

& git worktree remove -- $resolvedTarget
if ($LASTEXITCODE -ne 0) { throw "git worktree remove failed for $resolvedTarget" }
& git branch -d $target.Branch
if ($LASTEXITCODE -ne 0) { throw "Worktree was removed, but local branch cleanup failed: $($target.Branch)" }
& git worktree prune
if ($LASTEXITCODE -ne 0) { throw 'git worktree prune failed.' }

Write-Output "Closed merged worktree '$resolvedTarget' and deleted local branch '$($target.Branch)'."