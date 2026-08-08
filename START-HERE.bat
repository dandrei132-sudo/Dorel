@echo off
setlocal enabledelayedexpansion
title Automaton
color 0B
cd /d "%~dp0"

echo.
echo   ================================================
echo    AUTOMATON - se pregateste si porneste singur
echo   ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [EROARE] Nu gasesc Node.js pe acest calculator.
    echo   Instaleaza-l de pe https://nodejs.org ^(butonul verde LTS^),
    echo   apoi fa din nou dublu-click pe acest fisier.
    pause
    exit /b 1
)
echo   [1/4] Node.js: gata

echo   [2/4] Pregatesc aplicatia ^(poate dura 1-2 minute, e normal^)...
call npm install >install.log 2>&1
if errorlevel 1 goto :preperr
call npm run build >>install.log 2>&1
if errorlevel 1 goto :preperr
echo   [2/4] Aplicatia: pregatita
goto :envcheck

:preperr
echo.
echo   [EROARE] Ceva nu a mers la pregatire.
echo   Deschide fisierul install.log din acest folder, copiaza tot
echo   ce scrie in el si trimite-mi mie exact acel text.
pause
exit /b 1

:envcheck
if not exist .env copy .env.example .env >nul
set "AK="
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "ANTHROPIC_API_KEY=" .env`) do set "AK=%%B"
if not "!AK!"=="" goto :haskey

echo   [3/4] Am nevoie de o cheie gratuita de la Anthropic.
echo.
echo   ================================================
echo    Ultimul lucru inainte de pornire
echo   ================================================
echo.
echo   Acum se deschid doua ferestre:
echo     - o pagina web, unde apesi butonul "Create Key" si o copiezi
echo     - un fisier de Notepad, unde o lipesti
echo.
echo   Pe randul care incepe cu ANTHROPIC_API_KEY= lipeste cheia
echo   chiar dupa semnul =, apoi Salveaza ^(Ctrl+S^) si inchide Notepad.
echo.
pause
start "" "https://console.anthropic.com/settings/keys"
notepad .env
echo.
echo   Gata cu cheia? Fa din nou dublu-click pe acest fisier
echo   ^(START-HERE.bat^) ca sa pornesti aplicatia.
pause
exit /b 0

:haskey
echo   [3/4] Cheia: gata
echo   [4/4] Pornesc aplicatia...
echo.
echo   ================================================
echo    NU inchide aceasta fereastra! Aplicatia ruleaza aici.
echo   ================================================
echo.
echo   Cand vezi mai jos o linie ca aceasta:
echo       Control panel: http://127.0.0.1:4173
echo   si o parola langa ea - deschide acel link intr-un
echo   browser normal ^(Chrome/Edge^) si intra cu parola aia.
echo.
node dist\index.js --run
pause
