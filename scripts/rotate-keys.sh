#!/bin/bash
# Key rotation helper — prompts for new keys securely
# Values are never echoed to screen or logged
# Usage: bash scripts/rotate-keys.sh

set -e

ENV_FILE="/workspaces/Molly-Core/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

echo "============================================"
echo "  Molly-Core Key Rotation Tool"
echo "  Values will NOT be displayed on screen."
echo "============================================"
echo ""

# --- Gemini API Key ---
echo "[1/2] GOOGLE_GENAI_API_KEY (Gemini)"
echo "  Paste your new Gemini API key and press Enter:"
read -rs NEW_GEMINI_KEY
echo ""

if [ -n "$NEW_GEMINI_KEY" ]; then
  sed -i "s|^GOOGLE_GENAI_API_KEY=.*|GOOGLE_GENAI_API_KEY=${NEW_GEMINI_KEY}|" "$ENV_FILE"
  echo "  ✓ Gemini key updated in .env.local"
  export GOOGLE_GENAI_API_KEY="$NEW_GEMINI_KEY"
  echo "  ✓ Gemini key exported to current shell"
else
  echo "  ⏭ Skipped (no input)"
fi

echo ""

# --- Firebase Service Account ---
echo "[2/2] FIREBASE_SERVICE_ACCOUNT_JSON"
echo "  Paste the ENTIRE JSON (single line) and press Enter:"
read -rs NEW_FIREBASE_JSON
echo ""

if [ -n "$NEW_FIREBASE_JSON" ]; then
  # Escape special sed characters in the JSON
  ESCAPED_JSON=$(printf '%s' "$NEW_FIREBASE_JSON" | sed 's/[&/\]/\\&/g')
  sed -i "s|^FIREBASE_SERVICE_ACCOUNT_JSON=.*|FIREBASE_SERVICE_ACCOUNT_JSON=${ESCAPED_JSON}|" "$ENV_FILE"
  echo "  ✓ Firebase service account updated in .env.local"
else
  echo "  ⏭ Skipped (no input)"
fi

echo ""
echo "============================================"
echo "  Done. Keys updated in .env.local"
echo ""
echo "  REMINDER: You also need to update"
echo "  GOOGLE_GENAI_API_KEY in GitHub Codespace"
echo "  Secrets (Settings → Codespaces → Secrets)"
echo "  for it to persist across rebuilds."
echo "============================================"

# Clear variables from memory
unset NEW_GEMINI_KEY NEW_FIREBASE_JSON ESCAPED_JSON
