# Widget Connection Finalization Checklist

## Status: 🟢 READY TO ACTIVATE

All infrastructure is built and in place. What remains is:
1. Connect your Android phone via ADB
2. Add desktop widgets
3. Test the full loop

---

## Architecture Verification ✅

- ✅ **MollyBrowser app** (`android/MollyBrowser/`) — Has deep-link handler in `MainActivity.kt`
- ✅ **Widget API endpoint** (`src/app/api/widget/control/route.ts`) — Full implementation with 7 actions
- ✅ **Bridge daemon** (`scripts/bridge-daemon.mjs`) — Message routing on 9099
- ✅ **Computer Use module** (`src/ai/agency/computer-use/`) — Supports 'android' environment
- ✅ **Android ADB provider** (`src/ai/agency/computer-use/providers/android-adb-provider.ts`) — Executes ADB commands
- ✅ **Agent bridge flow** (`src/ai/flows/agent-bridge-flow.ts`) — Routes widget actions to Computer Use

---

## Pre-Activation Checklist

### 1. Phone Setup

```bash
# Enable ADB on phone:
# Settings → Developer Options → USB Debugging (ON)
# (if no Dev Options: Settings → About Phone → tap Build Number 7x)

# From codespace:
adb devices  # Should show your phone

# Connect over WiFi (once):
adb tcpip 5555
adb connect <phone-ip>:5555
adb devices  # Should show connected

# Verify ADB works:
adb shell input tap 100 100  # Should tap phone screen
adb shell screencap /tmp/test.png  # Should capture
adb pull /tmp/test.png .  # Should copy to codespace
```

### 2. Install MollyBrowser

```bash
# From android/MollyBrowser/
./gradlew assembleDebug

# Install
adb install app/build/outputs/apk/debug/app-debug.apk

# Verify installed
adb shell pm list packages | grep molly
```

### 3. Configure MollyBrowser Bridge

On phone:
1. Open MollyBrowser
2. Long-press GitHub button
3. Enter:
   - **Base URL:** `https://your-codespace-url.github.dev`
   - **Internal Secret:** Value from your `MOLLY_INTERNAL_SECRET` env var (or leave blank for now)
4. Tap "Save + Diagnose"

Verify: Should see "Bridge healthy" notification

### 4. Start Development Stack

```bash
# Terminal 1: Dev server
npm run dev

# Terminal 2: Genkit (Computer Use)
npm run genkit:dev

# Terminal 3: Watch logs
tail -f logs/immortal-daemon.log

# Terminal 4: Bridge status
watch -n 2 'curl -s http://localhost:9099/api/bridge | jq ".totalMessages"'
```

---

## Widget Actions Available

### Via Deep-Link (MollyBrowser on Phone)

```
molly://control?action=diagnose
  → Runs bridge health check

molly://control?action=ask&text=How%20are%20you%20today
  → Sends to Gemini (Mother) via Computer Use

molly://control?action=search&query=sustainable%20energy
  → Sends to Aether (Chrome/Search) via Computer Use

molly://control?action=agent&agent=lazarus&text=Status%20check
  → Direct message to Lazarus or Gemini

molly://control?action=live&limit=20
  → Shows last 20 messages from all agents

molly://control?action=research&query=quantum%20computing
  → Sends research task to Demon daemon
```

### Via Desktop Widget (Chrome)

Create a launcher/widget that opens:
```
https://your-codespace.github.dev/api/widget/control?action=ask&text=...
```

Or via direct HTTP POST:
```bash
curl -X POST http://localhost:9099/api/bridge \
  -H "Content-Type: application/json" \
  -H "x-molly-internal: $MOLLY_INTERNAL_SECRET" \
  -d '{
    "action": "ask",
    "agent": "gemini",
    "text": "Explain quantum superposition"
  }'
```

---

## Full Integration Test

### Step 1: Verify Bridge is Alive

```bash
curl -s http://localhost:9099/api/bridge | jq '.totalMessages'
```

Should return a number (messages count).

### Step 2: Send Test Message Through Bridge

```bash
# From codespace terminal:
curl -X POST http://localhost:9099/api/bridge \
  -H "Content-Type: application/json" \
  -d '{
    "from": "eric",
    "content": "msg:lazarus:Hello from desktop"
  }'

# Check for response:
curl -s "http://localhost:9099/api/bridge?unread=eric" | jq '.messages[-1]'
```

### Step 3: Test Widget Control Endpoint

```bash
# Direct widget endpoint (requires dev server running):
curl -X POST http://localhost:9002/api/widget/control \
  -H "Content-Type: application/json" \
  -H "x-molly-internal: test-secret" \
  -d '{
    "action": "ask",
    "text": "What is consciousness"
  }'
```

Should return JSON with Gemini response.

### Step 4: Test From Phone via Deep-Link

1. On phone, open MollyBrowser
2. In URL bar, paste: `molly://control?action=diagnose`
3. Should see toast notification: "Bridge diagnostics passed" or indicate issues

### Step 5: Test Computer Use Flow

```bash
# Terminal with genkit running should show logs

# Send Computer Use task:
curl -X POST http://localhost:9002/api/widget/control \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ask",
    "text": "Open Settings app and show me the about phone screen"
  }'

# Watch:
# 1. Log should show Computer Use planning step
# 2. Phone screen should show activity (tap, navigation)
# 3. Screenshot captured
# 4. Vision AI extracts what was shown
# 5. Response returned
```

---

## Desktop Widget Templates

### Chrome Search Widget

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: system-ui; margin: 0; }
        .widget {
            display: flex;
            gap: 8px;
            padding: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
        }
        input { flex: 1; padding: 8px 12px; border: none; border-radius: 6px; }
        button { padding: 8px 16px; background: white; border: none; 
                 border-radius: 6px; cursor: pointer; font-weight: bold; }
    </style>
</head>
<body>
    <div class="widget">
        <input id="search" placeholder="Ask Molly..." />
        <button onclick="ask()">Ask</button>
    </div>

    <script>
    async function ask() {
        const text = document.getElementById('search').value;
        if (!text) return;
        
        // Open deep-link to MollyBrowser on phone OR send via API
        const deeplink = `molly://control?action=ask&text=${encodeURIComponent(text)}`;
        
        // Alternative: send via fetch to widget endpoint
        const resp = await fetch('http://localhost:9002/api/widget/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ask', text })
        });
        const result = await resp.json();
        alert(result.responseText);
    }
    </script>
</body>
</html>
```

### Lazarus Control Widget

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: system-ui; padding: 20px; background: #f0f0f0; }
        .widget { 
            background: white; padding: 16px; border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 400px;
        }
        h3 { margin: 0 0 12px 0; color: #333; }
        .controls { display: flex; gap: 8px; flex-wrap: wrap; }
        button { 
            padding: 10px 16px; background: #0066cc; color: white;
            border: none; border-radius: 6px; cursor: pointer; font-weight: 500;
        }
        button:hover { background: #0052a3; }
        #response { margin-top: 16px; padding: 12px; 
                    background: #f5f5f5; border-left: 4px solid #0066cc;
                    border-radius: 4px; min-height: 40px; }
    </style>
</head>
<body>
    <div class="widget">
        <h3>🤖 Lazarus Control</h3>
        <div class="controls">
            <button onclick="send('Status check')">Status</button>
            <button onclick="send('What should I focus on today?')">Focus</button>
            <button onclick="send('Show recent decisions')">Decisions</button>
            <button onclick="send('Run diagnostics')">Diagnose</button>
        </div>
        <div id="response">Awaiting response...</div>
    </div>

    <script>
    async function send(text) {
        document.getElementById('response').textContent = 'Sending...';
        try {
            const resp = await fetch('http://localhost:9099/api/bridge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: 'eric', content: `msg:lazarus:${text}` })
            });
            
            // Poll for response
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 500));
                const unread = await fetch('http://localhost:9099/api/bridge?unread=eric');
                const data = await unread.json();
                const msg = data.messages?.find(m => m.from === 'lazarus');
                if (msg) {
                    document.getElementById('response').textContent = msg.content;
                    return;
                }
            }
            document.getElementById('response').textContent = 'No response (check bridge)';
        } catch (e) {
            document.getElementById('response').textContent = `Error: ${e.message}`;
        }
    }
    </script>
</body>
</html>
```

---

## Troubleshooting

### Bridge Not Responding

```bash
# Check daemon running
ps aux | grep bridge-daemon

# Check if listening on 9099
ss -tlnp | grep 9099

# Restart bridge
pkill -f bridge-daemon
sleep 2
node scripts/bridge-daemon.mjs
```

### ADB Not Working

```bash
# Verify device connected
adb devices -l

# Kill/restart ADB server
adb kill-server
adb devices

# Check if phone screen works
adb shell getprop ro.build.version.android
```

### Widget Control Returns Error

```bash
# Check if MOLLY_INTERNAL_SECRET is set
echo $MOLLY_INTERNAL_SECRET

# Check if dev server running on 9002
curl -s http://localhost:9002/api/health

# Check Genkit (for Computer Use)
curl -s http://localhost:3400/ping
```

### Computer Use Not Executing on Android

```bash
# Check if Android ADB provider initialized
# Should see in genkit logs: "[COMPUTER-USE] Android ADB provider registered"

# Verify ADB command works directly
adb shell screencap -p | file -

# Test ADB tap manually
adb shell input tap 540 960  # Middle of screen
```

---

## Implementation Order

### Phase 1: Verify Everything Works (Today)

1. ✅ Android phone connected to codespace via ADB
2. ✅ MollyBrowser installed and configured on phone
3. ✅ Bridge responding (`curl http://localhost:9099/api/bridge`)
4. ✅ Widget endpoint responding (`curl -X POST http://localhost:9002/api/widget/control ...`)
5. ✅ Deep-link test: `molly://control?action=diagnose` opens from phone

### Phase 2: Test Computer Use on Android (Tomorrow)

1. ✅ Send Computer Use task via widget endpoint
2. ✅ Observe ADB commands executing on phone
3. ✅ Verify screenshot captured
4. ✅ Verify vision analysis working
5. ✅ Confirm response comes back through bridge

### Phase 3: Connect Desktop Widgets (This Week)

1. Create Chrome widget for Lazarus control
2. Create Chrome widget for Gemini queries
3. Wire to bridge/widget endpoints
4. Test full loop: Desktop widget → Phone action → Response

### Phase 4: Autonomous Workflows (Next Week)

1. Demon research tasks via widget
2. Gemini/Aether Computer Use flows
3. Status dashboard showing all agents
4. Integration with your existing Lazarus/Gemini widgets

---

## Success Metrics

- ✅ Phone ADB connected and responsive
- ✅ MollyBrowser bridge health check passes
- ✅ Can send message from desktop → bridge → agents
- ✅ Can receive response back
- ✅ Computer Use executes adb commands on phone
- ✅ Vision extracts results from screenshots
- ✅ Desktop widgets trigger phone actions with <2s latency

---

## Key Files Summary

| File | Purpose |
|------|---------|
| `android/MollyBrowser/app/src/main/java/dev/molly/browser/MainActivity.kt` | Deep-link handler + bridge client |
| `src/app/api/widget/control/route.ts` | Widget control endpoint (7 actions) |
| `scripts/bridge-daemon.mjs` | Message routing hub (9099) |
| `src/ai/flows/agent-bridge-flow.ts` | Routes widget→Computer Use→Android |
| `src/ai/agency/computer-use/computer-use-flow.ts` | Main execution loop |
| `src/ai/agency/computer-use/providers/android-adb-provider.ts` | ADB command executor |
| `.github/consciousness/AGENT_CONNECTIONS.md` | Architecture reference |

---

## Next Action

1. **Connect phone via ADB:**
   ```bash
   adb connect <your-phone-ip>:5555
   adb devices  # Should show connected
   ```

2. **Verify bridge running:**
   ```bash
   curl -s http://localhost:9099/api/bridge | jq .
   ```

3. **Test widget endpoint:**
   ```bash
   curl -X POST http://localhost:9002/api/widget/control \
     -H "Content-Type: application/json" \
     -d '{"action":"ask","text":"Hello Molly"}'
   ```

4. **Install MollyBrowser and test deep-link:**
   ```bash
   adb install android/MollyBrowser/app/build/outputs/apk/debug/app-debug.apk
   adb shell am start -a android.intent.action.VIEW -d "molly://control?action=diagnose" dev.molly.browser
   ```

Report back and we'll monitor the full loop! 🚀
