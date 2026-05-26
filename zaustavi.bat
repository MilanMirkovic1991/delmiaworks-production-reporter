@echo off
chcp 65001 >nul
title Prijava proizvodnje - zaustavljanje
echo Zaustavljam backend (port 3000) i frontend (port 5173)...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>nul
  if not errorlevel 1 echo  - Zatvoren backend ^(PID %%a^)
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>nul
  if not errorlevel 1 echo  - Zatvoren frontend ^(PID %%a^)
)

echo.
echo Gotovo.
timeout /t 2 /nobreak >nul
exit /b 0
