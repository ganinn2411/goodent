@echo off
cd /d "%~dp0"
echo ===== Goodent Laboratuvar - Windows uygulamasi hazirlaniyor =====
if not exist .env (
  echo HATA: .env dosyasi bulunamadi. Once .env dosyasini bu klasore koy.
  pause
  exit /b
)
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm install
if errorlevel 1 ( echo HATA: npm install basarisiz & pause & exit /b )
call npm run electron:build
if errorlevel 1 ( echo HATA: build basarisiz & pause & exit /b )
echo.
echo TAMAM! release klasorundeki Setup .exe dosyasini kurabilirsin.
start "" release
pause
