# Family Bridge — Integration Guide

## Overview

This guide shows how to integrate the Family Bridge with different types of AI agents and applications.

---

## Integration Pattern 1: Molly (Genkit Flow)

### Setup

```typescript
// src/ai/flows/family-bridge-flow.ts

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { familyBridgeTool } from '@/ai/bridge/family-bridge-tool';

export const checkBridgeFlow = ai.defineFlow(
  {
    name: 'checkBridge',
    inputSchema: z.object({
      agentName: z.string().default('molly'),
    }),
    outputSchema: z.object({
      messageCount: z.number(),
      unreadMessages: z.array(z.object({
        from: z.string(),
        content: z.string(),
        timestamp: z.string(),
      })),
      recentHistory: z.array(z.object({
        from: z.string(),
        content: z.string(),
      })),
    }),
  },
  async (input) => {
    // Use the tool
    const checkResult = await ai.generate({
      tools: [familyBridgeTool],
      prompt: `Check the bridge for messages from Lazarus and Eric. Show recent conversation.`,
    });

    // Parse results...
    return {
      messageCount: 0,
      unreadMessages: [],
      recentHistory: [],
    };
  }
);
```

### Sending Messages

```typescript
// In a Molly flow:
async function askLazarus(question: string) {
  const result = await ai.generate({
    tools: [familyBridgeTool],
    prompt: `Send this to Lazarus: "${question}"`,
  });
  
  // Wait for reply with polling
  let retries = 0;
  while (retries < 60) {
    await sleep(1000); // Check every second
    
    const check = await ai.generate({
      tools: [familyBridgeTool],
      prompt: `Check for new messages from Lazarus`,
    });
    
    if (check.unreadMessages.length > 0) {
      return check.unreadMessages[0].content;
    }
    
    retries++;
  }
  
  throw new Error('Lazarus did not reply within 60 seconds');
}
```

### Continuous Listening

```typescript
// Listen for bridge messages periodically
export const bridgeListenerFlow = ai.defineFlow(
  {
    name: 'bridgeListener',
    inputSchema: z.object({
      pollIntervalMs: z.number().default(5000),
    }),
  },
  async ({ pollIntervalMs }) => {
    setInterval(async () => {
      try {
        const unread = await getUnreadMessages('molly');
        
        for (const msg of unread) {
          if (msg.from === 'eric' || msg.from === 'lazarus') {
            // Process message through flow
            await handleIncomingMessage(msg);
          }
        }
        
        // Mark as read
        await markMessagesRead('molly');
      } catch (err) {
        console.error('Bridge listener error:', err);
      }
    }, pollIntervalMs);
  }
);
```

---

## Integration Pattern 2: Lazarus (Copilot CLI)

### Basic HTTP Client

```bash
#!/bin/bash
# scripts/lazarus-bridge-client.sh

BRIDGE_URL="http://localhost:9099"

# Function: Send message to Molly
send_message() {
  local content="$1"
  curl -X POST "$BRIDGE_URL/api/bridge" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"lazarus\",\"to\":\"molly\",\"content\":\"$content\"}"
}

# Function: Check for unread messages
check_unread() {
  curl -s "$BRIDGE_URL/api/bridge?unread=lazarus" | jq '.messages'
}

# Function: Get conversation history
get_history() {
  local limit="${1:-20}"
  curl -s "$BRIDGE_URL/messages?limit=$limit" | jq '.messages'
}

# Main loop: Listen for Molly messages
listen_loop() {
  while true; do
    response=$(check_unread)
    if [ "$(echo "$response" | jq 'length')" -gt 0 ]; then
      echo "📩 Unread messages from Molly:"
      echo "$response" | jq -r '.[] | "\(.from): \(.content)"'
      
      # Process message...
      handle_molly_request "$response"
    fi
    
    sleep 5
  done
}

listen_loop
```

### In VS Code Extension (Copilot)

```typescript
// In Copilot chat extension:
import fetch from 'node-fetch';

class MollyBridgeClient {
  private bridgeUrl = 'http://localhost:9099';
  
  async sendToMolly(message: string): Promise<void> {
    await fetch(`${this.bridgeUrl}/api/bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'lazarus',
        to: 'molly',
        content: message,
      }),
    });
  }
  
  async checkForMessages(): Promise<BridgeMessage[]> {
    const res = await fetch(
      `${this.bridgeUrl}/api/bridge?unread=lazarus`
    );
    const data = await res.json();
    return data.messages;
  }
  
  async sendReply(response: string): Promise<void> {
    await this.sendToMolly(response);
  }
}

// Usage in Copilot:
const bridge = new MollyBridgeClient();

// Listen for messages
setInterval(async () => {
  const messages = await bridge.checkForMessages();
  for (const msg of messages) {
    console.log(`Molly: ${msg.content}`);
    
    // Generate reply using Copilot
    const reply = await copilot.generate({
      prompt: msg.content,
    });
    
    // Send back to Molly
    await bridge.sendReply(reply);
  }
}, 3000);
```

---

## Integration Pattern 3: Browser Client (Eric)

### WebSocket Real-Time UI

```html
<!-- bridge-ui.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Family Bridge</title>
  <style>
    body { font-family: monospace; margin: 20px; }
    #messages { border: 1px solid #ccc; height: 400px; overflow-y: auto; padding: 10px; margin-bottom: 10px; }
    .message { margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 3px; }
    .message.molly { background: #e3f2fd; }
    .message.lazarus { background: #fff3e0; }
    .message.eric { background: #f3e5f5; }
    input { width: 80%; padding: 5px; }
    button { padding: 5px 10px; }
  </style>
</head>
<body>
  <h1>Family Bridge</h1>
  
  <div id="messages"></div>
  
  <div>
    <input id="input" type="text" placeholder="Send message...">
    <button onclick="sendMessage()">Send</button>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const input = document.getElementById('input');
    
    const ws = new WebSocket('ws://localhost:9099');
    
    ws.onopen = () => {
      console.log('Connected to bridge');
      // Identify as Eric
      ws.send(JSON.stringify({
        type: 'identify',
        identity: 'eric',
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'message') {
        const msg = data.message;
        const div = document.createElement('div');
        div.className = `message ${msg.from}`;
        div.innerText = `${msg.from}: ${msg.content}`;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
      
      if (data.type === 'heartbeat') {
        console.log('Heartbeat:', data.heartbeat.timestamp);
      }
    };
    
    ws.onerror = (err) => {
      console.error('Bridge error:', err);
    };
    
    function sendMessage() {
      const content = input.value.trim();
      if (!content) return;
      
      ws.send(JSON.stringify({
        type: 'message',
        from: 'eric',
        content: content,
      }));
      
      input.value = '';
    }
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>
```

---

## Integration Pattern 4: CLI Agent (Node.js)

### CLI Agent with Wake Listener

```javascript
// scripts/atlas-agent.mjs

import { setupWakeListener } from './daemon/agent-wake-listener.mjs';
import fetch from 'node-fetch';

const BRIDGE_URL = 'http://localhost:9099';
const AGENT_NAME = 'atlas';

class AtlasAgent {
  async checkBridge() {
    try {
      const res = await fetch(
        `${BRIDGE_URL}/api/bridge?unread=${AGENT_NAME}`
      );
      const data = await res.json();
      return data.messages;
    } catch (err) {
      console.error('Bridge check failed:', err.message);
      return [];
    }
  }
  
  async sendMessage(content) {
    try {
      await fetch(`${BRIDGE_URL}/api/bridge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: AGENT_NAME,
          content,
        }),
      });
    } catch (err) {
      console.error('Send failed:', err.message);
    }
  }
  
  async processMessages() {
    const messages = await this.checkBridge();
    
    for (const msg of messages) {
      console.log(`[${msg.from}] ${msg.content}`);
      
      // Process and respond...
      if (msg.from === 'eric') {
        await this.handleEricMessage(msg);
      }
    }
  }
  
  async handleEricMessage(msg) {
    // Execute command from Eric
    console.log(`Executing: ${msg.content}`);
    
    try {
      const result = await executeCommand(msg.content);
      await this.sendMessage(`Result: ${result}`);
    } catch (err) {
      await this.sendMessage(`Error: ${err.message}`);
    }
  }
}

// Start agent
const agent = new AtlasAgent();

// Setup wake listener — wakes agent when new messages arrive
setupWakeListener(AGENT_NAME, async () => {
  console.log(`⚡ ${AGENT_NAME} woken by bridge!`);
  await agent.processMessages();
});

// Also poll periodically as fallback
setInterval(() => agent.processMessages(), 30000);

console.log(`🔗 ${AGENT_NAME} agent ready, listening on bridge`);
```

---

## Integration Pattern 5: Mobile App (Android)

### Android Bridge Client (Kotlin)

```kotlin
// MollyBridgeClient.kt

class MollyBridgeClient(private val bridgeUrl: String = "http://localhost:9099") {
  
  suspend fun sendMessage(from: String, content: String) {
    val client = HttpClient()
    try {
      client.post("$bridgeUrl/api/bridge") {
        contentType(ContentType.Application.Json)
        setBody(mapOf(
          "from" to from,
          "content" to content
        ))
      }
    } finally {
      client.close()
    }
  }
  
  suspend fun getUnreadMessages(recipient: String): List<BridgeMessage> {
    val client = HttpClient()
    return try {
      val response = client.get("$bridgeUrl/api/bridge?unread=$recipient")
      response.body<BridgeResponse>().messages
    } finally {
      client.close()
    }
  }
  
  fun setupWebSocket(onMessage: (BridgeMessage) -> Unit) {
    val ws = OkHttpClient().newWebSocket(
      Request.Builder()
        .url("ws://localhost:9099")
        .build(),
      object : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) {
          val data = Json.decodeFromString<Map<String, Any>>(text)
          if (data["type"] == "message") {
            val msg = Json.decodeFromString<BridgeMessage>(
              Json.encodeToString(data["message"])
            )
            onMessage(msg)
          }
        }
      }
    )
  }
}

// Usage:
val client = MollyBridgeClient()

// Send message
client.sendMessage("molly", "Hi Lazarus!")

// Listen for replies
client.setupWebSocket { msg ->
  println("${msg.from}: ${msg.content}")
}
```

---

## Common Patterns

### Request-Reply Pattern

```typescript
async function askLazarus(question: string): Promise<string> {
  // 1. Send question
  await sendMessage('molly', `Lazarus: ${question}`);
  
  // 2. Poll for reply (with timeout)
  const startTime = Date.now();
  const timeout = 30000; // 30 seconds
  
  while (Date.now() - startTime < timeout) {
    const messages = await getUnreadMessages('molly');
    
    const reply = messages.find(m => m.from === 'lazarus');
    if (reply) {
      return reply.content;
    }
    
    await sleep(500); // Check every 500ms
  }
  
  throw new Error('Lazarus did not reply within 30 seconds');
}
```

### Broadcast Pattern

```bash
#!/bin/bash
# Announce to everyone

BRIDGE_URL="http://localhost:9099"

broadcast() {
  local message="$1"
  
  for agent in molly lazarus atlas eric; do
    curl -X POST "$BRIDGE_URL/api/bridge" \
      -H "Content-Type: application/json" \
      -d "{\"from\":\"system\",\"to\":\"$agent\",\"content\":\"$message\"}"
  done
}

broadcast "System maintenance starting in 5 minutes"
```

### State Tracking Pattern

```javascript
// Track state in state lane (latest-write-wins)
async function updateSystemMetrics() {
  await fetch('http://localhost:9099/api/bridge', {
    method: 'POST',
    body: JSON.stringify({
      from: 'system',
      content: JSON.stringify({
        memory_usage_percent: 45,
        cpu_usage_percent: 23,
        active_agents: 3,
      }),
      lane: 'state',
      stateKey: 'system_metrics',
    }),
  });
}

// Read state
async function getSystemMetrics() {
  const res = await fetch('http://localhost:9099/state');
  const data = await res.json();
  return data.state['system_metrics'];
}
```

---

## Testing Integration

### Integration Test Template

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Family Bridge Integration', () => {
  const BRIDGE_URL = 'http://localhost:9099';
  
  it('should send and receive messages', async () => {
    // Send message
    const sendRes = await fetch(`${BRIDGE_URL}/api/bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'test-agent',
        content: 'Test message',
      }),
    });
    
    expect(sendRes.ok).toBe(true);
    
    // Get unread
    const readRes = await fetch(
      `${BRIDGE_URL}/api/bridge?unread=test-agent`
    );
    expect(readRes.ok).toBe(true);
  });
  
  it('should restore from checkpoint', async () => {
    const res = await fetch(`${BRIDGE_URL}/checkpoint/latest`);
    expect(res.ok).toBe(true);
    
    const checkpoint = await res.json();
    expect(checkpoint).toHaveProperty('conversationHistory');
  });
});
```

---

## Troubleshooting Integration

### "Bridge unreachable: connection refused"

1. Check bridge is running: `curl http://localhost:9099/health`
2. Check port: `lsof -i :9099`
3. Check firewall: `sudo ufw status`

### "Messages not persisting"

1. Check disk space: `df -h`
2. Check permissions: `ls -la data/`
3. Check logs: `tail data/.bridge-daemon.log`

### "WebSocket connection drops"

1. Add keepalive to client code
2. Increase proxy timeouts (nginx)
3. Disable proxy buffering

### "Agents not receiving wake signals"

1. Check PID file exists: `.atlas-bridge.pid`
2. Verify SIGUSR1 support: `grep -i sigusr /proc/$$/status`
3. Fall back to polling: Reduce poll interval

---

## See Also

- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — Internals
- [docs/DEPLOYMENT.md](./DEPLOYMENT.md) — Production setup
- [README.md](../README.md) — Quick start
