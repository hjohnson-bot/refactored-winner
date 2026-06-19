@echo off
REM ============================================================================
REM  MDG Executive Dashboard - nightly refresh job (Windows)
REM  Pull -> build -> VALIDATE -> promote CSVs to the Power BI landing folder.
REM  Schedule this with deploy\install_task.ps1 (runs ~03:30, before PBI 04:00).
REM
REM  Edit the five paths below for your host, then test by running it manually.
REM ============================================================================
setlocal EnableExtensions

REM --- CONFIG (edit these) ----------------------------------------------------
set "REPO=C:\MDG\repo\mdg-powerbi"
set "LANDING=C:\MDG\PowerBI\data"
set "BASH=C:\Program Files\Git\bin\bash.exe"
set "LOGDIR=C:\MDG\logs"
REM Set PULL_CMD to your data-pull command (Option 2A: a headless Claude Code run
REM that executes scripts\refresh.sh prompt and saves raw JSON to build\raw\).
REM Leave blank to skip the pull and only rebuild from whatever is in build\raw\.
set "PULL_CMD="
REM Set REPULL_CMD to a TOKEN-AWARE re-pull (called as: <cmd> <token>, where token
REM is jobs:<offset> | pl | cf | bs | ar | ap) so the self-healer can auto-correct
REM a single bad source. Leave blank to disable auto-heal (job still reports the
REM exact manual fix). See deploy\mock_repull.sh for the contract.
set "REPULL_CMD="
REM ---------------------------------------------------------------------------

REM timestamp (locale-independent) for the log file
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%i"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\refresh_%TS%.log"

echo [%TS%] MDG refresh starting > "%LOG%"
cd /d "%REPO%" || (echo REPO not found & exit /b 9)

echo [step] git pull >> "%LOG%"
git pull --ff-only >> "%LOG%" 2>&1

if defined PULL_CMD (
  echo [step] data pull >> "%LOG%"
  call %PULL_CMD% >> "%LOG%" 2>&1
  if errorlevel 1 ( echo [FAIL] data pull >> "%LOG%" & goto :fail )
) else (
  echo [skip] PULL_CMD not set - rebuilding from existing build\raw\ >> "%LOG%"
)

echo [step] self-healing build + validate + promote (refresh_safe.py) >> "%LOG%"
REM refresh_safe.py: build -> validate -> on failure DIAGNOSE + auto-fix + rebuild,
REM then promote CSVs to MDG_LANDING. Only fails (errorlevel 1) if it cannot heal,
REM and then it logs the exact manual fix. Set MDG_REPULL_CMD to your data-pull so
REM known issues (e.g. a dropped Knowify page) self-correct hands-free.
set "MDG_LANDING=%LANDING%"
if defined REPULL_CMD set "MDG_REPULL_CMD=%REPULL_CMD%"
python "%REPO%\scripts\refresh_safe.py" >> "%LOG%" 2>&1
if errorlevel 1 ( echo [FAIL] could not heal - NOT promoting; see exact fix in log >> "%LOG%" & goto :fail )

echo [DONE] refresh valid and promoted - Power BI scheduled refresh will pick up the new CSVs >> "%LOG%"
echo SUCCESS - see %LOG%
exit /b 0

:fail
echo [ABORTED] refresh failed - see %LOG%
REM Optional: email alert (configure a CLI mailer or PowerShell Send-MailMessage here)
exit /b 1
