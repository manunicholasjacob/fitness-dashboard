@echo off
REM Daily sync wrapper for Task Scheduler.
REM
REM A wrapper rather than a long /tr string: schtasks mangles embedded quotes,
REM redirection and && , which produced a task that failed instantly with an
REM empty log. A .cmd file has none of those quoting problems and can be run
REM by hand to reproduce exactly what the scheduler does.

setlocal
set "REPO=%~dp0.."
set "LOGDIR=%LOCALAPPDATA%\fitness-dashboard-sync"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

cd /d "%REPO%" || exit /b 1

echo. >> "%LOGDIR%\sync.log"
echo ==== %DATE% %TIME% ==== >> "%LOGDIR%\sync.log"
python sync\run_sync.py all >> "%LOGDIR%\sync.log" 2>&1
set "RC=%ERRORLEVEL%"
echo exit code %RC% >> "%LOGDIR%\sync.log"

REM Keep the log from growing without bound.
for %%A in ("%LOGDIR%\sync.log") do if %%~zA GTR 2000000 (
  move /y "%LOGDIR%\sync.log" "%LOGDIR%\sync.log.old" >nul
)

exit /b %RC%
