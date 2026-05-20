#!/bin/bash
# Logs memory and CPU usage every 5 seconds
echo "timestamp,mem_used_mb,cpu_used_pct" > resource-usage.log
while true; do
  ts=$(date -Iseconds)
  mem=$(free -m | awk '/^Mem:/ {print $3}')
  cpu=$(top -bn1 | grep "Cpu(s)" | awk '{print $2 + $4}')
  echo "$ts,$mem,$cpu" >> resource-usage.log
  sleep 5
done
