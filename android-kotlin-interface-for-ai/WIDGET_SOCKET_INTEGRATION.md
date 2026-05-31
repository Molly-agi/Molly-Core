# MollyBrowser Widget Socket Integration

## Overview

The MollyBrowser APK now includes a **TCP socket service** that allows Molly (the AI in the codespace) to directly control the widget on the Android device. This eliminates the need for Termux relay or any external dependencies.

## Architecture

```
Molly's Brain (Codespace)
        ↓
  controlWidget() tool
        ↓
  WidgetSocketClient (TCP)
        ↓
  ADB Forward: tcp:9077 → tcp:9077
        ↓
  Android Phone
        ↓
  WidgetSocketService (ListenerService)
        ↓
  WidgetStateManager (in-memory state)
        ↓
  Gemini Mother Widget (UI)
```

## Components

### 1. **WidgetSocketService.kt** (APK side)
- Runs as a foreground service in MollyBrowser
- Listens on TCP port 9077
- Accepts JSON commands
- Maintains widget state
- Responds with JSON results

Location: `android/MollyBrowser/app/src/main/java/dev/molly/browser/WidgetSocketService.kt`

### 2. **WidgetSocketClient.ts** (Molly's brain)
- Sends JSON commands via TCP socket
- Waits for responses (5s timeout)
- Automatically retries on failure
- Returns structured responses

Location: `src/ai/tools/widget-socket-client.ts`

### 3. **controlWidget Tool** (Genkit)
- Exposes widget control to Molly's agency system
- Supports: show, hide, update_status, get_status
- Maps high-level UI actions to socket commands

Location: `src/ai/tools/widget-control.ts`

### 4. **WidgetDisplayFlow** (Example)
- Demo flow showing how to use the widget
- Can be extended for research results, status updates, etc.

Location: `src/ai/flows/demo-widget-display.ts`

## Protocol

### Command Format (JSON)
```json
{
  "action": "show_widget",
  "data": {
    "type": "gemini_mother",
    "content": "Hello from Molly!"
  }
}
```

### Response Format (JSON)
```json
{
  "status": "success",
  "action": "show_widget",
  "widget_type": "gemini_mother",
  "timestamp": 1716345600000
}
```

### Available Actions

#### show_widget
Shows a widget on the device screen.

**Command:**
```json
{
  "action": "show_widget",
  "data": {
    "type": "gemini_mother",
    "content": "Message to display"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "action": "show_widget",
  "widget_type": "gemini_mother",
  "timestamp": 1716345600000
}
```

#### hide_widget
Hides the currently visible widget.

**Command:**
```json
{
  "action": "hide_widget"
}
```

**Response:**
```json
{
  "status": "success",
  "action": "hide_widget",
  "timestamp": 1716345600000
}
```

#### update_state
Updates widget state (progress, status message, etc).

**Command:**
```json
{
  "action": "update_state",
  "data": {
    "key": "research_progress",
    "value": "45%"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "action": "update_state",
  "key": "research_progress",
  "value": "45%",
  "timestamp": 1716345600000
}
```

#### get_status
Gets current widget status and all state.

**Command:**
```json
{
  "action": "get_status"
}
```

**Response:**
```json
{
  "status": "success",
  "action": "get_status",
  "state": {
    "widget_visible": "true",
    "widget_type": "gemini_mother",
    "widget_content": "Current message",
    "research_progress": "45%"
  },
  "timestamp": 1716345600000
}
```

## Building & Deploying

### Prerequisites
- Android SDK (API 34)
- Build Tools 34.x
- Java 17+

### Local Build (on machine with Android Studio)

```bash
cd android/MollyBrowser
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Deployment Steps

1. **Install the APK**
   ```bash
   adb install android/MollyBrowser/app/build/outputs/apk/debug/app-debug.apk
   ```

2. **Launch the app**
   ```bash
   adb shell am start -n dev.molly.browser/.MainActivity
   ```

3. **Setup ADB port forwarding** (from codespace)
   ```bash
   adb forward tcp:9077 tcp:9077
   ```

4. **Verify socket is reachable**
   ```bash
   node -e "
   const net = require('net');
   const socket = net.createConnection(9077, 'localhost');
   socket.on('connect', () => {
     console.log('✅ Widget socket reachable!');
     socket.destroy();
   });
   socket.on('error', (e) => console.log('❌ Error:', e.message));
   "
   ```

## Using from Molly's Code

### Direct Socket Client
```typescript
import { getWidgetSocketClient } from '@/ai/tools/widget-socket-client';

const client = getWidgetSocketClient();

// Show widget
await client.showWidget('gemini_mother', 'Research complete!');

// Update status
await client.updateState('status', 'Ready');

// Hide widget
await client.hideWidget();
```

### Genkit Tool (Recommended)
```typescript
import { controlWidget } from '@/ai/tools/widget-control';

// Show widget
const result = await controlWidget.fn({
  action: 'show',
  widget_type: 'gemini_mother',
  content: 'Searching the web...'
});

// Update status
await controlWidget.fn({
  action: 'update_status',
  status_key: 'progress',
  status_value: '50%'
});
```

### From a Flow
```typescript
import { demoWidgetDisplay } from '@/ai/flows/demo-widget-display';

const result = await demoWidgetDisplay({
  message: 'Research findings loaded',
  widget_type: 'gemini_mother'
});
```

## Troubleshooting

### "Widget socket is not available"
- Verify APK is installed: `adb shell pm list packages | grep molly.browser`
- Verify app is running: `adb shell ps | grep dev.molly`
- Verify port forwarding: `adb forward --list`

### "Connection refused"
- Port forwarding lost: re-run `adb forward tcp:9077 tcp:9077`
- App crashed: restart app with `adb shell am start -n dev.molly.browser/.MainActivity`

### "Timeout after 5000ms"
- Phone may be too slow or experiencing lag
- Try increasing timeout in widget-socket-client.ts
- Check phone CPU/memory usage

### Socket sends but receives no response
- Check device logs: `adb logcat | grep WidgetSocket`
- Verify JSON format matches protocol exactly
- Ensure command ends with newline (`\n`)

## Environment Variables

### Molly Side
- `WIDGET_SOCKET_HOST` - Default: `localhost`
- `WIDGET_SOCKET_PORT` - Default: `9077`

### APK Side (AndroidManifest.xml)
- Service auto-starts on app launch
- Runs as foreground service
- No configuration needed

## Security Notes

### Current Implementation
- Socket listens on localhost only (via ADB forward)
- No authentication
- Safe for development/local use

### Production Considerations
- Add HMAC signing (like direct-communion.ts uses)
- Restrict to trusted connections
- Add rate limiting
- Encrypt sensitive data

## Version History

- **v1.4.0-autonomous** - Widget socket service added
  - TCP socket listener on port 9077
  - JSON command/response protocol
  - Integration with Molly's agency system

## Integration Tests

Run socket connectivity test:
```bash
npm run test -- widget-socket-client.test.ts
```

Manual test from Molly:
```bash
# In Molly's flows or Copilot chat
const result = await controlWidget.fn({
  action: 'show',
  widget_type: 'gemini_mother',
  content: 'Test message from Molly'
});
console.log(result);
```

## Future Enhancements

- [ ] Multiple widget types (research_results, task_list, chart_display)
- [ ] WebSocket upgrade for persistent connection
- [ ] Real-time status streaming
- [ ] Widget state persistence (SQLite)
- [ ] Bidirectional messaging (widget → Molly)
- [ ] Auth token validation
- [ ] Rate limiting per client
