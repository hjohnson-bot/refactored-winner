<#
  Registers the MDG nightly refresh as a Windows Scheduled Task.
  Run once, in an ELEVATED PowerShell, on the always-on gateway host.

  Edit $JobPath / $RunAs / $At below, then:
      powershell -ExecutionPolicy Bypass -File .\install_task.ps1
#>

# --- CONFIG (edit) ----------------------------------------------------------
$TaskName = "MDG Dashboard Nightly Refresh"
$JobPath  = "C:\MDG\repo\mdg-powerbi\deploy\refresh_job.cmd"
$RunAs    = "MIDWEST\bi-refresh"     # service account (must have 'Log on as a batch job')
$At       = "03:30"                   # before the Power BI 04:00 scheduled refresh
# ---------------------------------------------------------------------------

if (-not (Test-Path $JobPath)) { throw "Job script not found: $JobPath" }

$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$JobPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

$cred = Get-Credential -UserName $RunAs -Message "Password for the refresh service account"

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -RunLevel Highest `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -Force

Write-Host "Registered '$TaskName' to run daily at $At as $RunAs."
Write-Host "Test now with:  Start-ScheduledTask -TaskName '$TaskName'  then check C:\MDG\logs\."
