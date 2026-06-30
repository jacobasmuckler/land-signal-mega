param(
  [ValidateRange(5, 1440)]
  [int]$IntervalMinutes = 15
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$taskName = 'Charlotte Land Scanner'

$action = New-ScheduledTaskAction `
  -Execute $npm `
  -Argument 'run scan' `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Scans Gmail for 20+ acre Charlotte-area land opportunities.' `
  -Force | Out-Null

Write-Host "Installed '$taskName' to run every $IntervalMinutes minutes."
