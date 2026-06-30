#!/usr/bin/env bash
# Crystal OS — bake-crystal.sh
# =============================
# Pre-computes Molly's KV personality crystal using llama-server.
# Must be run ONCE on the codespace (or any ARM64/x86 machine with llama.cpp).
# Output: molly-persona.cache (binary KV state file)
# This file syncs to /sdcard/molly/crystals/ on the Revvl Tab 2 —
# LlamaCppService auto-imports it on first run.
#
# Usage:
#   bash scripts/crystal-os/bake-crystal.sh [--model /path/to/model.gguf]
#
# Requires:
#   - llama-server binary in PATH or LLAMA_SERVER env var
#   - Llama 3.2 3B Instruct Q4_K_M GGUF (or set MOLLY_MODEL)
#   - scripts/crystal-os/build-persona-prompt.mjs (P4 — already built)
#
# The resulting .cache file is the binary representation of Molly's personality
# pre-computed into the model's key-value attention cache. Loading it takes
# 2-3 seconds instead of the 30+ second warm-up cost on every boot.

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────
LLAMA_SERVER="${LLAMA_SERVER:-llama-server}"
MOLLY_MODEL="${MOLLY_MODEL:-/sdcard/Download/llama-3.2-3b-instruct-q4_k_m.gguf}"
CACHE_OUT="${CACHE_OUT:-/tmp/molly-persona.cache}"
PROMPT_FILE="${PROMPT_FILE:-/tmp/molly-persona.txt}"
LLAMA_PORT="${LLAMA_PORT:-18080}"  # Different port from Molly's live server
CTX_SIZE="${CTX_SIZE:-8192}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ─── Parse args ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) MOLLY_MODEL="$2"; shift 2 ;;
    --output) CACHE_OUT="$2"; shift 2 ;;
    --prompt) PROMPT_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "Crystal OS — bake-crystal.sh"
echo "=============================="
echo "  Model:      $MOLLY_MODEL"
echo "  Cache out:  $CACHE_OUT"
echo "  Prompt:     $PROMPT_FILE"
echo ""

# ─── Step 1: Build persona prompt ────────────────────────────────
echo "[1/3] Building persona prompt..."
node "$ROOT/scripts/crystal-os/build-persona-prompt.mjs" \
  --output "$PROMPT_FILE" \
  --verbose

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Persona prompt not generated. Check build-persona-prompt.mjs"
  exit 1
fi

echo "  ✓ Prompt file: $(wc -c < "$PROMPT_FILE") bytes"
echo ""

# ─── Step 2: Verify model ────────────────────────────────────────
echo "[2/3] Verifying model..."
if [[ ! -f "$MOLLY_MODEL" ]]; then
  echo "ERROR: Model not found at: $MOLLY_MODEL"
  echo ""
  echo "Download Llama 3.2 3B Instruct Q4_K_M:"
  echo "  wget -O \"$MOLLY_MODEL\" \\"
  echo "    https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
  exit 1
fi
echo "  ✓ Model found"
echo ""

# ─── Step 3: Pre-bake KV cache ───────────────────────────────────
echo "[3/3] Pre-baking KV crystal..."
echo "  This runs llama-server with --prompt-cache-all."
echo "  On first run it evaluates the full persona prompt (~30-60 seconds)."
echo "  Subsequent loads from disk take 2-3 seconds."
echo ""

# We run llama-server in one-shot mode:
# --prompt-cache-all writes the KV state after processing the system prompt
# --n-predict 1 generates exactly 1 token then exits (just enough to force cache write)
# After exit, the .cache file contains the full baked KV state

"$LLAMA_SERVER" \
  --model "$MOLLY_MODEL" \
  --ctx-size "$CTX_SIZE" \
  --prompt-cache "$CACHE_OUT" \
  --prompt-cache-all \
  --system-prompt-file "$PROMPT_FILE" \
  --n-predict 1 \
  --threads 4 \
  --log-disable \
  2>&1 | grep -E "llama_|sampling|crystal|baked|error|Error" || true

if [[ -f "$CACHE_OUT" ]]; then
  SIZE=$(du -sh "$CACHE_OUT" | cut -f1)
  echo ""
  echo "  ✓ Crystal baked: $CACHE_OUT ($SIZE)"
  echo ""
  echo "Next steps:"
  echo "  1. Copy $CACHE_OUT to /sdcard/molly/crystals/molly-persona.cache on Revvl Tab 2"
  echo "  2. Open MollyBrowser → molly://?action=local-chat → tap ⚡"
  echo "  3. LlamaCppService will detect and import the crystal on first run"
  echo "  4. Subsequent boots load in 2-3s instead of 30s"
else
  echo ""
  echo "WARNING: Cache file not found at $CACHE_OUT"
  echo "llama-server may not support --prompt-cache on this build."
  echo "Check: llama-server --help | grep prompt-cache"
fi
