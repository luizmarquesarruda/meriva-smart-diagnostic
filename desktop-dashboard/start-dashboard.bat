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
for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  set NODE_MAJOR=%%a
  set NODE_MINOR=%%b
)
if not "%NODE_MAJOR%"=="22" (
  echo AVISO: o painel foi preparado para Node.js 22.x. Versao detectada:
  node --version
  echo Se ocorrer erro no modulo node:sqlite, instale Node.js 22 LTS.
)
where adb >nul 2>nul
if errorlevel 1 (
  echo AVISO: ADB nao encontrado. O painel web pode abrir, mas USB automatico ainda nao funcionara.
) else (
  echo Detectando dispositivos Android autorizados...
  adb devices
  adb reverse tcp:8765 tcp:8765
  if errorlevel 1 echo AVISO: nao foi possivel configurar ADB reverse. Confira depuracao USB e autorizacao no celular.
)
start "" "http://127.0.0.1:8765"
node server.mjs
pause
