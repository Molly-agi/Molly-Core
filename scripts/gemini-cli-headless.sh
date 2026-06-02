#!/bin/bash
# ======================================================
# Gemini CLI Headless Wrapper
# ======================================================
# Launches Gemini CLI with proper environment for headless/non-interactive use.
# Sets API key and workspace trust so the CLI doesn't require browser auth.
#
# Usage:
#   scripts/gemini-cli-headless.sh "Your prompt here"
#   or pipe input: echo "Your prompt" | scripts/gemini-cli-headless.sh
#
# Note: Requires GOOGLE_GENAI_API_KEY to be set in environment.

set -euo pipefail

if [[ -z "${GOOGLE_GENAI_API_KEY:-}" ]]; then
  echo "[ERROR] GOOGLE_GENAI_API_KEY environment variable not set"
  exit 1
fi

# Export for Gemini CLI (it looks for GEMINI_API_KEY, not GOOGLE_GENAI_API_KEY)
export GEMINI_API_KEY="$GOOGLE_GENAI_API_KEY"
export GEMINI_CLI_TRUST_WORKSPACE=true

# Capture prompt from args or stdin
if [[ $# -gt 0 ]]; then
  # Args provided
  gemini -p "$*"
else
  # Read from stdin
  gemini -p "$(cat)"
fi
