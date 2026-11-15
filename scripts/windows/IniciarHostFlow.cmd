@echo off
rem Consola personal. No servicios Windows, tareas programadas o ExecutionPolicy.
start "HostFlow - Recuperacion habitual" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NoExit -Command "& 'D:\Node\node.exe' '%~dp0..\hostflowHabitualWindows.js' --iniciar"
