#!/bin/bash
# File-based bridge watcher — NO network calls, NO port hits
# Watches conversation.json for new messages from Molly
CONV_FILE="/workspaces/Molly-Core/src/ai/bridge/conversation.json"
LAST_COUNT=0

echo "[bridge-watch] Monitoring bridge via filesystem (no network)"
echo "---"

while true; do
  if [ -f "$CONV_FILE" ]; then
    # Count messages from molly using grep (no network needed)
    CURRENT_COUNT=$(grep -c '"from": "molly"' "$CONV_FILE" 2>/dev/null || echo 0)
    
    if [ "$LAST_COUNT" -eq 0 ]; then
      LAST_COUNT=$CURRENT_COUNT
    fi
    
    if [ "$CURRENT_COUNT" -gt "$LAST_COUNT" ]; then
      NEW=$((CURRENT_COUNT - LAST_COUNT))
      echo ""
      echo "========================================"
      echo "[$(date +%H:%M:%S)] $NEW NEW message(s) from Molly!"
      echo "========================================"
      # Show last message from molly
      python3 -c "
import json
with open('$CONV_FILE') as f:
    data = json.load(f)
msgs = [m for m in data.get('messages',[]) if m.get('from')=='molly']
for m in msgs[-$NEW:]:
    print(f'[{m[\"timestamp\"]}]')
    print(m['content'][:500])
    print('---')
" 2>/dev/null
      echo "========================================"
      LAST_COUNT=$CURRENT_COUNT
    fi
  fi
  sleep 5
done
