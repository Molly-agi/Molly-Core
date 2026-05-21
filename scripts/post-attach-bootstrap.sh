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
nohup bash "$ROOT_DIR/scripts/keep-alive.sh" >/dev/null 2>&1 &
log "OK    keep-alive"

log "START watchdog"
nohup bash "$ROOT_DIR/scripts/watchdog.sh" >/dev/null 2>&1 &
log "OK    watchdog"

log "Attach bootstrap complete"
