#!/usr/bin/env bash
# ensure-android-sdk.sh
# Idempotent: installs Android SDK if missing, skips if already present.
# Called by post-attach-bootstrap.sh on every codespace attach/reset.

set -euo pipefail

SDK_ROOT="/home/codespace/android-sdk"
CMDLINE_TOOLS="$SDK_ROOT/cmdline-tools/latest"
PLATFORM="platforms;android-34"
BUILD_TOOLS="build-tools;34.0.0"

# Already installed — nothing to do
if [ -d "$SDK_ROOT/platforms/android-34" ] && [ -d "$SDK_ROOT/build-tools/34.0.0" ]; then
  echo "[android-sdk] Already installed at $SDK_ROOT — skipping"
  exit 0
fi

echo "[android-sdk] SDK missing or incomplete — installing..."

# Download command-line tools if not present
if [ ! -f "$CMDLINE_TOOLS/bin/sdkmanager" ]; then
  echo "[android-sdk] Downloading command-line tools..."
  mkdir -p "$SDK_ROOT/cmdline-tools"
  curl -sL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
    -o /tmp/cmdline-tools.zip
  unzip -q /tmp/cmdline-tools.zip -d "$SDK_ROOT/cmdline-tools/"
  mv "$SDK_ROOT/cmdline-tools/cmdline-tools" "$CMDLINE_TOOLS"
  rm /tmp/cmdline-tools.zip
  echo "[android-sdk] Command-line tools installed"
fi

export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_HOME="$SDK_ROOT"

# Accept licenses and install platform + build-tools
echo "[android-sdk] Installing platform 34 and build-tools 34.0.0..."
yes | "$CMDLINE_TOOLS/bin/sdkmanager" \
  --sdk_root="$SDK_ROOT" \
  "$PLATFORM" \
  "$BUILD_TOOLS" \
  > /tmp/sdkmanager.log 2>&1

echo "[android-sdk] Install complete"
echo "[android-sdk]   platforms: $(ls $SDK_ROOT/platforms/)"
echo "[android-sdk]   build-tools: $(ls $SDK_ROOT/build-tools/)"
