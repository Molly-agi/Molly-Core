#!/bin/bash

# Monitor MMLU benchmark progress
# Shows live count of questions processed

LOCK_FILE="/tmp/mmlu-monitoring.lock"
OUTPUT_LOG="/tmp/mmlu-progress.log"

# Count current progress by looking at flow completions
count_completed() {
  local output=$(tail -500 /home/codespace/.vscode-remote/data/User/workspaceStorage/-99f82e0-3/GitHub.copilot-chat/chat-session-resources/c9a65ace-ba91-44b6-a2e2-2c91b04e7491/toolu_vrtx_01SHXcDs3AgJeEg6sDtdrq3i__vscode-1779586484278/content.txt 2>/dev/null | grep -c "Flow completed: conversationalChat")
  echo "$output"
}

# Main monitoring loop
while true; do
  completed=$(count_completed)
  pct=$((completed * 100 / 250))
  
  # Print progress bar
  filled=$((pct / 5))
  empty=$((20 - filled))
  bar="["
  for ((i=0; i<filled; i++)); do bar="${bar}="; done
  for ((i=0; i<empty; i++)); do bar="${bar} "; done
  bar="${bar}]"
  
  echo -ne "\r⏳ MMLU Progress: ${bar} ${completed}/250 (${pct}%)"
  
  # Check if done
  if [ $completed -ge 250 ]; then
    echo -e "\n✅ Benchmark complete!"
    break
  fi
  
  sleep 5
done
