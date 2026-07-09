#!/bin/bash
set -e
export ANDROID_HOME=/opt/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
cd /www/wwwroot/todo/mobile/app/android
cp /tmp/gradle-8.2.1-all.zip /opt/gradle/gradle-8.2.1-all.zip 2>/dev/null || true
./gradlew assembleDebug 2>&1 | tail -30
echo "=== APK location ==="
find app/build/outputs -name "*.apk" 2>/dev/null || echo "Build failed"
