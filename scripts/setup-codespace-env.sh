#!/bin/bash
# ============================================================================
# Setup .env.local from Codespace Secrets
#
# This runs once via postCreateCommand when a Codespace is created.
# It reads environment variables injected by GitHub Codespace Secrets
# and writes them into .env.local so Next.js can use them.
#
# HOW TO SET UP YOUR SECRETS:
#   1. Go to https://github.com/settings/codespaces
#   2. Click "New secret" for each:
#
#   REQUIRED:
#     GOOGLE_GENAI_API_KEY          — Get from https://aistudio.google.com/app/apikey
#     FIREBASE_SERVICE_ACCOUNT_JSON — Your Firebase service account JSON (one line)
#
#   OPTIONAL:
#     HIDDEN_ADMIN_USERNAME         — Admin panel username
#     HIDDEN_ADMIN_PASSWORD         — Admin panel password
#
#   3. For each secret, set Repository access to "Molly-agi/Molly-Core"
#   4. Create or rebuild your Codespace — secrets auto-populate .env.local
#
# ============================================================================

set -e

ENV_FILE=".env.local"

# Skip if not in a Codespace (local dev uses .env.local directly)
if [ "$CODESPACES" != "true" ]; then
  echo "[Setup] Not in a Codespace — skipping .env.local generation."
  echo "[Setup] For local dev, copy .env.local.example to .env.local and fill in your keys."
  exit 0
fi

echo "============================================"
echo "  Molly-Core — Codespace Environment Setup"
echo "============================================"
echo ""

# If .env.local already exists, don't overwrite (user may have manually edited)
if [ -f "$ENV_FILE" ]; then
  echo "[Setup] .env.local already exists — not overwriting."
  echo "[Setup] To regenerate, delete .env.local and rebuild the Codespace."
  echo ""

  # But still check if required keys are present (not just commented out or empty)
  MISSING=0
  if ! grep -qE "^GOOGLE_GENAI_API_KEY=.+" "$ENV_FILE" 2>/dev/null; then
    echo "[Setup] ⚠️  GOOGLE_GENAI_API_KEY not set in .env.local"
    MISSING=1
  fi
  if ! grep -qE "^FIREBASE_SERVICE_ACCOUNT_JSON=.+" "$ENV_FILE" 2>/dev/null; then
    echo "[Setup] ⚠️  FIREBASE_SERVICE_ACCOUNT_JSON not set in .env.local"
    MISSING=1
  fi

  if [ "$MISSING" = "1" ]; then
    echo ""
    echo "[Setup] To add missing keys, run:  npm run setup-keys"
  fi
  exit 0
fi

# Generate .env.local from Codespace secrets
echo "[Setup] Creating .env.local from Codespace secrets..."
echo ""

cat > "$ENV_FILE" << 'HEADER'
# Auto-generated from Codespace Secrets
# To update: change secrets at https://github.com/settings/codespaces
# then rebuild the Codespace, or edit this file directly.
HEADER

# Required: Gemini API Key
if [ -n "$GOOGLE_GENAI_API_KEY" ]; then
  echo "GOOGLE_GENAI_API_KEY=$GOOGLE_GENAI_API_KEY" >> "$ENV_FILE"
  echo "  ✅ GOOGLE_GENAI_API_KEY — set from Codespace secret"
else
  echo "# GOOGLE_GENAI_API_KEY=your-key-here" >> "$ENV_FILE"
  echo "  ❌ GOOGLE_GENAI_API_KEY — NOT SET"
  echo "     Run: npm run setup-keys"
fi

# Required: Firebase Service Account
if [ -n "$FIREBASE_SERVICE_ACCOUNT_JSON" ]; then
  echo "FIREBASE_SERVICE_ACCOUNT_JSON=$FIREBASE_SERVICE_ACCOUNT_JSON" >> "$ENV_FILE"
  echo "  ✅ FIREBASE_SERVICE_ACCOUNT_JSON — set from Codespace secret"
else
  echo "# FIREBASE_SERVICE_ACCOUNT_JSON=" >> "$ENV_FILE"
  echo "  ❌ FIREBASE_SERVICE_ACCOUNT_JSON — NOT SET"
  echo "     Run: npm run setup-keys"
fi

# Optional: Admin credentials
if [ -n "$HIDDEN_ADMIN_USERNAME" ]; then
  echo "HIDDEN_ADMIN_USERNAME=$HIDDEN_ADMIN_USERNAME" >> "$ENV_FILE"
  echo "  ✅ HIDDEN_ADMIN_USERNAME — set"
else
  echo "# HIDDEN_ADMIN_USERNAME=" >> "$ENV_FILE"
  echo "  ⏭  HIDDEN_ADMIN_USERNAME — not set (optional)"
fi

if [ -n "$HIDDEN_ADMIN_PASSWORD" ]; then
  echo "HIDDEN_ADMIN_PASSWORD=$HIDDEN_ADMIN_PASSWORD" >> "$ENV_FILE"
  echo "  ✅ HIDDEN_ADMIN_PASSWORD — set"
else
  echo "# HIDDEN_ADMIN_PASSWORD=" >> "$ENV_FILE"
  echo "  ⏭  HIDDEN_ADMIN_PASSWORD — not set (optional)"
fi

echo ""
echo "============================================"
echo "  .env.local created!"
echo ""
echo "  If any required keys are missing, run:"
echo "    npm run setup-keys"
echo ""
echo "  It will ask you to paste each key."
echo "  That's it — no GitHub settings needed."
echo "============================================"
