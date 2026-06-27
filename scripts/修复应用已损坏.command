#!/bin/bash

APP_NAME="RH_Client"
APP_PATH="${1:-/Applications/${APP_NAME}.app}"

clear
echo "=========================================="
echo "       ${APP_NAME} macOS 启动修复工具"
echo "=========================================="
echo
echo "此工具用于处理 macOS 提示“应用已损坏，无法打开”或被系统阻止打开的情况。"
echo

if [ ! -d "$APP_PATH" ] && [ -d "$HOME/Applications/${APP_NAME}.app" ]; then
  APP_PATH="$HOME/Applications/${APP_NAME}.app"
fi

if [ ! -d "$APP_PATH" ]; then
  echo "未找到：$APP_PATH"
  echo
  echo "请先把“${APP_NAME}”拖入 Applications（应用程序）文件夹，"
  echo "然后再次双击此修复工具。"
  echo
  echo "如果应用放在其他位置，也可以在终端执行："
  echo "\"$0\" \"/你的路径/${APP_NAME}.app\""
  echo
  read -r -p "按回车键关闭..."
  exit 1
fi

echo "即将请求管理员授权，并执行以下修复："
echo "1. 清除应用的 com.apple.quarantine 隔离标记"
echo "2. 对应用执行本地 ad-hoc 签名修复"
echo
echo "macOS 弹出密码窗口时，请输入当前电脑的登录密码。"
echo

REPAIR_COMMAND="/usr/bin/xattr -rd com.apple.quarantine $(printf '%q' "$APP_PATH"); /usr/bin/codesign -s - --force --deep $(printf '%q' "$APP_PATH")"

/usr/bin/osascript <<APPLESCRIPT
do shell script "$REPAIR_COMMAND" with administrator privileges
APPLESCRIPT
REPAIR_EXIT_CODE=$?

echo
if [ "$REPAIR_EXIT_CODE" -ne 0 ]; then
  echo "修复未完成，可能是管理员授权被取消，或应用仍被系统占用。"
  echo
  read -r -p "按回车键关闭..."
  exit "$REPAIR_EXIT_CODE"
fi

echo "修复完成，正在打开“${APP_NAME}”..."
/usr/bin/open "$APP_PATH"
echo
read -r -p "按回车键关闭..."
