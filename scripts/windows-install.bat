@echo off
setlocal enabledelayedexpansion
title Automaton - instalare
color 0B

echo.
echo   ================================================
echo    AUTOMATON - se instaleaza si porneste singur
echo   ================================================
echo.
echo   Nu trebuie sa faci nimic altceva decat sa astepti
echo   si sa raspunzi la intrebari cand apar. Poate dura
echo   cateva minute.
echo.

set "NEED_RESTART=0"

where winget >nul 2>nul
if errorlevel 1 (
    echo   [EROARE] Acest calculator are nevoie de o actualizare Windows
    echo   ca sa poata instala programe automat.
    echo   Deschide Settings, cauta "Windows Update", instaleaza
    echo   actualizarile disponibile, apoi porneste din nou acest fisier.
    pause
    exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
    echo   [1/5] Instalez Git ^(o singura data, dureaza putin^)...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    set "NEED_RESTART=1"
) else (
    echo   [1/5] Git: deja instalat
)

where node >nul 2>nul
if errorlevel 1 (
    echo   [2/5] Instalez Node.js ^(o singura data, dureaza putin^)...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    set "NEED_RESTART=1"
) else (
    echo   [2/5] Node.js: deja instalat
)

if "%NEED_RESTART%"=="1" (
    echo.
    echo   ================================================
    echo    UN SINGUR PAS MAI AI DE FACUT ACUM:
    echo   ================================================
    echo.
    echo   1. Inchide COMPLET aceasta fereastra ^(X din coltul din dreapta sus^)
    echo   2. Cauta din nou fisierul de instalare si fa dublu-click pe el
    echo.
    echo   Asta e tot - de data asta va continua singur pana la capat,
    echo   fara sa te mai opreasca aici.
    echo.
    pause
    exit /b 0
)

echo   [3/5] Descarc / actualizez aplicatia...
cd /d "%USERPROFILE%"
if exist Dorel (
    cd Dorel
    git checkout claude/automaton-self-improving-ai-nlseal >nul 2>nul
    git pull origin claude/automaton-self-improving-ai-nlseal
) else (
    git clone https://github.com/dandrei132-sudo/Dorel.git
    if errorlevel 1 (
        echo.
        echo   [EROARE] Descarcarea nu a mers. Verifica ca esti conectat la
        echo   internet, apoi porneste din nou acest fisier.
        pause
        exit /b 1
    )
    cd Dorel
    git checkout claude/automaton-self-improving-ai-nlseal >nul 2>nul
)
echo   [3/5] Aplicatia: gata

echo   [4/5] Pregatesc aplicatia ^(poate dura 1-2 minute, e normal^)...
call npm install >install.log 2>&1
if errorlevel 1 goto :preperr
call npm run build >>install.log 2>&1
if errorlevel 1 goto :preperr
echo   [4/5] Aplicatia: pregatita
goto :envcheck

:preperr
echo.
echo   [EROARE] Ceva nu a mers la pregatirea aplicatiei.
echo   In folderul Dorel s-a creat un fisier "install.log" -
echo   deschide-l, copiaza tot ce scrie in el si trimite-mi mie.
pause
exit /b 1

:envcheck
if not exist .env copy .env.example .env >nul
set "AK="
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "ANTHROPIC_API_KEY=" .env`) do set "AK=%%B"
if not "!AK!"=="" goto :haskey

echo.
echo   ================================================
echo    [5/5] Ultimul lucru: o cheie gratuita de la Anthropic
echo   ================================================
echo.
echo   Acum se deschid doua ferestre:
echo     - o pagina web, unde apesi butonul "Create Key" si o copiezi
echo     - un fisier de Notepad, unde o lipesti
echo.
echo   In Notepad, pe randul care incepe cu ANTHROPIC_API_KEY=
echo   lipeste cheia chiar dupa semnul =, apoi Salveaza ^(Ctrl+S^)
echo   si inchide Notepad.
echo.
pause
start "" "https://console.anthropic.com/settings/keys"
notepad .env
echo.
echo   Gata cu cheia? Inchide aceasta fereastra si fa din nou
echo   dublu-click pe fisierul de instalare ca sa pornesti aplicatia.
pause
exit /b 0

:haskey
echo.
echo   ================================================
echo    Aplicatia porneste acum. NU inchide fereastra asta!
echo   ================================================
echo.
echo   Cand vezi mai jos o linie ca aceasta:
echo       Control panel: http://127.0.0.1:4173
echo   si o parola langa ea - deschide acel link intr-un
echo   browser normal ^(Chrome/Edge^) si intra cu parola aia.
echo.
node dist\index.js --run
pause
