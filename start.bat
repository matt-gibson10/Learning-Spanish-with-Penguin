@echo off
rem Learning Spanish with Penguin: start the local server on port 8300 and open http://localhost:8300.
rem First run creates .venv (Python 3.13) and installs requirements.txt. Close this window to stop.
rem Optional AI writing coach: set ANTHROPIC_API_KEY (and optionally COACH_MODEL) before running.
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
rem Rebuild the course from content\*.json if the build script is present (fast, idempotent).
if exist "scripts\build_course.py" ".venv\Scripts\python.exe" scripts\build_course.py --quiet
rem Open the browser once the server has had a few seconds to start (ping = portable sleep).
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:8300"
".venv\Scripts\python.exe" -m uvicorn server.app:app --host 127.0.0.1 --port 8300
pause
