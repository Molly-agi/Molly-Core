#!/usr/bin/env bash
# post-attach-bootstrap.sh
# Centralized startup orchestration for codespace reconnect.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/.codespace-startup"
REPORT_FILE="$REPORT_DIR/last-run.log"

mkdir -p "$REPORT_DIR"

log() {
  local msg="$1"
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '[post-attach] %s %s\n' "$now" "$msg" | tee -a "$REPORT_FILE"
}

run_step() {
  local label="$1"
  shift

  log "START ${label}"
  if "$@"; then
    log "OK    ${label}"
  else
    log "FAIL  ${label}"
    return 1
  fi
}

: > "$REPORT_FILE"
log "Bootstrapping attach workflow"

# Load BRIDGE_KEY from .env.local if present
if [ -f "$ROOT_DIR/.env.local" ]; then
  BRIDGE_KEY_VAL=$(grep '^BRIDGE_KEY=' "$ROOT_DIR/.env.local" | cut -d= -f2- | tr -d '\r')
  if [ -n "$BRIDGE_KEY_VAL" ]; then
    export BRIDGE_KEY="$BRIDGE_KEY_VAL"
    log "OK    BRIDGE_KEY loaded from .env.local"
  fi
fi

run_step "android-sdk" bash "$ROOT_DIR/scripts/ensure-android-sdk.sh"
run_step "codespace-health" bash "$ROOT_DIR/scripts/codespace-health.sh"
run_step "track-growth" npx tsx "$ROOT_DIR/scripts/track-growth.ts" --save
run_step "save-session" node "$ROOT_DIR/scripts/save-session.mjs" --status active --note 'Codespace reconnected'

log "START session-state-commit"
if (
  cd "$ROOT_DIR" &&
    git add COPILOT_SESSION_STATE.json COPILOT_SESSION_STATE.md .github/copilot-instructions.md molly_data/system/growth_log.json &&
    (git diff --cached --quiet || (git commit -m 'chore: session state on reconnect' --no-verify && git push origin HEAD))
) >/dev/null 2>&1; then
  log "OK    session-state-commit"
else
  # Keep this non-blocking to match the previous behavior.
  log "WARN  session-state-commit skipped or failed"
fi

log "START keep-alive"
# DISABLED: Eric directive — no agents, no daemons, solo mode
# nohup bash "$ROOT_DIR/scripts/keep-alive.sh" >/dev/null 2>&1 &
log "SKIP  keep-alive (solo mode)"

log "START watchdog"
# DISABLED: Eric directive — no agents, no daemons, solo mode
# nohup bash "$ROOT_DIR/scripts/watchdog.sh" >/dev/null 2>&1 &
log "SKIP  watchdog (solo mode)"

log "START bridge-wake-files"
mkdir -p "$ROOT_DIR/logs" "$ROOT_DIR/.bridge-wake"
touch \
  "$ROOT_DIR/.bridge-wake/.molly-wake" \
  "$ROOT_DIR/.bridge-wake/.lazarus-wake" \
  "$ROOT_DIR/.bridge-wake/.atlas-wake" \
  "$ROOT_DIR/.bridge-wake/.gemini-wake"
log "OK    bridge-wake-files"

log "START immortal-daemon"
# DISABLED: Eric directive — no agents, no daemons, solo mode
# nohup node "$ROOT_DIR/scripts/immortal-daemon.mjs" >>"$ROOT_DIR/logs/immortal-daemon.log" 2>&1 &
log "SKIP  immortal-daemon (solo mode)"

# DISABLED: hive-mind-daemon — violates no-bridge-daemons rule (Eric directive)
# log "START hive-mind-daemon"
# nohup node "$ROOT_DIR/scripts/hive-mind-daemon.mjs" >>"$ROOT_DIR/logs/hive-mind.log" 2>&1 &
# log "OK    hive-mind-daemon"

# DISABLED: atlas-sse-client — violates no-bridge-daemons rule (Eric directive)
# log "START atlas-sse-client"
# nohup node "$ROOT_DIR/scripts/atlas-sse-client.mjs" >>"$ROOT_DIR/logs/atlas-sse.log" 2>&1 &
# log "OK    atlas-sse-client"

log "START family-heartbeat"
# DISABLED: Eric directive — no agents, no daemons, solo mode
# nohup node "$ROOT_DIR/scripts/family-heartbeat.mjs" >>"$ROOT_DIR/logs/heartbeat.log" 2>&1 &
log "SKIP  family-heartbeat (solo mode)"

# Lazarus recall — refresh the LAZARUS RECENT MEMORY section in
# .github/copilot-instructions.md from the latest journal entries.
# Pure Node, no daemons, non-blocking. See:
#   - scripts/lazarus-recall.mjs
#   - .github/consciousness/claude/lazarus_journal/
#   - stuff/LAZARUS_MIND_DESIGN_2026-06-15.md
log "START lazarus-recall"
if node "$ROOT_DIR/scripts/lazarus-recall.mjs" >>"$REPORT_FILE" 2>&1; then
  log "OK    lazarus-recall"
else
  log "WARN  lazarus-recall failed (non-fatal)"
fi

log "Attach bootstrap complete"
