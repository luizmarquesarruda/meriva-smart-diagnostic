@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo  MERIVA SMART DIAGNOSTIC - PAINEL LOCAL
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js 22.5 ou superior, da linha 22.x, nao foi encontrado.
  echo Instale Node.js 22 LTS e execute este arquivo novamente.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%a in ('node -p "process.versions.node"') do set NODE_MAJOR=%%a
if not "%NODE_MAJOR%"=="22" (
  echo AVISO: o painel foi preparado para Node.js 22.x. Versao detectada:
  node --version
)
where adb >nul 2>nul
if errorlevel 1 (
  echo AVISO: ADB nao encontrado. O painel abre, mas a sincronizacao USB automatica fica indisponivel.
  start "Meriva Dashboard Service" /min cmd /c "node server.mjs"
  timeout /t 2 /nobreak >nul
  start "" "http://127.0.0.1:8765"
  echo Instale Android Platform Tools e execute novamente para ativar USB automatico.
  pause
  exit /b 0
)
start "Meriva Dashboard Service" /min cmd /c "node server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765"
echo.
echo O painel esta aberto no navegador.
echo A janela atual monitora conexoes USB; mantenha-a aberta.
echo Feche esta janela para parar o monitor USB.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-usb.ps1"
