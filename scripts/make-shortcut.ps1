# Create the "Pedro Visualizer" Desktop shortcut (Windows).
#
# The shortcut's target is explorer.exe with the launcher .cmd as its argument.
# Windows refuses to pin a shortcut that points straight at a .cmd/.bat, but it
# will happily pin one that points at explorer.exe -- and Explorer just hands
# the .cmd path to its default handler, which runs it.
#
# Called by start-visualizer.cmd; not meant to be run by hand.

param(
  [Parameter(Mandatory = $true)] [string] $CmdPath,
  [Parameter(Mandatory = $true)] [string] $IconPath,
  [Parameter(Mandatory = $true)] [string] $LinkPath
)

$ErrorActionPreference = 'Stop'
try {
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($LinkPath)
  $s.TargetPath       = Join-Path $env:SystemRoot 'explorer.exe'
  $s.Arguments        = '"' + $CmdPath + '"'
  $s.WorkingDirectory = Split-Path -Parent $CmdPath
  $s.IconLocation     = $IconPath + ',0'
  $s.Description       = 'Pedro Pathing Visualizer'
  $s.Save()
  Write-Output "shortcut written: $LinkPath"

  # Nudge Explorer to re-read icons (it caches old ones aggressively).
  try { & "$env:SystemRoot\system32\ie4uinit.exe" -show } catch {}
} catch {
  # Never fail the launcher over a shortcut.
  Write-Output "shortcut skipped: $($_.Exception.Message)"
  exit 0
}
