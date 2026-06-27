#!/bin/bash
cd "$(dirname "$0")" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:/Users/hongtao/.cargo/bin:$PATH"

PROJECT_DIR="$(pwd)"
APP_NAME=$(node -e "const c=require('./src-tauri/tauri.conf.json'); console.log(c.productName)")
APP_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)")
BINARY_NAME=$(node -e "const fs=require('fs'); const m=fs.readFileSync('src-tauri/Cargo.toml','utf8').match(/^name\\s*=\\s*\"([^\"]+)\"/m); console.log(m ? m[1] : 'rh_client')")
REPAIR_SCRIPT="$PROJECT_DIR/scripts/修复应用已损坏.command"
REPAIR_FILE_NAME="如果提示应用已损坏，请双击修复.command"
BUILD_TARGET="universal-apple-darwin"
BUILD_ROOT="src-tauri/target/$BUILD_TARGET/release"
BUNDLE_ROOT="$BUILD_ROOT/bundle"
MACOS_BUNDLE_DIR="$BUNDLE_ROOT/macos"
DMG_BUNDLE_DIR="$BUNDLE_ROOT/dmg"

echo "=========================================="
echo "     $APP_NAME Tauri macOS Build"
echo "=========================================="
echo
echo "Project: $BINARY_NAME"
echo "Target: Universal macOS (Apple Silicon + Intel)"
echo "Running: npm run tauri:build:mac -- --target $BUILD_TARGET"
echo

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Installing dependencies..."
  npm install
  INSTALL_EXIT_CODE=$?
  if [ "$INSTALL_EXIT_CODE" -ne 0 ]; then
    echo
    echo "npm install failed with exit code $INSTALL_EXIT_CODE."
    echo
    read -r -p "Press Enter to close..."
    exit "$INSTALL_EXIT_CODE"
  fi
  echo
fi

if command -v rustup >/dev/null 2>&1; then
  for RUST_TARGET in aarch64-apple-darwin x86_64-apple-darwin; do
    if ! rustup target list --installed | grep -q "^$RUST_TARGET$"; then
      echo "Installing Rust target: $RUST_TARGET"
      rustup target add "$RUST_TARGET"
      TARGET_EXIT_CODE=$?
      if [ "$TARGET_EXIT_CODE" -ne 0 ]; then
        echo
        echo "Rust target install failed with exit code $TARGET_EXIT_CODE."
        echo
        read -r -p "Press Enter to close..."
        exit "$TARGET_EXIT_CODE"
      fi
      echo
    fi
  done
fi

echo "Cleaning previous macOS bundle artifacts..."
rm -rf "$MACOS_BUNDLE_DIR" "$DMG_BUNDLE_DIR"
echo

npm run tauri:build:mac -- --target "$BUILD_TARGET"
BUILD_EXIT_CODE=$?

echo
if [ "$BUILD_EXIT_CODE" -ne 0 ]; then
  echo "macOS build failed with exit code $BUILD_EXIT_CODE."
else
  APP_PATH="$MACOS_BUNDLE_DIR/$APP_NAME.app"
  DMG_PATH=$(find "$DMG_BUNDLE_DIR" -maxdepth 1 -type f -name "*.dmg" -print 2>/dev/null | head -n 1)
  DMG_BUILDER="$DMG_BUNDLE_DIR/bundle_dmg.sh"
  DMG_ICON="$DMG_BUNDLE_DIR/icon.icns"

  if [ -d "$APP_PATH" ]; then
    echo "Applying full ad-hoc signature to app bundle..."
    codesign -s - --force --deep "$APP_PATH"
    SIGN_EXIT_CODE=$?
    if [ "$SIGN_EXIT_CODE" -eq 0 ]; then
      codesign --verify --deep --strict --verbose=2 "$APP_PATH"
      SIGN_EXIT_CODE=$?
    fi
    if [ "$SIGN_EXIT_CODE" -ne 0 ]; then
      echo "Ad-hoc signing failed with exit code $SIGN_EXIT_CODE."
      BUILD_EXIT_CODE="$SIGN_EXIT_CODE"
    else
      echo "Full ad-hoc signature verified."
    fi
  fi

  if [ "$BUILD_EXIT_CODE" -eq 0 ] && [ -d "$APP_PATH" ] && [ -n "$DMG_PATH" ] && [ -f "$DMG_BUILDER" ] && [ -f "$REPAIR_SCRIPT" ]; then
    echo "Adding the macOS repair shortcut to the DMG..."
    chmod +x "$REPAIR_SCRIPT"
    rm -f "$DMG_PATH"
    "$DMG_BUILDER" \
      --volname "$APP_NAME" \
      --volicon "$DMG_ICON" \
      --window-size 700 440 \
      --icon-size 112 \
      --icon "$(basename "$APP_PATH")" 170 170 \
      --app-drop-link 530 170 \
      --add-file "$REPAIR_FILE_NAME" "$REPAIR_SCRIPT" 350 330 \
      "$DMG_PATH" \
      "$MACOS_BUNDLE_DIR"
    BUILD_EXIT_CODE=$?
  elif [ "$BUILD_EXIT_CODE" -eq 0 ]; then
    echo "Unable to add the repair shortcut: required DMG build files were not found."
    BUILD_EXIT_CODE=1
  fi

  echo
fi

if [ "$BUILD_EXIT_CODE" -eq 0 ]; then
  echo "macOS build completed successfully."
  echo
  echo "Bundles:"
  if [ -d "$APP_PATH" ]; then
    echo "$APP_PATH"
  fi
  if [ -n "$DMG_PATH" ]; then
    echo "$DMG_PATH"
  fi
  echo
  echo "Executable:"
  echo "$BUILD_ROOT/$BINARY_NAME"
else
  echo "macOS packaging did not complete."
fi
echo
read -r -p "Press Enter to close..."
exit "$BUILD_EXIT_CODE"
