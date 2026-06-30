#!/usr/bin/env bash
# ensure-tools.sh
# Idempotent: restores all tools that die on codespace reset.
# Called by post-attach-bootstrap.sh on every codespace attach.
#
# Tools managed here:
#   - Android SDK (platforms;android-34, build-tools;34.0.0)
#   - adb (Android Debug Bridge — tablet deployment)
#   - llama-server (crystal baking — persisted to repo tools/, not /tmp)
#   - bun (fast JS runtime used in scripts)
#   - firebase CLI (Molly data layer)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$ROOT_DIR/.tools"
mkdir -p "$TOOLS_DIR"

ok()   { echo "[tools] ✅  $1"; }
skip() { echo "[tools] --  $1 (already present)"; }
fail() { echo "[tools] ❌  $1 — $2"; }

# ── Android SDK ───────────────────────────────────────────────────────────────
SDK_ROOT="/home/codespace/android-sdk"
CMDLINE_TOOLS="$SDK_ROOT/cmdline-tools/latest"

if [ -d "$SDK_ROOT/platforms/android-34" ] && [ -d "$SDK_ROOT/build-tools/34.0.0" ]; then
  skip "Android SDK"
else
  echo "[tools] Installing Android SDK..."
  mkdir -p "$SDK_ROOT/cmdline-tools"
  if [ ! -f "$CMDLINE_TOOLS/bin/sdkmanager" ]; then
    curl -sL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
      -o /tmp/cmdline-tools.zip
    unzip -q /tmp/cmdline-tools.zip -d "$SDK_ROOT/cmdline-tools/"
    mv "$SDK_ROOT/cmdline-tools/cmdline-tools" "$CMDLINE_TOOLS"
    rm -f /tmp/cmdline-tools.zip
  fi
  export ANDROID_SDK_ROOT="$SDK_ROOT"
  yes | "$CMDLINE_TOOLS/bin/sdkmanager" \
    --sdk_root="$SDK_ROOT" \
    "platforms;android-34" \
    "build-tools;34.0.0" \
    "platform-tools" \
    > /tmp/sdkmanager.log 2>&1 && ok "Android SDK + platform-tools" || fail "Android SDK" "see /tmp/sdkmanager.log"
fi

# ── adb ───────────────────────────────────────────────────────────────────────
# platform-tools above installs adb; symlink it to PATH
ADB_BIN="$SDK_ROOT/platform-tools/adb"
if [ -f "$ADB_BIN" ] && ! command -v adb &>/dev/null; then
  ln -sf "$ADB_BIN" /usr/local/bin/adb 2>/dev/null || \
    ln -sf "$ADB_BIN" "$HOME/.local/bin/adb" 2>/dev/null || true
fi
command -v adb &>/dev/null && ok "adb" || fail "adb" "platform-tools may not have installed"

# ── llama-server ──────────────────────────────────────────────────────────────
# Persist the binary inside the repo under .tools/ so it survives resets.
# First run: downloads from llama.cpp releases. After that: already there.
LLAMA_BIN="$TOOLS_DIR/llama-server"
if [ ! -f "$LLAMA_BIN" ]; then
  echo "[tools] Downloading llama-server (b9844 linux x64)..."
  curl -sL "https://github.com/ggml-org/llama.cpp/releases/download/b9844/llama-b9844-bin-ubuntu-x64.zip" \
    -o /tmp/llama-ubuntu.zip
  unzip -q /tmp/llama-ubuntu.zip -d /tmp/llama-ubuntu/
  cp /tmp/llama-ubuntu/build/bin/llama-server "$LLAMA_BIN" 2>/dev/null || \
  find /tmp/llama-ubuntu -name "llama-server" -exec cp {} "$LLAMA_BIN" \; 2>/dev/null || true
  rm -rf /tmp/llama-ubuntu /tmp/llama-ubuntu.zip
  chmod +x "$LLAMA_BIN" 2>/dev/null || true
fi
[ -f "$LLAMA_BIN" ] && ln -sf "$LLAMA_BIN" /usr/local/bin/llama-server 2>/dev/null || true
command -v llama-server &>/dev/null && ok "llama-server" || \
  [ -f "$LLAMA_BIN" ] && ok "llama-server (at $LLAMA_BIN)" || fail "llama-server" "download failed"

# ── bun ──────────────────────────────────────────────────────────────────────
if command -v bun &>/dev/null; then
  skip "bun"
else
  echo "[tools] Installing bun..."
  curl -fsSL https://bun.sh/install | bash > /tmp/bun-install.log 2>&1 && ok "bun" || fail "bun" "see /tmp/bun-install.log"
fi

# ── firebase CLI ──────────────────────────────────────────────────────────────
if command -v firebase &>/dev/null; then
  skip "firebase CLI"
else
  echo "[tools] Installing firebase CLI..."
  npm install -g firebase-tools > /tmp/firebase-install.log 2>&1 && ok "firebase CLI" || fail "firebase CLI" "see /tmp/firebase-install.log"
fi

echo "[tools] Done."
