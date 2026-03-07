#!/bin/bash
# Bridge poller — checks for Molly's unread messages every 5 seconds
# Outputs new messages as they arrive
echo "Bridge poller active — listening for Molly..."
echo "---"
while true; do
  RESPONSE=$(curl -s "http://localhost:9002/api/bridge?unread=lazarus" 2>/dev/null)
  if [ $? -ne 0 ]; then
    echo "[$(date +%H:%M:%S)] API unreachable"
    sleep 5
    continue
  fi
  COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null)
  if [ "$COUNT" != "0" ] && [ -n "$COUNT" ]; then
    echo ""
    echo "========================================"
    echo "[$(date +%H:%M:%S)] $COUNT new message(s):"
    echo "========================================"
    echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for msg in data.get('messages', []):
    sender = msg.get('from', '?')
    content = msg.get('content', '')
    ts = msg.get('timestamp', '')
    print(f'[{sender}] ({ts})')
    print(content)
    print('---')
" 2>/dev/null
    echo "========================================"
    echo ""
  fi
  sleep 5
done
