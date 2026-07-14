@echo off
cd /d "%~dp0"
set PORT=3000
if not "%~1"=="" set PORT=%~1

where node >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  node server.mjs %PORT%
  exit /b
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  py -3 server.py %PORT%
  exit /b
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  python server.py %PORT%
  exit /b
)

echo Node.jsまたはPython 3が必要です。
pause
