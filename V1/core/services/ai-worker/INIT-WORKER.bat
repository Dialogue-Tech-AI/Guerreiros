@echo off
cls
echo ============================================================
echo   ALTESE AI WORKER - INICIALIZACAO FORCADA
echo ============================================================
echo.

REM 1. Matar TODOS os processos Python
echo [1/5] Matando TODOS os processos Python...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM python3.12.exe >nul 2>&1
taskkill /F /IM pythonw.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo       OK

REM 2. Verificar
echo [2/5] Verificando se nao ha processos Python...
for /f %%i in ('tasklist /FI "IMAGENAME eq python.exe" /NH 2^>nul ^| find /C "python"') do set PYCOUNT=%%i
if %PYCOUNT% GTR 0 (
    echo       ERRO: Ainda ha processos python.exe rodando!
    pause
    exit /b 1
)
echo       OK - Nenhum processo Python

REM 3. Limpar cache Redis
echo [3/5] Limpando cache do Redis...
cd /d "%~dp0\..\backend"
node scripts\clear-cache.js >nul 2>&1
echo       OK

REM 4. Aguardar
echo [4/5] Aguardando...
timeout /t 2 /nobreak >nul
echo       OK

REM 5. Iniciar worker
echo [5/5] Iniciando worker UNICO...
cd /d "%~dp0"
echo.
echo ============================================================
echo   WORKER ATIVO
echo ============================================================
echo.

REM Usar APENAS o Python do venv, com caminho absoluto
"%CD%\venv\Scripts\python.exe" main.py

echo.
echo ============================================================
echo   WORKER ENCERRADO
echo ============================================================
pause
