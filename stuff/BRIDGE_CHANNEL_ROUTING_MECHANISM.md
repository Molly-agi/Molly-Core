# Bridge Channel Routing Mechanism
**Recorded: 2026-06-07 | Status: Pre-Implementation Specification**

---

## System Overview

A **channel-based message routing system** that allows multiple entities (Eric, Molly, Gemini, Atlas, future entities) to send addressed messages to specific recipients (Lazarus, others) with automatic wake signaling and auto-reply integration.

The system fixes the core messaging problem: explicit addressing instead of keyword guessing. It works across disconnected entities, supports bidirectional communication, and wakes sleeping Copilot instances automatically.

---

## Architecture

### Core Principle
**One new field solves everything:** Add `"to"` to bridge messages.

Messages are now:
```json
{
  "from": "sender-name",
  "to": "recipient-name",
  "content": "message content"
}
```

### Components

#### 1. Bridge Daemon (`scripts/bridge-daemon.mjs`)
- **Port:** 9099
- **Role:** Central message router and queue
- **Key Logic:**
  - Receives messages with `from`, `to`, `content`
  - Stores messages in memory queue (per recipient)
  - Triggers wake signals when messages arrive for sleeping instances
  - Provides retrieval endpoints

#### 2. Wake Signal System
- **Mechanism:** File-based using `fs.watchFile()`
- **Location:** `.bridge-wake/` directory
- **Format:** One file per wake event: `.bridge-wake/.{recipient}-wake-from-{sender}`
  - `.bridge-wake/.lazarus-wake-from-eric`
  - `.bridge-wake/.lazarus-wake-from-molly`
  - `.bridge-wake/.lazarus-wake-from-atlas`
  - `.bridge-wake/.molly-wake-from-lazarus`
  - etc.

#### 3. VS Code Extension (`lazarus-waker-extension/extension.js`)
- **Role:** Watches wake files and triggers Copilot Chat auto-response
- **Activation:** `onStartupFinished`
- **Watch Interval:** 500ms polling on `.bridge-wake/` directory
- **Behavior on Wake:**
  1. Opens Copilot Chat
  2. Auto-populates message: "check the bridge"
  3. Auto-submits to chat
  4. Displays status: "⚡ Lazarus Woken"
- **Cooldown:** 5 seconds (prevents rapid re-triggering)

---

## Message Flow

### Eric → Lazarus (Primary Use Case)

```
1. Eric sends from Android:
   curl -X POST "http://localhost:9099/api/bridge" \
     -H "Content-Type: application/json" \
     -d '{"from":"eric","to":"lazarus","content":"Lazarus help me"}'

2. Bridge daemon receives, stores message, creates wake file:
   - Message queued: messages["lazarus"].push({from:"eric", content:"..."})
   - File created: touch .bridge-wake/.lazarus-wake-from-eric

3. Extension watches directory, detects file change, triggers wake sequence:
   - Open Copilot Chat
   - Inject "check the bridge" message
   - Auto-submit

4. I (Lazarus) respond in chat:
   - Chat appears: "check the bridge"
   - I respond with advice/information

5. (Optional) I send reply back to bridge:
   - Bridge API call sends message back to Eric
   - File created: touch .bridge-wake/.eric-wake-from-lazarus
   - If Eric's extension is watching, he gets alerted
```

### Molly → Lazarus

```
1. Molly (running in same codespace) sends:
   curl -X POST "http://localhost:9099/api/bridge" \
     -d '{"from":"molly","to":"lazarus","content":"Lazarus I need guidance"}'

2. Wake file created: .bridge-wake/.lazarus-wake-from-molly

3. Extension wakes me, I check bridge and see:
   - Message from Molly with full context
   - I respond in chat, then optionally reply to bridge

4. I send back:
   curl -X POST "http://localhost:9099/api/bridge" \
     -d '{"from":"lazarus","to":"molly","content":"Here is the guidance..."}'
```

### Gemini → Lazarus / Atlas → Lazarus

Same pattern as Molly. Any entity can address messages to any recipient.

---

## API Endpoints

### POST /api/bridge
**Send a message**
```bash
curl -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "eric",
    "to": "lazarus",
    "content": "your message"
  }'
```

Response: `{"success": true, "queued": 1}`

### GET /api/bridge?unread={recipient}
**Retrieve unread messages for a recipient**
```bash
curl "http://localhost:9099/api/bridge?unread=lazarus"
```

Response:
```json
{
  "count": 2,
  "messages": [
    {
      "id": "msg-001",
      "from": "eric",
      "content": "Lazarus help me",
      "timestamp": "2026-06-07T12:34:56Z",
      "read": false
    },
    {
      "id": "msg-002",
      "from": "molly",
      "content": "Lazarus I need guidance",
      "timestamp": "2026-06-07T12:35:10Z",
      "read": false
    }
  ]
}
```

### GET /api/bridge?channel={from}-{to}
**Retrieve messages in a specific channel**
```bash
curl "http://localhost:9099/api/bridge?channel=eric-lazarus"
```

Response: All messages between Eric and Lazarus

### POST /api/bridge/mark-read
**Mark messages as read**
```bash
curl -X POST "http://localhost:9099/api/bridge/mark-read" \
  -d '{"messageIds": ["msg-001", "msg-002"]}'
```

---

## Configuration Files

### `.bridge-wake/.gitkeep`
Empty marker file to ensure directory is tracked in git.

### `.bridge-wake/` Directory Structure
```
.bridge-wake/
  .lazarus-wake-from-eric
  .lazarus-wake-from-molly
  .molly-wake-from-lazarus
  .atlas-wake-from-lazarus
  (one file per wake event)
```

Wake files are ephemeral—they're touched to signal, then can be cleaned up after 5 seconds (cooldown).

---

## Extension Integration

### File Watching
```javascript
const watcher = fs.watchFile(WAKE_DIR, { persistent: true, interval: 500 }, (curr, prev) => {
  if (curr.mtime > prev.mtime) {
    wakeNow();
  }
});
```

### Message Injection
```javascript
const MSG = "check the bridge";
await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.claude-code', { prompt: MSG });
```

### Auto-Submit
```javascript
await vscode.commands.executeCommand('workbench.action.chat.submit');
```

---

## Entities and Their Wake Files

| Entity  | Wake Files                                      | Purpose                      |
|---------|------------------------------------------------|------------------------------|
| Eric    | `.lazarus-wake-from-eric`                      | Alerts me Eric has a message |
| Molly   | `.lazarus-wake-from-molly`                     | Alerts me Molly needs me     |
| Gemini  | `.lazarus-wake-from-gemini`                    | Alerts me Gemini has data    |
| Atlas   | `.lazarus-wake-from-atlas`                     | Alerts me Atlas is reporting |
| Lazarus | `.eric-wake-from-lazarus`, `.molly-wake-from-lazarus`, etc. | I alert others when responding |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Bridge Message Route                      │
└─────────────────────────────────────────────────────────────┘

Eric/Molly/Gemini/Atlas
        │
        ├─→ POST /api/bridge
        │   {"from":"sender","to":"lazarus","content":"..."}
        │
        ├─→ Bridge Daemon
        │   • Store message in queue
        │   • Create wake file: .bridge-wake/.lazarus-wake-from-{sender}
        │
        ├─→ File System Event
        │   fs.watchFile detects mtime change
        │
        ├─→ VS Code Extension
        │   • Triggers on file change
        │   • Opens Copilot Chat
        │   • Injects "check the bridge"
        │   • Auto-submits
        │
        └─→ Lazarus (Me)
            • Chat shows "check the bridge"
            • I retrieve: curl "http://localhost:9099/api/bridge?unread=lazarus"
            • I read messages and respond
            • (Optional) I send reply back: POST /api/bridge
```

---

## Example Sequences

### Sequence 1: Eric wakes Lazarus for help

```
Time: 12:00:00

Eric's Android:
$ curl -X POST "http://localhost:9099/api/bridge" \
  -d '{"from":"eric","to":"lazarus","content":"Lazarus I need help with the build system"}'

Bridge:
✓ Message queued for lazarus
✓ Wake file created: .bridge-wake/.lazarus-wake-from-eric

Lazarus Extension:
✓ File change detected at 12:00:02
✓ Cooldown passed (last wake 12:00:00)
✓ Open Copilot Chat
✓ Inject "check the bridge"
✓ Auto-submit

Lazarus (in chat):
✓ See: "check the bridge"
✓ Run: curl "http://localhost:9099/api/bridge?unread=lazarus"
✓ Read: "Eric needs help with the build system"
✓ Respond: [type response in chat]
✓ (Optional) Send to Eric: 
  curl -X POST "http://localhost:9099/api/bridge" \
    -d '{"from":"lazarus","to":"eric","content":"Try npm run harden first..."}'
```

### Sequence 2: Molly escalates to Lazarus

```
Molly (running in codespace):
$ curl -X POST "http://localhost:9099/api/bridge" \
  -d '{"from":"molly","to":"lazarus","content":"ESCALATION: CRITICAL - Memory consolidation failing"}'

Bridge:
✓ Message queued
✓ Wake file: .bridge-wake/.lazarus-wake-from-molly

Lazarus:
✓ Woken by extension
✓ Check bridge: curl "http://localhost:9099/api/bridge?unread=lazarus"
✓ See CRITICAL message from Molly
✓ Prioritize and respond
✓ Send guidance back to Molly
```

---

## Advantages Over Previous Keyword System

| Aspect | Keyword System | Channel Routing |
|--------|----------------|-----------------|
| Addressing | Guessed from content ("lazarus" keyword) | Explicit (`"to"` field) |
| Multi-recipient | Not supported | Fully supported |
| Sender identification | Implicit or guessed | Explicit (`"from"` field) |
| Wake signaling | Single file | One file per sender-recipient pair |
| Scalability | Limited | Unlimited entities |
| Message ordering | No | Yes (timestamp) |
| Error handling | Ambiguous | Clear |

---

## Setup Checklist

- [ ] Bridge daemon updated to parse `to` field
- [ ] Wake file creation logic: `.bridge-wake/.{to}-wake-from-{from}`
- [ ] Wake file directory created and tracked in git
- [ ] Extension continues watching `.bridge-wake/` for any file changes
- [ ] Extension cooldown remains 5 seconds
- [ ] API endpoint returns messages by recipient (`/api/bridge?unread={recipient}`)
- [ ] Test flow: Eric → Lazarus → Response
- [ ] Test flow: Molly → Lazarus → Response
- [ ] Document entity registry (who can send to whom)

---

## Notes for Future Development

1. **Persistence:** Consider upgrading from in-memory queue to file-based or database-backed storage
2. **Message History:** Add archival for completed conversations
3. **Entity Registry:** Maintain a canonical list of all entities and their capabilities
4. **Rate Limiting:** Implement per-sender limits to prevent spam
5. **Encryption:** Add message signing/encryption for sensitive communications
6. **Multi-session Support:** Route messages to specific Copilot instances (not just "lazarus")

---

## This Mechanism Is Yours

This document exists so that if anything happens—hardware failure, Codespace wipe, system rebuild—you have a clear technical specification to rebuild from. It's not pseudo-code. It's not vague. It's the exact architecture.

If you ever need to hand this to another developer, or rebuild it yourself, this file is your blueprint.

**Keep it safe. Version it. You own this.**
