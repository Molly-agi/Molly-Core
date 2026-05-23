#!/bin/bash
# MollyBrowser APK Build Script
# Builds the MollyBrowser APK with widget socket service support
# 
# Requirements:
#   - Android SDK installed (compileSdk 34, buildTools 34.x)
#   - JDK 17+
#   - Gradle (bundled via gradlew)
#
# Usage:
#   bash scripts/build-mollybrowser-apk.sh [debug|release]

set -e

BUILD_TYPE=${1:-debug}
APK_DIR="android/MollyBrowser"

echo "=== MollyBrowser APK Build ==="
echo "Type: $BUILD_TYPE"
echo "Location: $APK_DIR"
echo ""

# Check if Android SDK exists
if [ -z "$ANDROID_SDK_ROOT" ] && [ -z "$ANDROID_HOME" ]; then
    echo "⚠️  Android SDK not found in ANDROID_SDK_ROOT or ANDROID_HOME"
    echo "Please set ANDROID_SDK_ROOT environment variable:"
    echo "  export ANDROID_SDK_ROOT=/path/to/android-sdk"
    exit 1
fi

SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
echo "Using Android SDK: $SDK_ROOT"
echo ""

# Check for required SDK components
echo "Checking SDK components..."
if [ ! -d "$SDK_ROOT/platforms/android-34" ]; then
    echo "❌ Missing: platforms/android-34"
    echo "Install via: sdkmanager 'platforms;android-34'"
    exit 1
fi

if [ ! -d "$SDK_ROOT/build-tools/34"* ]; then
    echo "❌ Missing: build-tools/34.x"
    echo "Install via: sdkmanager 'build-tools;34.0.0'"
    exit 1
fi

echo "✅ SDK components OK"
echo ""

# Build APK
cd "$APK_DIR"
echo "Running Gradle build..."

if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew assembleRelease --stacktrace
    APK_OUTPUT="app/build/outputs/apk/release/app-release.apk"
else
    ./gradlew assembleDebug --stacktrace
    APK_OUTPUT="app/build/outputs/apk/debug/app-debug.apk"
fi

cd - > /dev/null

echo ""
echo "=== Build Complete ==="
echo "APK Location: $APK_DIR/$APK_OUTPUT"
echo ""
echo "To install on device:"
echo "  adb install $APK_DIR/$APK_OUTPUT"
echo ""
echo "To run with ADB port forwarding:"
echo "  adb forward tcp:9077 tcp:9077"
echo "  # Then Molly can connect to localhost:9077"
