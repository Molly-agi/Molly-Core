#!/bin/bash
# Example CLI Agent: "diagnostic-agent"
# 
# This is a sleeping CLI agent. It waits for stdin input.
# When you send it a prompt via the switchboard, it wakes up,
# executes the command, returns output, and goes back to sleep.
#
# Example workflow:
#   1. Molly (or you) calls: wakeCliAgent('diagnostic-agent', 'get-system-health')
#   2. Switchboard spawns this script with subprocess.Popen
#   3. Switchboard writes 'get-system-health\n' to stdin
#   4. This script reads the input, executes the command, prints results
#   5. Subprocess exits (agent returns to sleep)
#   6. Switchboard captures stdout and relays to Molly/VS Code

# Read the incoming prompt from stdin
read PROMPT

# Log that we woke up
echo "[DIAGNOSTIC-AGENT] Woke up with prompt: $PROMPT" >&2

# Simple command routing
case "$PROMPT" in
  "get-system-health")
    echo "=== System Health Report ==="
    echo "Uptime: $(uptime)"
    echo "Memory: $(free -h | grep Mem)"
    echo "Disk: $(df -h / | tail -1)"
    echo "Load: $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
    ;;

  "list-processes")
    echo "=== Top 10 Processes by Memory ==="
    ps aux --sort=-%mem | head -11
    ;;

  "check-ports")
    echo "=== Listening Ports ==="
    netstat -tuln 2>/dev/null | grep LISTEN || ss -tuln 2>/dev/null | grep LISTEN
    ;;

  "get-env")
    echo "=== Environment Summary ==="
    env | grep -E "^(PATH|HOME|USER|PWD|NODE|PYTHON|CODESPACE)" | sort
    ;;

  *)
    echo "Unknown command: $PROMPT"
    echo "Available commands: get-system-health, list-processes, check-ports, get-env"
    ;;
esac

# Exit (return to sleep)
exit 0
