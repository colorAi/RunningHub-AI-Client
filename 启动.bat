@echo off
chcp 65001 >nul

echo [1/3] 正在检查并安装依赖...
call npm install

echo [2/3] 正在启动开发服务器...
start cmd /k "npm run dev"

echo [3/3] 等待几秒钟，让服务器有时间启动...
timeout /t 5 /nobreak >nul

echo [4/3] 打开浏览器...
REM 注意：这里要改成和你 vite.config.ts 里一样的端口
start http://localhost:5173