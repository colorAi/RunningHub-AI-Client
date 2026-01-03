@echo off

REM 1. 启动开发服务器
start cmd /k "npm run dev"

REM 2. 等待几秒钟，让服务器有时间启动
timeout /t 5 /nobreak >nul

REM 3. 打开浏览器并访问地址
start http://localhost:3000