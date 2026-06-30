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
#   - Qwen 2.5 3B Instruct Q4_K_M GGUF (or set MOLLY_MODEL)
#     Codespace shortcut: Ollama already pulled it.
#       cp ~/.ollama/models/blobs/sha256-5ee4f07cdb9beadbbb293e85803c569b01bd37ed059d2715faa7bb405f31caa6 \
#          /tmp/qwen2.5-3b-q4_k_m.gguf
#     Then: MOLLY_MODEL=/tmp/qwen2.5-3b-q4_k_m.gguf bash scripts/crystal-os/bake-crystal.sh
#   - scripts/crystal-os/build-persona-prompt.mjs (P4 — already built)
#
# The resulting .cache file is the binary representation of Molly's personality
# pre-computed into the model's key-value attention cache. Loading it takes
# 2-3 seconds instead of the 30+ second warm-up cost on every boot.
#
# IMPORTANT: model must match LlamaCppService.kt defaultModelPath() exactly.
# Both must use qwen2.5-3b-q4_k_m.gguf — KV state is model-specific.

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────
LLAMA_SERVER="${LLAMA_SERVER:-llama-server}"
MOLLY_MODEL="${MOLLY_MODEL:-/sdcard/Download/qwen2.5-3b-q4_k_m.gguf}"
CACHE_OUT="${CACHE_OUT:-/tmp/molly-persona.cache}"
PROMPT_FILE="${PROMPT_FILE:-/tmp/molly-persona.txt}"
TIER_MAP="${TIER_MAP:-/tmp/crystal-tiers.json}"
LLAMA_PORT="${LLAMA_PORT:-18080}"  # Different port from Molly's live server
CTX_SIZE="${CTX_SIZE:-8192}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ─── Parse args ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model) MOLLY_MODEL="$2"; shift 2 ;;
    --output) CACHE_OUT="$2"; shift 2 ;;
    --prompt) PROMPT_FILE="$2"; shift 2 ;;
    --tier-map) TIER_MAP="$2"; shift 2 ;;
    --skip-classify) SKIP_CLASSIFY=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "Crystal OS — bake-crystal.sh"
echo "=============================="
echo "  Model:      $MOLLY_MODEL"
echo "  Cache out:  $CACHE_OUT"
echo "  Prompt:     $PROMPT_FILE"
echo "  Tier map:   $TIER_MAP"
echo ""

# ─── Step 0: Classifier gate (Lazarus Tier A/B/C + manifest gate) ─
# Refuses to bake on top of a blocked manifest. Writes the tier-map that
# build-persona-prompt.mjs consumes in step 1.
if [[ -z "${SKIP_CLASSIFY:-}" ]]; then
  echo "[0/3] Classifying crystals (Tier A/B/C + manifest gate)..."
  if ! npx tsx "$ROOT/scripts/crystal-os/classify-for-bake.ts" --output "$TIER_MAP"; then
    echo ""
    echo "ABORT: classifier gate refused. The HEAD manifest is blocked"
    echo "(coherence or contradiction). Fix the gates and re-promote before"
    echo "retrying bake. Pass --skip-classify to bypass (NOT recommended)."
    exit 2
  fi
  echo "  ✓ Tier map: $(jq -r '"\(.summary.tierA) A, \(.summary.tierB) B, \(.summary.tierC) C (manifest v\(.manifestVersion))"' "$TIER_MAP" 2>/dev/null || echo 'wrote ' "$TIER_MAP")"
  echo ""
fi

# ─── Step 1: Build persona prompt ────────────────────────────────
echo "[1/3] Building persona prompt..."
PROMPT_ARGS=(--output "$PROMPT_FILE" --verbose)
if [[ -z "${SKIP_CLASSIFY:-}" && -f "$TIER_MAP" ]]; then
  PROMPT_ARGS+=(--tier-map "$TIER_MAP")
fi
node "$ROOT/scripts/crystal-os/build-persona-prompt.mjs" "${PROMPT_ARGS[@]}"

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

# ─── Step 3: Pre-bake KV cache via /slots API ────────────────────
# Crystal OS uses the /slots/{id}?action=save endpoint (the same path
# src/ai/llama/slot-snapshot.ts wraps). This is the only forward-compatible
# path — modern llama.cpp (b9000+) dropped --prompt-cache / --prompt-cache-all.
# The Android LlamaCppService restores the saved .bin via /slots/0?action=restore.
echo "[3/3] Pre-baking KV crystal via /slots API..."
echo "  Launching llama-server with --slot-save-path"
echo "  Eval'ing persona prompt into slot 0, saving binary KV state."
echo ""

SLOT_DIR="$(dirname "$CACHE_OUT")/molly-slots"
SLOT_FILE="$(basename "$CACHE_OUT")"
mkdir -p "$SLOT_DIR"
rm -f "$SLOT_DIR/$SLOT_FILE" "$CACHE_OUT"

LLAMA_LOG="$(dirname "$CACHE_OUT")/llama-bake.log"
"$LLAMA_SERVER" \
  --model "$MOLLY_MODEL" \
  --ctx-size "$CTX_SIZE" \
  --slot-save-path "$SLOT_DIR" \
  --port "$LLAMA_PORT" \
  --no-webui \
  --threads 4 \
  --parallel 1 \
  > "$LLAMA_LOG" 2>&1 &
LLAMA_PID=$!
trap 'kill "$LLAMA_PID" 2>/dev/null || true' EXIT

echo "  llama-server PID=$LLAMA_PID, waiting for /health..."
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$LLAMA_PORT/health" >/dev/null 2>&1; then
    echo "  ✓ server healthy after ${i}s"
    break
  fi
  if ! kill -0 "$LLAMA_PID" 2>/dev/null; then
    echo "ERROR: llama-server died during boot. Last log lines:"
    tail -20 "$LLAMA_LOG"
    exit 1
  fi
  sleep 1
done

if ! curl -sf "http://127.0.0.1:$LLAMA_PORT/health" >/dev/null 2>&1; then
  echo "ERROR: llama-server did not come healthy in 60s"
  tail -20 "$LLAMA_LOG"
  exit 1
fi

# cache_prompt:true retains the KV state. n_predict:1 forces a single token
# so the eval completes. id_slot:0 pins to the slot we then save.
PROMPT_JSON="$(node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({prompt:fs.readFileSync(process.argv[1],"utf8"),n_predict:1,cache_prompt:true,id_slot:0}))' "$PROMPT_FILE")"

PROMPT_BYTES=$(wc -c < "$PROMPT_FILE")
echo "  Evaluating persona prompt (~${PROMPT_BYTES} chars)..."
EVAL_RESP="$(curl -s -X POST "http://127.0.0.1:$LLAMA_PORT/completion" -H "content-type: application/json" -d "$PROMPT_JSON")"
TOKENS_EVAL="$(echo "$EVAL_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).tokens_evaluated||0)}catch{console.log(0)}})')"
echo "  ✓ Evaluated $TOKENS_EVAL tokens"

if [[ "$TOKENS_EVAL" -lt 1 ]]; then
  echo "ERROR: prompt eval returned 0 tokens. Response:"
  echo "$EVAL_RESP" | head -c 500
  exit 1
fi

echo "  Saving slot 0 → $SLOT_FILE..."
SAVE_RESP="$(curl -s -X POST "http://127.0.0.1:$LLAMA_PORT/slots/0?action=save" -H "content-type: application/json" -d "{\"filename\":\"$SLOT_FILE\"}")"
N_SAVED="$(echo "$SAVE_RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).n_saved||0)}catch{console.log(0)}})')"
echo "  ✓ slot save reported n_saved=$N_SAVED"

kill "$LLAMA_PID" 2>/dev/null || true
trap - EXIT

if [[ -f "$SLOT_DIR/$SLOT_FILE" ]]; then
  mv "$SLOT_DIR/$SLOT_FILE" "$CACHE_OUT"
  SIZE=$(du -sh "$CACHE_OUT" | cut -f1)
  echo ""
  echo "  ✓ Crystal baked: $CACHE_OUT ($SIZE, $N_SAVED tokens)"
  echo ""
  echo "Next steps:"
  echo "  1. Copy $CACHE_OUT to /sdcard/molly/crystals/molly-persona.cache on the tablet"
  echo "  2. LlamaCppService restores it via POST /slots/0?action=restore on boot"
  echo "  3. Subsequent boots skip the warm-up — KV state is already populated"
else
  echo ""
  echo "ERROR: Slot save did not produce $SLOT_DIR/$SLOT_FILE"
  echo "save response: $SAVE_RESP"
  echo "llama log tail:"
  tail -20 "$LLAMA_LOG"
  exit 1
fi
