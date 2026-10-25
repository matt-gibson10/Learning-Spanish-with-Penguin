@echo off
rem Learning Spanish with Penguin: start the local server on port 8300 and open http://localhost:8300.
rem First run creates .venv (Python 3.13) and installs requirements.txt. Close this window to stop.
rem Optional AI writing coach: set ANTHROPIC_API_KEY (and optionally COACH_MODEL) before running.
setlocal EnableDelayedExpansion
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creating .venv with Python 3.13 ...
  py -3.13 -m venv .venv
  if errorlevel 1 (
    echo Could not create .venv. Install Python 3.13 from python.org, then run start.bat again.
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo pip install failed.
    pause
    exit /b 1
  )
)
rem Edge has the natural Mexican voices (Dalia/Jorge) built in, so prefer it; otherwise the default browser.
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
rem Already running (clicked twice)? Just open the page.
netstat -ano | findstr /r /c:":8300 .*LISTENING" >nul
if not errorlevel 1 (
  if defined BROWSER (start "" "!BROWSER!" http://localhost:8300) else (start "" http://localhost:8300)
  exit /b 0
)
rem Rebuild the course from content\*.json if the build script is present (fast, idempotent).
if exist "scripts\build_course.py" ".venv\Scripts\python.exe" scripts\build_course.py --quiet
rem Open the browser once the server has had a few seconds to start (ping = portable sleep).
if defined BROWSER (
  start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start "" "!BROWSER!" http://localhost:8300"
) else (
  start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:8300"
)
".venv\Scripts\python.exe" -m uvicorn server.app:app --host 127.0.0.1 --port 8300
pause
