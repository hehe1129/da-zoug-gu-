@echo off
cd /d "%~dp0"
echo Local preview: http://127.0.0.1:4173/
echo Press Ctrl+C to stop.
node preview.cjs
pause
