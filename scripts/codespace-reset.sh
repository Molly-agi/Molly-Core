#!/bin/bash
# Reset a misbehaving Codespace by clearing caches and reinstalling deps.
# Safe to run multiple times; skips when directories are already clean.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TS_CACHE="${HOME}/.cache/typescript"

echo "== Molly Codespace Reset =="
echo "Working dir: $ROOT"

if [ ! -d "$ROOT" ]; then
  echo "Error: expected repo at $ROOT"
  exit 1
fi

cd "$ROOT"

echo "--> Stopping Next.js dev servers (if any)"
PIDS=$(ps aux | grep "next dev" | grep -v grep | awk '{print $2}')
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill 2>/dev/null || true
fi

echo "--> Removing build caches"
rm -rf .next || true
rm -rf node_modules/.cache || true

echo "--> Clearing TypeScript cache"
if [ -d "$TS_CACHE" ]; then
  rm -rf "${TS_CACHE}" || true
fi

echo "--> Reinstalling dependencies (npm ci)"
npm ci

echo "--> Done. You can now run: npm run dev"
