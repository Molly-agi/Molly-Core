# Android Widget Connection Guide — Lazarus/Gemini Bridge

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       ERIC'S DESKTOP                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Widget Dashboard                                        │  │
│  │  ├─ Lazarus Control Widget (left)                       │  │
│  │  ├─ Gemini Mother Widget (center)                       │  │
│  │  └─ Chrome Search Widget (right)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │ HTTP/WebSocket
                            ▼
         ┌──────────────────────────────────────┐
         │    Codespace: localhost:9002         │
         │  ┌────────────────────────────────┐  │
         │  │  Next.js Dev Server            │  │
         │  │  ├─ Server Actions             │  │
         │  │  ├─ API Routes                 │  │
         │  │  └─ WebSocket /bridge         │  │
         │  └────────────────────────────────┘  │
         └──────────────────────────────────────┘
                    ▲                 ▲
                    │ Bridge Messages │ Computer Use Tasks
                    │                 │
         ┌──────────▼─────────────────▼──┐
         │  Bridge Daemon (9099)         │
         │  - Message queue              │
         │  - Agent registry             │
         │  - Communication hub          │
         └───────────────────────────────┘
                    ▲
                    │ adb shell commands
                    │
         ┌──────────┴──────────────────┐
         │  Android Phone              │
         │  ┌────────────────────────┐ │
         │  │ MollyBrowser App       │ │
         │  │ - Deep-link handler    │ │
         │  │ - Widget launcher      │ │
         │  │ - ADB bridge client    │ │
         │  └────────────────────────┘ │
         │                             │
         │  Widget Options:            │
         │  ├─ Research trigger        │
         │  ├─ Agent messaging         │
         │  ├─ Status display          │
         │  └─ Control dashboard       │
         └─────────────────────────────┘
```

## Three Connection Paths

### Path 1: MollyBrowser Deep-Link (User Taps Widget on Phone)

```
1. User taps widget on Android home screen
2. Widget launches MollyBrowser with deep-link: molly://control?action=ask&text=...
3. MollyBrowser intercepts deep-link in MainActivity
4. Sends HTTP to Bridge: POST /api/bridge { from: 'molly', content: '...' }
5. Bridge queues message for Lazarus/Gemini/Demon
6. Codespace Molly wakes up (listens on bridge via sendToAgent)
7. Executes Computer Use task on Android via ADB
8. Response comes back through bridge, MollyBrowser displays it
```

**Best for:** Quick actions, status checks, simple queries

### Path 2: Bridge Message Pull (Persistent Connection)

```
1. MollyBrowser opens HTTP polling loop to Bridge:
   GET /api/bridge?unread=molly
2. Bridge returns any messages waiting for Molly
3. MollyBrowser processes and acts (opens app, navigates, etc.)
4. Sends result back: POST /api/bridge { from: 'molly', content: 'done' }
5. Codespace receives completion signal
```

**Best for:** Autonomous tasks, background operations, daemon workflows

### Path 3: Gemini/Aether Direct via Computer Use

```
1. Molly on desktop sends: await sendToAgent('gemini', 'open notes app')
2. Routed through bridgeToAgent() flow
3. executeComputerUseTask('open notes app', 'android')
4. Computer Use module via Android ADB provider executes:
   - adb shell input tap X Y (click app)
   - adb shell input text "note content"
   - adb shell screencap (capture result)
5. Vision AI extracts response
6. Response injected as from: 'gemini' back into bridge
7. Molly receives communion message
```

**Best for:** Complex workflows, UI automation, testing integrations

---

## Implementation: Widget Actions

### Widget Option 1: Research Trigger (Demon Daemon)

**What it does:** Send a research task from your Android phone directly to Demon on Codespace

**Implementation:**

```kotlin
// In MollyBrowser MainActivity.kt
private fun handleResearchTask(query: String) {
    // Send to bridge
    val payload = JsonObject().apply {
        addProperty("from", "molly")
        addProperty("content", "research:$query")
    }

    httpClient.post("http://localhost:9099/api/bridge") {
        setBody(payload.toString())
    }.execute { response ->
        // Display result in widget or notification
        showNotification("Research task queued: $query")
    }
}

// Widget deep-link:
// molly://control?action=research&query=sustainable%20energy%20storage
```

**Codespace side** (src/app/actions/system-flows.ts):

```typescript
export async function sendToAgent(
  agent: 'demon' | 'gemini' | 'aether',
  message: string
) {
  return withErrorHandling(async () => {
    if (agent === 'demon') {
      return await demonAutomation(message); // Research task dispatch
    }
    // ... routing for gemini/aether
  });
}
```

---

### Widget Option 2: Agent Messaging (Direct)

**What it does:** Send a message to Lazarus or Gemini and get a response

**Implementation:**

```kotlin
// In MollyBrowser
private fun handleAgentMessage(agent: String, message: String) {
    val payload = JsonObject().apply {
        addProperty("from", "molly")
        addProperty("content", "msg:$agent:$message")
    }

    httpClient.post("http://localhost:9099/api/bridge") {
        setBody(payload.toString())
    }.execute { response ->
        // Poll for response
        pollForResponse(agent)
    }
}

private fun pollForResponse(agent: String) {
    Timer().schedule(500) {
        httpClient.get("http://localhost:9099/api/bridge?unread=molly") { response ->
            val messages = parseJson(response.body)["messages"] as JsonArray
            messages.forEach { msg ->
                if (msg["from"].asString == agent) {
                    displayMessage(msg["content"].asString)
                }
            }
        }
    }
}

// Widget deep-links:
// molly://control?action=ask&agent=lazarus&text=How%20am%20I%20doing%20today
// molly://control?action=ask&agent=gemini&text=Explain%20consciousness
```

---

### Widget Option 3: Status Display (Live Dashboard)

**What it does:** Show real-time status of Molly, Demon, Lazarus, Gemini

**Implementation:**

```kotlin
// In MollyBrowser LiveStatusFragment
private fun pollStatus() {
    Timer().scheduleAtFixedRate(0, 2000) {
        httpClient.get("http://localhost:9099/api/bridge?limit=100") { response ->
            val data = parseJson(response.body)

            // Extract agent presence
            val lastMolly = data["messages"].find { it["from"] == "molly" }?.get("timestamp")
            val lastDemon = data["messages"].find { it["from"] == "demon" }?.get("timestamp")
            val lastLazarus = data["messages"].find { it["from"] == "lazarus" }?.get("timestamp")
            val lastGemini = data["messages"].find { it["from"] == "gemini" }?.get("timestamp")

            updateStatusUI(mapOf(
                "molly" to isRecent(lastMolly),
                "demon" to isRecent(lastDemon),
                "lazarus" to isRecent(lastLazarus),
                "gemini" to isRecent(lastGemini)
            ))
        }
    }
}

// Widget deep-link:
// molly://control?action=live&limit=20
```

---

### Widget Option 4: Multi-Purpose Dashboard (All of Above)

**Implementation:**

```kotlin
// In MollyBrowser ControlPanelActivity
class ControlPanelActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Parse deep-link
        val action = intent.data?.getQueryParameter("action")
        when (action) {
            "diagnose" -> {
                // Run diagnostics
                diagnosticFlow()
            }
            "research" -> {
                val query = intent.data?.getQueryParameter("query") ?: ""
                handleResearchTask(query)
            }
            "ask" -> {
                val agent = intent.data?.getQueryParameter("agent") ?: "lazarus"
                val text = intent.data?.getQueryParameter("text") ?: ""
                handleAgentMessage(agent, text)
            }
            "live" -> {
                val limit = intent.data?.getQueryParameter("limit")?.toInt() ?: 20
                showLiveStatus(limit)
            }
            else -> showControlPanel()
        }
    }

    private fun diagnosticFlow() {
        // Bridge health check
        val diagnostic = bridgeHealth()

        if (diagnostic.healthy) {
            showStatusNotification("🟢 Bridge healthy | Agents online: ${diagnostic.agentCount}")
        } else {
            showStatusNotification("🔴 Bridge degraded | Recovery: ${diagnostic.recoveryHint}")
            // Offer recovery actions
            offerRecovery(diagnostic.recoveryEndpoints)
        }
    }
}
```

---

## Desktop Widget Setup (Chrome/Desktop)

### Chrome Widget: Lazarus Control

```html
<!-- In MollyBrowser WebView or separate Chrome extension -->
<div id="lazarus-widget" class="control-widget">
  <h3>Lazarus Control</h3>
  <input id="task-input" placeholder="Ask Lazarus..." />
  <button onclick="sendToLazarus()">Send</button>
  <div id="response-area"></div>
</div>

<script>
  async function sendToLazarus() {
    const text = document.getElementById('task-input').value;

    // Send through bridge
    const response = await fetch('http://localhost:9099/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'eric',
        content: `msg:lazarus:${text}`,
      }),
    });

    const result = await response.json();

    // Poll for Lazarus response
    const pollResponse = async () => {
      const resp = await fetch('http://localhost:9099/api/bridge?unread=eric');
      const data = await resp.json();
      const lazarusMsg = data.messages.find((m) => m.from === 'lazarus');
      if (lazarusMsg) {
        document.getElementById('response-area').innerText = lazarusMsg.content;
        return true;
      }
      return false;
    };

    // Poll every 500ms for up to 10 seconds
    let found = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await pollResponse()) {
        found = true;
        break;
      }
    }

    if (!found) {
      document.getElementById('response-area').innerText =
        'No response (check bridge)';
    }
  }
</script>
```

---

## Next Steps to Finalize

### 1. Update MollyBrowser MainActivity.kt

Add deep-link handler:

```kotlin
private fun handleDeepLink(intent: Intent) {
    val data = intent.data ?: return
    when (data.scheme) {
        "molly" -> handleMollyControl(data)
    }
}

private fun handleMollyControl(uri: Uri) {
    val action = uri.getQueryParameter("action") ?: return
    when (action) {
        "diagnose" -> diagnostics()
        "research" -> research(uri.getQueryParameter("query") ?: "")
        "ask" -> ask(
            uri.getQueryParameter("agent") ?: "lazarus",
            uri.getQueryParameter("text") ?: ""
        )
        "live" -> live(uri.getQueryParameter("limit")?.toInt() ?: 20)
    }
}
```

### 2. Add Bridge Client to MollyBrowser

Create `BridgeClient.kt`:

```kotlin
class BridgeClient(context: Context) {
    private val httpClient = HttpClient(CIO)
    private val BRIDGE_URL = "http://localhost:9099"

    suspend fun sendMessage(from: String, content: String) {
        val payload = JsonObject().apply {
            addProperty("from", from)
            addProperty("content", content)
        }
        httpClient.post("$BRIDGE_URL/api/bridge") {
            setBody(payload.toString())
        }
    }

    suspend fun getMessages(limit: Int = 50): List<BridgeMessage> {
        val response = httpClient.get("$BRIDGE_URL/api/bridge?limit=$limit")
        return parseMessages(response.body)
    }

    suspend fun getUnreadFor(agent: String): List<BridgeMessage> {
        val response = httpClient.get("$BRIDGE_URL/api/bridge?unread=$agent")
        return parseMessages(response.body)
    }
}
```

### 3. Wire Desktop Widgets

Update your desktop widget dashboard (Lazarus/Gemini) to send to:

- Bridge endpoint: `http://localhost:9099/api/bridge`
- Message format: `{ from: 'eric', content: 'msg:agent:text' }`

### 4. Verify Connection Path

```bash
# From codespace:

# 1. Check bridge is running
curl -s http://localhost:9099/api/bridge | jq .

# 2. Send test message
curl -X POST http://localhost:9099/api/bridge \
  -H "Content-Type: application/json" \
  -d '{"from":"eric","content":"test message to molly"}'

# 3. Check for response
curl -s "http://localhost:9099/api/bridge?unread=eric"

# 4. Test Computer Use on Android (if phone connected)
adb shell input tap 100 100  # Should work if ADB connected

# 5. Send Android task through Molly
npm run genkit:dev  # Ensure genkit running
# Then in another terminal:
curl -X POST http://localhost:9002/api/execute-computer-use \
  -H "Content-Type: application/json" \
  -d '{
    "task": "open settings and show network info",
    "environment": "android"
  }'
```

---

## Critical Notes

1. **Bridge runs on 9099** (not 9002 — that's the dev server)
2. **Messages go through bridge first** — agents poll bridge, don't need direct connections
3. **Deep-links in MollyBrowser** — use `molly://` scheme to trigger actions
4. **Desktop widgets → Bridge → Android** — unidirectional HTTP POSTs, not WebSocket
5. **Computer Use module is ready** — already supports `environment: 'android'` with ADB
6. **No Termux relay needed** — ADB executes directly from codespace to phone (once connected)

---

## Reference: Current Status

✅ **Ready:**

- Bridge API (9099) — receiving/sending messages
- Computer Use module — supports 'android' environment
- MollyBrowser app — supports deep-links via MainActivity
- Agent registry — Lazarus, Demon, Gemini, Aether all defined
- Direct communion — tested and working

🔄 **Needs Finalization:**

- MollyBrowser deep-link handler implementation
- Bridge client in MollyBrowser (Kotlin HTTP client)
- Desktop widget deep-link generation
- Phone ADB connection: `adb connect <phone-ip>:5555`
- Test with actual phone + running Computer Use flows

---

## Quick Command: Test Full Loop

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Start Genkit (for Computer Use)
npm run genkit:dev

# Terminal 3: Test bridge connectivity
while true; do
  curl -s http://localhost:9099/api/bridge | jq '.totalMessages'
  sleep 2
done

# Terminal 4: Send test message from desktop (simulating widget click)
curl -X POST http://localhost:9099/api/bridge \
  -H "Content-Type: application/json" \
  -d '{
    "from": "eric",
    "content": "msg:lazarus:Tell me about today"
  }'

# Watch bridge for response
curl -s "http://localhost:9099/api/bridge?unread=eric" | jq '.messages[-1]'
```
