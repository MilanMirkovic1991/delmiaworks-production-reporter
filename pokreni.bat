@echo off
chcp 65001 >nul
title Prijava proizvodnje
cd /d "%~dp0"

echo ===============================================
echo  Prijava proizvodnje - automatsko pokretanje
echo ===============================================
echo.

REM 1) Provera da li je Node instaliran
where node >nul 2>nul
if errorlevel 1 (
  echo [GRESKA] Node.js nije instaliran ili nije u PATH-u.
  echo Instaliraj sa: https://nodejs.org/  ^(verzija 20 ili novija^)
  pause
  exit /b 1
)

REM 2) Povuci najnoviji kod sa GitHub-a (samo fast-forward, bezbedno)
echo [1/4] Povlacim najnoviji kod sa GitHub-a...
git pull --ff-only 2>nul
if errorlevel 1 (
  echo  - git pull preskocen ^(nema veze sa GitHub-om ili ima lokalnih izmena^)
)
echo.

REM 3) Provera zavisnosti
if not exist "node_modules\" (
  echo [2/4] Prvi put - instaliram zavisnosti, ovo traje par minuta...
  call npm install
  if errorlevel 1 (
    echo [GRESKA] npm install nije uspeo.
    pause
    exit /b 1
  )
) else (
  echo [2/4] Zavisnosti vec instalirane, preskacem.
)
echo.

REM 3b) Provera da li je port 3001 zauzet
netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [UPOZORENJE] Port 3001 je vec zauzet ^(verovatno drugi node proces iz prethodne sesije ili druge aplikacije^).
  echo Backend ne moze da startuje na zauzetom portu - ulogovanje vraca 404.
  echo.
  echo Resenje: zatvori sve "BACKEND" prozore + sve "node.exe" procese koji nisu deo ove aplikacije,
  echo pa pokreni opet pokreni.bat. Alternativno: pokreni zaustavi.bat pa ovaj.
  echo.
  pause
  exit /b 1
)

REM 4) Pokreni backend u novom prozoru
echo [3/4] Pokrecem backend u novom prozoru...
start "DW Reporter - BACKEND (port 3001)" cmd /k "npm run dev:backend"
timeout /t 5 /nobreak >nul
echo.

REM 4b) Provera da li je backend zaista startovao
netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul
if errorlevel 1 (
  echo [UPOZORENJE] Backend se nije podigao na portu 3001 u ocekivanom vremenu.
  echo Pogledaj BACKEND prozor da vidis gresku. Cesti uzroci:
  echo  - npm install nije zavrsen / ima ESM problema
  echo  - port je zauzet od drugog node procesa
  echo  - greska u kodu blokira tsx watch
  echo.
  pause
  exit /b 1
)
echo  - backend OK na portu 3001
echo.

REM 5) Pokreni frontend u novom prozoru
echo [4/4] Pokrecem frontend u novom prozoru...
start "DW Reporter - FRONTEND (port 5174)" cmd /k "npm run dev:frontend"
timeout /t 8 /nobreak >nul
echo.

REM 6) Otvori browser
echo Otvaram browser na http://localhost:5174 ...
start "" http://localhost:5174

echo.
echo ===============================================
echo  Sve pokrenuto. Backend i frontend su u
echo  zasebnim prozorima - ostavi ih otvorene.
echo  Kad zelis da zatvoris aplikaciju, zatvori
echo  oba ta prozora (ili pokreni zaustavi.bat).
echo ===============================================
timeout /t 5 /nobreak >nul
exit /b 0
