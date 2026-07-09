#!/bin/bash
set -e
cd /www/wwwroot/todo/mobile/app

echo "=== 1. Build Vite ==="
npm run build

echo "=== 2. Add Android platform ==="
npx cap add android 2>&1 || true

echo "=== 3. Sync web assets to Android ==="
npx cap sync

echo "=== 4. Set up Android SDK env ==="
export ANDROID_HOME=/opt/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

echo "=== 5. Build APK ==="
cd android
./gradlew assembleDebug 2>&1 | tail -20

echo "=== Done ==="
ls -lh app/build/outputs/apk/debug/ 2>/dev/null || echo "APK not found, check errors above"
