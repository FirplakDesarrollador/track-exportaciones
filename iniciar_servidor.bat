@echo off
title COMEX Track - Servidor Local
echo ======================================================
echo  Iniciando COMEX Track - Sistema de Control Logistico
echo ======================================================
echo.
echo  Abriendo http://localhost:8000 en su navegador...
echo.
start http://localhost:8000
py server.py
pause
