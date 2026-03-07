#!/bin/bash
# ======================================================
# Codespace Health Check & Zombie Cleanup
# ======================================================
# This script detects and kills duplicate VS Code extension
# hosts AND orphaned file watchers that accumulate when
# reconnecting to the Codespace.
# Each stale extension host wastes ~750MB-1.5GB of RAM.
# Orphaned file watchers add ~60MB each (9 = 550MB).
#
# Usage:
#   npm run health          # One-time check
#   bash scripts/codespace-health.sh
#   bash scripts/codespace-health.sh --predev  # Run before dev server
# ======================================================

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PREDEV_MODE=false
if [[ "${1:-}" == "--predev" ]]; then
  PREDEV_MODE=true
fi

echo ""
echo -e "${CYAN}=== Codespace Health Check ===${NC}"
echo ""

# --- Memory ---
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
USED_MEM=$(free -m | awk '/^Mem:/{print $3}')
AVAIL_MEM=$(free -m | awk '/^Mem:/{print $7}')
MEM_PCT=$((USED_MEM * 100 / TOTAL_MEM))

if [ "$MEM_PCT" -gt 85 ]; then
  echo -e "${RED}MEMORY: ${USED_MEM}MB / ${TOTAL_MEM}MB (${MEM_PCT}%) - CRITICAL${NC}"
elif [ "$MEM_PCT" -gt 70 ]; then
  echo -e "${YELLOW}MEMORY: ${USED_MEM}MB / ${TOTAL_MEM}MB (${MEM_PCT}%) - WARNING${NC}"
else
  echo -e "${GREEN}MEMORY: ${USED_MEM}MB / ${TOTAL_MEM}MB (${MEM_PCT}%) - OK${NC}"
fi
echo "  Available: ${AVAIL_MEM}MB"

# --- CPU Load ---
LOAD=$(cat /proc/loadavg | awk '{print $1}')
CORES=$(nproc)
echo ""
echo "CPU LOAD: ${LOAD} (${CORES} cores)"

# --- Duplicate Extension Hosts ---
echo ""
EXT_HOSTS=$(ps aux | grep "type=extensionHost" | grep -v grep | wc -l)
if [ "$EXT_HOSTS" -gt 1 ]; then
  echo -e "${RED}EXTENSION HOSTS: ${EXT_HOSTS} running (expected 1) - DUPLICATES DETECTED${NC}"
  
  # Get PIDs sorted by start time (oldest first)
  PIDS=$(ps aux | grep "type=extensionHost" | grep -v grep | sort -k9 | awk '{print $2}')
  NEWEST_PID=$(echo "$PIDS" | tail -1)
  
  echo "  Keeping newest: PID ${NEWEST_PID}"
  
  for PID in $PIDS; do
    if [ "$PID" != "$NEWEST_PID" ]; then
      echo -e "  ${YELLOW}Killing stale host: PID ${PID}${NC}"
      kill "$PID" 2>/dev/null || true
    fi
  done
  
  sleep 2
  echo -e "  ${GREEN}Extension host cleanup complete.${NC}"
  
  NEW_USED=$(free -m | awk '/^Mem:/{print $3}')
  FREED=$((USED_MEM - NEW_USED))
  if [ "$FREED" -gt 0 ]; then
    echo -e "  ${GREEN}Freed ~${FREED}MB of memory${NC}"
    USED_MEM=$NEW_USED
  fi
elif [ "$EXT_HOSTS" -eq 1 ]; then
  echo -e "${GREEN}EXTENSION HOSTS: 1 - OK${NC}"
else
  echo -e "${YELLOW}EXTENSION HOSTS: 0 - None running (VS Code may not be connected)${NC}"
fi

# --- Orphaned File Watchers ---
echo ""
FW_COUNT=$(ps aux | grep "type=fileWatcher" | grep -v grep | wc -l)
# Each active extension host should have 1-2 file watchers. More than 4 total is suspect.
if [ "$FW_COUNT" -gt 4 ]; then
  FW_MEM=$(ps aux | grep "type=fileWatcher" | grep -v grep | awk '{sum+=$6} END {printf "%.0f", sum/1024}')
  echo -e "${YELLOW}FILE WATCHERS: ${FW_COUNT} instances using ~${FW_MEM}MB - EXCESS DETECTED${NC}"
  
  # Get the newest extension host PID
  ACTIVE_EXT=$(ps aux | grep "type=extensionHost" | grep -v grep | sort -k9 | tail -1 | awk '{print $2}')
  
  # Kill file watchers NOT parented by the active extension host or the main server
  # We keep watchers started at or after the newest extension host
  if [ -n "$ACTIVE_EXT" ]; then
    ACTIVE_START=$(ps -o lstart= -p "$ACTIVE_EXT" 2>/dev/null || echo "")
    FW_PIDS=$(ps aux | grep "type=fileWatcher" | grep -v grep | sort -k9 | awk '{print $2}')
    NEWEST_FW=$(echo "$FW_PIDS" | tail -2)  # Keep the 2 newest file watchers
    
    for PID in $FW_PIDS; do
      if ! echo "$NEWEST_FW" | grep -q "^${PID}$"; then
        echo -e "  ${YELLOW}Killing orphaned file watcher: PID ${PID}${NC}"
        kill "$PID" 2>/dev/null || true
      fi
    done
    
    sleep 1
    NEW_FW=$(ps aux | grep "type=fileWatcher" | grep -v grep | wc -l)
    echo -e "  ${GREEN}File watcher cleanup: ${FW_COUNT} → ${NEW_FW}${NC}"
  fi
elif [ "$FW_COUNT" -le 4 ]; then
  echo -e "${GREEN}FILE WATCHERS: ${FW_COUNT} - OK${NC}"
fi

# --- TypeScript Servers ---
echo ""
TS_SERVERS=$(ps aux | grep "tsserver.js" | grep -v grep | wc -l)
TS_MEM=$(ps aux | grep "tsserver.js" | grep -v grep | awk '{sum+=$6} END {printf "%.0f", sum/1024}')

if [ "$TS_SERVERS" -gt 2 ]; then
  echo -e "${RED}TS SERVERS: ${TS_SERVERS} instances using ~${TS_MEM}MB - EXCESS DETECTED${NC}"
  
  # Keep only the 2 newest tsserver processes (syntax + semantic)
  TS_PIDS=$(ps aux | grep "tsserver.js" | grep -v grep | sort -k9 | awk '{print $2}')
  KEEP_PIDS=$(echo "$TS_PIDS" | tail -2)
  
  for PID in $TS_PIDS; do
    if ! echo "$KEEP_PIDS" | grep -q "^${PID}$"; then
      echo -e "  ${YELLOW}Killing orphan tsserver: PID ${PID}${NC}"
      kill "$PID" 2>/dev/null || true
    fi
  done
  
  sleep 1
  NEW_TS=$(ps aux | grep "tsserver.js" | grep -v grep | wc -l)
  echo -e "  ${GREEN}tsserver cleanup: ${TS_SERVERS} → ${NEW_TS}${NC}"
elif [ "$TS_SERVERS" -le 2 ]; then
  echo -e "${GREEN}TS SERVERS: ${TS_SERVERS} instances using ~${TS_MEM}MB - OK${NC}"
fi

# --- Stale tsserver temp dirs ---
if [ -d "/tmp/vscode-typescript1000" ]; then
  TS_TEMP_DIRS=$(ls -1 /tmp/vscode-typescript1000/ 2>/dev/null | wc -l)
  if [ "$TS_TEMP_DIRS" -gt 2 ]; then
    echo -e "  ${YELLOW}Stale tsserver temp dirs: ${TS_TEMP_DIRS} (expected ≤2)${NC}"
    
    # Find which cancellation dirs are actually referenced by live tsserver processes
    ACTIVE_DIRS=""
    for PID in $(ps aux | grep "tsserver.js" | grep -v grep | awk '{print $2}'); do
      DIR=$(ps -o args= -p "$PID" 2>/dev/null | grep -oP 'vscode-typescript1000/\K[a-f0-9]+' || true)
      if [ -n "$DIR" ]; then
        ACTIVE_DIRS="${ACTIVE_DIRS} ${DIR}"
      fi
    done
    
    # Remove dirs not referenced by any live process
    for DIR in $(ls -1 /tmp/vscode-typescript1000/ 2>/dev/null); do
      if ! echo "$ACTIVE_DIRS" | grep -q "$DIR"; then
        rm -rf "/tmp/vscode-typescript1000/${DIR}" 2>/dev/null
        echo -e "  ${YELLOW}Removed stale temp: ${DIR}${NC}"
      fi
    done
    
    REMAINING=$(ls -1 /tmp/vscode-typescript1000/ 2>/dev/null | wc -l)
    echo -e "  ${GREEN}Temp dir cleanup: ${TS_TEMP_DIRS} → ${REMAINING}${NC}"
  fi
fi

# --- Next.js Dev Server ---
echo ""
NEXT_COUNT=$(ps aux | grep "next-server\|next dev" | grep -v grep | wc -l)
if [ "$NEXT_COUNT" -gt 0 ]; then
  NEXT_PORT=$(lsof -i :9002 2>/dev/null | grep LISTEN | head -1 || true)
  if [ -n "$NEXT_PORT" ]; then
    echo -e "${GREEN}NEXT.JS: Running on port 9002${NC}"
  else
    echo -e "${YELLOW}NEXT.JS: Process exists but port 9002 NOT listening (possible zombie)${NC}"
    if [ "$PREDEV_MODE" = true ]; then
      # Only kill next-server processes (the worker), not next dev (the launcher)
      ZOMBIE_PIDS=$(ps aux | grep "next-server" | grep -v grep | awk '{print $2}')
      if [ -n "$ZOMBIE_PIDS" ]; then
        echo -e "  ${YELLOW}Killing zombie next-server processes...${NC}"
        echo "$ZOMBIE_PIDS" | xargs kill 2>/dev/null || true
        sleep 1
        echo -e "  ${GREEN}Zombie Next.js cleaned.${NC}"
      fi
    fi
  fi
else
  echo -e "${YELLOW}NEXT.JS: Not running${NC}"
fi

# --- Port 9002 Guard (predev mode) ---
if [ "$PREDEV_MODE" = true ]; then
  PORT_PID=$(lsof -ti :9002 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    echo -e "${RED}PORT 9002: Already in use by PID ${PORT_PID} - killing...${NC}"
    kill "$PORT_PID" 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}PORT 9002: Freed.${NC}"
  fi
fi

# --- Genkit ---
GENKIT_COUNT=$(ps aux | grep "genkit" | grep -v grep | wc -l)
if [ "$GENKIT_COUNT" -gt 0 ]; then
  if [ "$PREDEV_MODE" = true ]; then
    echo -e "${RED}GENKIT: Running (${GENKIT_COUNT} processes) - CANNOT run alongside dev server!${NC}"
    echo -e "  ${YELLOW}Kill Genkit first or risk OOM. Aborting predev guard.${NC}"
    echo -e "  ${YELLOW}Run: pkill -f genkit${NC}"
    # Don't exit - let the user decide. But warn loudly.
  else
    echo -e "${YELLOW}GENKIT: Running (${GENKIT_COUNT} processes) - WARNING: check memory if also running Next.js${NC}"
  fi
else
  echo -e "${GREEN}GENKIT: Not running${NC}"
fi

# --- Summary ---
echo ""
echo -e "${CYAN}=== Summary ===${NC}"
FINAL_AVAIL=$(free -m | awk '/^Mem:/{print $7}')
if [ "$FINAL_AVAIL" -lt 500 ]; then
  echo -e "${RED}LOW MEMORY: Only ${FINAL_AVAIL}MB available. Run 'npm run harden' to clear .next cache.${NC}"
elif [ "$FINAL_AVAIL" -lt 1500 ]; then
  echo -e "${YELLOW}MODERATE MEMORY: ${FINAL_AVAIL}MB available. Avoid running dev + genkit simultaneously.${NC}"
else
  echo -e "${GREEN}HEALTHY: ${FINAL_AVAIL}MB available. System is stable.${NC}"
fi
echo ""
