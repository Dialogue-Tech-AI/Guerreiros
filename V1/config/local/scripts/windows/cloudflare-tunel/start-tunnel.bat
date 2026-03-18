@echo off
REM Cloudflare Tunnel Start Script for Windows

echo Starting Cloudflare Tunnel for Altese Autopecas...

REM Check if cloudflared is installed
where cloudflared >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo cloudflared not found. Please install it first.
    echo Visit: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
    pause
    exit /b 1
)

REM Check if config exists (prefer cloudflare-tunnel-config.yaml, fallback to config.yaml)
REM Current dir: config\local\scripts\windows\cloudflare-tunel
REM We want:      config\local\dependencies\cloudflare-tunnel-config.yaml
set "CONFIG=..\..\..\dependencies\cloudflare-tunnel-config.yaml"
if not exist "%CONFIG%" set "CONFIG=..\..\..\dependencies\config.yaml"
if not exist "%CONFIG%" (
    echo Config not found. Please configure config/local/dependencies/cloudflare-tunnel-config.yaml first
    pause
    exit /b 1
)

echo Starting tunnel...
REM Versões mais novas do cloudflared não suportam mais --dns-resolver-addrs.
REM Usamos apenas o arquivo de config YAML para resolver DNS/origins.
cloudflared tunnel --config "%CONFIG%" run altese-dev

pause
