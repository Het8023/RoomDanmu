@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\allow-firewall.ps1"
if errorlevel 1 (
  echo 防火墙规则添加失败，请确认已允许管理员授权，然后重试。
) else (
  echo 已放行本程序的局域网 UDP 47779 入站连接。请让双方都运行此脚本。
)
pause
