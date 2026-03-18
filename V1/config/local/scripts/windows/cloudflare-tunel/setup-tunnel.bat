@echo off
setlocal
cd /d "%~dp0\..\.."
echo ========================================
echo  Cloudflare Tunnel - WebSocket Setup
echo ========================================
echo.

REM Verificar se cloudflared está instalado
where cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] cloudflared nao encontrado!
    echo.
    echo Instale com: winget install --id Cloudflare.cloudflared
    echo Ou baixe de: https://github.com/cloudflare/cloudflared/releases
    echo.
    pause
    exit /b 1
)

echo [OK] cloudflared encontrado
cloudflared --version
echo.

REM Verificar se existe config (tenta cloudflare-tunnel-config.yaml primeiro)
set "CONFIG=dependencies\\cloudflare-tunnel-config.yaml"
if not exist "%CONFIG%" set "CONFIG=cloudflare\config.yaml"
if not exist "%CONFIG%" (
    echo [AVISO] Arquivo de config nao encontrado em dependencies\\cloudflare-tunnel-config.yaml ou cloudflare\config.yaml
    echo Por favor, configure o arquivo primeiro.
    echo.
    pause
    exit /b 1
)

echo [OK] Arquivo de configuracao encontrado: %CONFIG%
echo.

REM Menu de opcoes
echo Escolha uma opcao:
echo.
echo 1. Criar novo tunel
echo 2. Listar tuneis existentes
echo 3. Configurar DNS
echo 4. Testar tunel (rodar uma vez)
echo 5. Instalar como servico do Windows
echo 6. Iniciar servico
echo 7. Parar servico
echo 8. Ver status do servico
echo 9. Ver logs (debug)
echo 0. Sair
echo.

set /p opcao="Digite o numero da opcao: "

if "%opcao%"=="1" goto criar_tunel
if "%opcao%"=="2" goto listar_tuneis
if "%opcao%"=="3" goto configurar_dns
if "%opcao%"=="4" goto testar_tunel
if "%opcao%"=="5" goto instalar_servico
if "%opcao%"=="6" goto iniciar_servico
if "%opcao%"=="7" goto parar_servico
if "%opcao%"=="8" goto status_servico
if "%opcao%"=="9" goto ver_logs
if "%opcao%"=="0" exit /b 0

echo Opcao invalida!
pause
exit /b 1

:criar_tunel
echo.
echo ========================================
echo  Criando novo tunel...
echo ========================================
set /p nome_tunel="Digite o nome do tunel (ex: altese-dev): "
cloudflared tunnel create %nome_tunel%
echo.
echo IMPORTANTE: Anote o TUNNEL_ID que apareceu acima!
echo Edite o arquivo dependencies\\cloudflare-tunnel-config.yaml e coloque:
echo   tunnel: SEU_TUNNEL_ID
echo   credentials-file: C:\Users\%USERNAME%\.cloudflared\SEU_TUNNEL_ID.json
echo.
pause
exit /b 0

:listar_tuneis
echo.
echo ========================================
echo  Tuneis existentes:
echo ========================================
cloudflared tunnel list
echo.
pause
exit /b 0

:configurar_dns
echo.
echo ========================================
echo  Configurando DNS...
echo ========================================
set /p nome_tunel="Digite o nome do tunel: "
set /p dominio="Digite o dominio (ex: devaltese.dialoguetech.com.br): "
cloudflared tunnel route dns %nome_tunel% %dominio%
echo.
pause
exit /b 0

:testar_tunel
echo.
echo ========================================
echo  Iniciando tunel em modo teste...
echo  Pressione Ctrl+C para parar
echo ========================================
cloudflared tunnel --config %CONFIG% run altese-dev
pause
exit /b 0

:instalar_servico
echo.
echo ========================================
echo  Instalando como servico do Windows...
echo ========================================

REM Copiar config para diretorio padrao
if not exist "C:\Users\%USERNAME%\.cloudflared" mkdir "C:\Users\%USERNAME%\.cloudflared"
copy /Y "%CONFIG%" "C:\Users\%USERNAME%\.cloudflared\config.yml"

echo Arquivo de configuracao copiado.
echo Instalando servico...
cloudflared service install
echo.
echo Servico instalado!
echo Use a opcao 6 para iniciar o servico.
echo.
pause
exit /b 0

:iniciar_servico
echo.
echo ========================================
echo  Iniciando servico...
echo ========================================
cloudflared service start
echo.
timeout /t 3 >nul
cloudflared service status
echo.
pause
exit /b 0

:parar_servico
echo.
echo ========================================
echo  Parando servico...
echo ========================================
cloudflared service stop
echo.
timeout /t 2 >nul
echo Servico parado.
echo.
pause
exit /b 0

:status_servico
echo.
echo ========================================
echo  Status do servico:
echo ========================================
cloudflared service status
echo.
echo Info do tunel:
cloudflared tunnel list
echo.
pause
exit /b 0

:ver_logs
echo.
echo ========================================
echo  Iniciando tunel em modo DEBUG...
echo  Pressione Ctrl+C para parar
echo ========================================
cloudflared tunnel --config %CONFIG% run altese-dev --loglevel debug
pause
exit /b 0
