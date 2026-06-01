#!/bin/bash

# Monitor MMLU benchmark progress and extract final results
LOG_FILE="/workspaces/Molly-Core/mmlu_real_500.log"

echo "═══════════════════════════════════════════════════════════"
echo "       REAL MMLU BENCHMARK - PROGRESS MONITOR"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Watch for completion
while true; do
  # Get progress
  LAST_PROGRESS=$(grep "Progress:" "$LOG_FILE" | tail -1 | grep -oE "[0-9]+/500" || echo "Starting...")
  
  # Check if complete
  if grep -q "✅ Results recorded in Braintrust" "$LOG_FILE" 2>/dev/null; then
    echo "✓ Benchmark complete!"
    break
  fi
  
  echo "[$(date '+%H:%M:%S')] Progress: $LAST_PROGRESS"
  
  # Check for errors
  ERROR_COUNT=$(grep -c '"level":"ERROR"' "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "⚠️  Errors detected: $ERROR_COUNT"
  fi
  
  sleep 15
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "                  EXTRACTING FINAL RESULTS"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Extract results section
tail -100 "$LOG_FILE" | grep -A 100 "REAL MMLU BENCHMARK"

echo ""
echo "Log file: $LOG_FILE"
echo "Lines: $(wc -l < "$LOG_FILE")"
