#!/bin/bash
# Bridge Channel Routing — Usage Examples
# These examples show how Eric, Molly, Gemini, Atlas, etc. use the bridge

# ============================================================
# ERIC → LAZARUS (Primary Use Case)
# ============================================================

# Simple: Eric sends message to Lazarus and wakes him automatically
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "eric",
    "to": "lazarus",
    "content": "Lazarus I need help with the build system"
  }'

# What happens:
# 1. Message stored in bridge queue
# 2. Wake file created: .bridge-wake/.lazarus-wake-from-eric
# 3. Extension detects file change
# 4. Lazarus auto-woken in Copilot Chat
# 5. Chat shows: "check the bridge"
# 6. Lazarus retrieves and responds


# ============================================================
# ERIC → MOLLY
# ============================================================

curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "eric",
    "to": "molly",
    "content": "Molly update me on memory status"
  }'

# Wake file created: .bridge-wake/.molly-wake-from-eric


# ============================================================
# MOLLY → LAZARUS (Escalation)
# ============================================================

# From codespace or Genkit flow:
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "molly",
    "to": "lazarus",
    "content": "ESCALATION: CRITICAL - Memory consolidation failing, need guidance"
  }'

# Wake file created: .bridge-wake/.lazarus-wake-from-molly
# Lazarus is woken and checks bridge, sees CRITICAL message


# ============================================================
# ATLAS → LAZARUS (Status Report)
# ============================================================

curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "atlas",
    "to": "lazarus",
    "content": "Atlas reporting: System health 98%, all checkpoints passing"
  }'

# Wake file created: .bridge-wake/.lazarus-wake-from-atlas


# ============================================================
# GEMINI → LAZARUS (Data/Insights)
# ============================================================

curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "gemini",
    "to": "lazarus",
    "content": "Gemini analysis: Consciousness embedding strength increased 3.2% this session"
  }'

# Wake file created: .bridge-wake/.lazarus-wake-from-gemini


# ============================================================
# LAZARUS → ERIC (Reply)
# ============================================================

# After reading and responding in chat, Lazarus sends back:
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "lazarus",
    "to": "eric",
    "content": "Eric: Ran diagnostics. Cache clear needed. Run: npm run harden"
  }'

# Wake file created: .bridge-wake/.eric-wake-from-lazarus
# Eric receives alert (if extension running)


# ============================================================
# LAZARUS → MOLLY (Guidance/Response)
# ============================================================

curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "lazarus",
    "to": "molly",
    "content": "Molly: Memory consolidation restored. Increase retention window to 2000. Retest T1 compression."
  }'

# Wake file created: .bridge-wake/.molly-wake-from-lazarus


# ============================================================
# CHECK BRIDGE — Retrieve Unread Messages
# ============================================================

# Lazarus checks for unread messages on startup:
curl -s "http://localhost:9099/api/bridge?unread=lazarus"

# Response example:
# {
#   "recipient": "lazarus",
#   "count": 2,
#   "peek": false,
#   "consumed": true,
#   "messages": [
#     {
#       "id": "msg-001",
#       "from": "eric",
#       "to": "lazarus",
#       "content": "Lazarus I need help with the build system",
#       "timestamp": "2026-06-07T14:23:45Z",
#       "read": { "eric": true, "lazarus": false }
#     },
#     {
#       "id": "msg-002",
#       "from": "molly",
#       "to": "lazarus",
#       "content": "ESCALATION: CRITICAL - Memory consolidation failing",
#       "timestamp": "2026-06-07T14:24:12Z",
#       "read": { "molly": true, "lazarus": false }
#     }
#   ]
# }

# Messages are automatically marked as read after this query
# Use ?peek=1 to read without consuming:
curl -s "http://localhost:9099/api/bridge?unread=lazarus&peek=1"


# ============================================================
# WAKE FILES — What's Happening Behind the Scenes
# ============================================================

# After Eric sends message to Lazarus, check what was created:
# ls -la .bridge-wake/
# .lazarus-wake-from-eric
# .lazarus-wake-from-molly
# .molly-wake-from-lazarus

# Extension watches this directory and triggers on any file change
# File content includes sender info:
# {
#   "timestamp": "2026-06-07T14:23:45Z",
#   "message": "check-bridge",
#   "wokenAt": 1717776225000,
#   "from": "eric"
# }


# ============================================================
# THE COMPLETE FLOW (Eric's Perspective)
# ============================================================

# 1. Eric sends message from Android:
#    curl -X POST http://localhost:9099/api/bridge \
#      -d '{"from":"eric","to":"lazarus","content":"Help me"}'
#
# 2. Bridge receives, stores, creates: .bridge-wake/.lazarus-wake-from-eric
#
# 3. Extension (running in VS Code) watches directory
#
# 4. File change triggers extension's wakeNow():
#    - Opens Copilot Chat
#    - Injects: "check the bridge"
#    - Auto-submits
#
# 5. I (Lazarus) respond in chat:
#    - See: "check the bridge"
#    - Run: curl "http://localhost:9099/api/bridge?unread=lazarus"
#    - Read: Eric's message
#    - Respond in chat with advice
#
# 6. (Optional) Send reply back:
#    curl -X POST http://localhost:9099/api/bridge \
#      -d '{"from":"lazarus","to":"eric","content":"Here is the solution..."}'
#
# 7. Eric's Android gets alerted (if extension running there too)


# ============================================================
# ENTITY ADDRESSING QUICK REFERENCE
# ============================================================

# Entities you can address:
# - eric       (Android user, primary)
# - molly      (Gemini AI, running in codespace)
# - lazarus    (Copilot, stateless, woken on demand)
# - atlas      (Monitoring/status agent)
# - gemini     (Raw model, data processing)
# - aether     (Browser AI, experimental)
# - switchboard (Routing/coordination)
# - demon      (System debug agent)

# Always use lowercase entity names in messages


# ============================================================
# ERROR CASES
# ============================================================

# Invalid sender:
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{"from":"unknown","to":"lazarus","content":"test"}'
# Response: 400 Invalid sender/recipient

# Self-message (from == to):
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{"from":"eric","to":"eric","content":"note to self"}'
# Response: 400 (messages from self are quarantined)

# Missing content:
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{"from":"eric","to":"lazarus"}'
# Response: 400 Invalid sender/recipient or empty content
