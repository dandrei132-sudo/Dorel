@echo off
setlocal enabledelayedexpansion
title Automaton - Instalare si pornire
color 0B

echo ===================================================
echo   Automaton - instalare si pornire automata
echo ===================================================
echo.

rem --- Verifica winget (necesar pentru instalare automata Git/Node) ---
where winget >nul 2>nul
if errorlevel 1 (
    echo [!] Nu am gasit "winget" pe acest calculator.
    echo     Instaleaza manual Git (https://git-scm.com/download/win^)
    echo     si Node.js (https://nodejs.org^), apoi ruleaza din nou acest fisier.
    pause
    exit /b 1
)

rem --- Verifica / instaleaza Git ---
where git >nul 2>nul
if errorlevel 1 (
    echo [1/6] Git nu este instalat. Se instaleaza automat...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [!] Instalarea automata a Git a esuat. Instaleaza manual de pe https://git-scm.com/download/win
        pause
        exit /b 1
    )
    echo.
    echo [OK] Git a fost instalat. Trebuie sa inchid aceasta fereastra ca sistemul
    echo      sa recunoasca noua comanda. Deschide din nou acest fisier (dublu-click^)
    echo      ca sa continui instalarea.
    pause
    exit /b 0
)
echo [1/6] Git: OK

rem --- Verifica / instaleaza Node.js ---
where node >nul 2>nul
if errorlevel 1 (
    echo [2/6] Node.js nu este instalat. Se instaleaza automat...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [!] Instalarea automata a Node.js a esuat. Instaleaza manual de pe https://nodejs.org
        pause
        exit /b 1
    )
    echo.
    echo [OK] Node.js a fost instalat. Trebuie sa inchid aceasta fereastra ca sistemul
    echo      sa recunoasca noua comanda. Deschide din nou acest fisier (dublu-click^)
    echo      ca sa continui instalarea.
    pause
    exit /b 0
)
echo [2/6] Node.js: OK

rem --- Ia / actualizeaza codul aplicatiei ---
cd /d "%USERPROFILE%"
if exist Dorel (
    echo [3/6] Actualizez aplicatia existenta...
    cd Dorel
    git checkout claude/automaton-self-improving-ai-nlseal
    git pull origin claude/automaton-self-improving-ai-nlseal
) else (
    echo [3/6] Descarc aplicatia...
    git clone https://github.com/dandrei132-sudo/Dorel.git
    if errorlevel 1 (
        echo [!] Descarcarea a esuat. Verifica conexiunea la internet si incearca din nou.
        pause
        exit /b 1
    )
    cd Dorel
    git checkout claude/automaton-self-improving-ai-nlseal
)

rem --- Instaleaza dependintele ---
echo [4/6] Instalez componentele necesare (poate dura 1-2 minute)...
call npm install
if errorlevel 1 (
    echo [!] A aparut o eroare la instalare. Trimite mesajul de mai sus.
    pause
    exit /b 1
)

rem --- Construieste aplicatia ---
echo [5/6] Construiesc aplicatia...
call npm run build
if errorlevel 1 (
    echo [!] A aparut o eroare la construire. Trimite mesajul de mai sus.
    pause
    exit /b 1
)

rem --- Configureaza cheia Anthropic, daca lipseste ---
if not exist .env (
    copy .env.example .env >nul
)
set "AK="
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "ANTHROPIC_API_KEY=" .env`) do set "AK=%%B"
if not "!AK!"=="" goto :haskey

echo.
echo ===================================================
echo   Mai ai nevoie de UN singur lucru: o cheie Anthropic.
echo   Iti apar acum fisierul de configurare si pagina unde
echo   iti faci gratuit o cheie, daca nu ai deja una.
echo ===================================================
start "" "https://console.anthropic.com/settings/keys"
notepad .env
echo.
echo Dupa ce ai salvat cheia in fisier (linia ANTHROPIC_API_KEY=...^),
echo ruleaza din nou acest fisier ca sa pornesti aplicatia.
pause
exit /b 0

:haskey
rem --- Porneste aplicatia ---
echo [6/6] Pornesc aplicatia...
echo.
echo Cand vezi "Control panel: http://127.0.0.1:4173" si o parola,
echo deschide acel link intr-un browser si intra cu parola afisata.
echo.
node dist\index.js --run

pause
