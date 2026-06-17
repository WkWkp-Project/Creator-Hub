@echo off
REM Build the standalone Creator Hub .exe (Windows).
REM Output: backend\dist\CreatorHub.exe  (double-click to run; no Python needed)
cd /d "%~dp0backend"
".venv\Scripts\pyinstaller.exe" --noconfirm --onefile --name CreatorHub ^
  --add-data "..\frontend;frontend" ^
  --collect-submodules uvicorn ^
  --collect-submodules app ^
  --collect-all rapidfuzz ^
  --hidden-import multipart ^
  desktop_app.py
echo.
echo Done. The program is at: backend\dist\CreatorHub.exe
pause
