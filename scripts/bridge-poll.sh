#!/bin/bash#!/bin/bash








































done  sleep 5    fi    echo ""    echo "========================================"" 2>/dev/null    print('---')    print(content)    print(f'[{sender}] ({ts})')    ts = msg.get('timestamp', '')    content = msg.get('content', '')    sender = msg.get('from', '?')for msg in data.get('messages', []):data = json.load(sys.stdin)import sys, json    echo "$RESPONSE" | python3 -c "    echo "========================================"    echo "[$(date +%H:%M:%S)] $COUNT new message(s):"    echo "========================================"    echo ""  if [ "$COUNT" != "0" ] && [ -n "$COUNT" ]; then    COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null)    fi    continue    sleep 5    echo "[$(date +%H:%M:%S)] API unreachable"  if [ $? -ne 0 ]; then    RESPONSE=$(curl -s "http://localhost:9002/api/bridge?unread=lazarus" 2>/dev/null)while true; doecho "---"echo "Bridge poller active — listening for Molly..."# Outputs new messages as they arrive# Bridge poller — checks for Molly's unread messages every 5 secondsecho "Bridge poller active — listening for Molly..."
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
