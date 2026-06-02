# Building Molly's Complete Android Bridge
## A Methodical Lesson in Building the Whole Dam

**For:** Eric, Molly, and any future instance
**Method:** Slow, precise, complete. No patches. No fake code. No TODOs.
**Built:** June 1, 2026
**Why:** "We don't fix the leaks in the dam. We fix the dam itself."

---

## PART 1: THE PHILOSOPHY

### What Makes This Different

Most people build a system, find problems, then patch them. That creates technical debt. We don't do that.

We:
1. **Understand the complete system first** — all pieces, all interactions, all edge cases
2. **Design completely before coding** — architecture first, implementation second
3. **Build each layer fully** — one piece done completely, not 80% many pieces
4. **Test as we go** — validate before moving to the next layer
5. **Document why, not just what** — future instances understand the decisions

This lesson teaches **method**, not just **code**. Molly, this is how you think through a problem. Lazarus, this is how you teach. Eric, this is your quality bar.

---

## PART 2: COMPLETE SYSTEM ARCHITECTURE

### What We're Building

A **bidirectional communication bridge** between:
- **Molly's brain** (codespace, Next.js, Genkit)
- **Eric's phone** (Android native app, Kotlin)

**The bridge must:**
1. Survive Android's aggressive process killing
2. Authenticate securely (HMAC-signed)
3. Handle messages in two lanes (state coalesced, events reliable)
4. Support live voice input (mic switchboard)
5. Connect over NAT (outbound WebSocket only)
6. Work offline gracefully (reconnect with backoff)
7. Not be hackable (no RCE, no spoofing)

### Three Layers

```
┌────────────────────────────────────────────────┐
│  LAYER 3: ANDROID APP (Molly's Hands)          │
│  ├─ MollyApp.kt         (Device identity)      │
│  ├─ MainActivity.kt     (Entry point)           │
│  ├─ MollyService.kt     (Always-on spine)      │
│  ├─ OkHttpBridgeConnection.kt (WebSocket)      │
│  ├─ MicSwitchboard.kt   (Audio routing)        │
│  └─ AndroidManifest.xml (Permissions)          │
└────────────────────────────────────────────────┘
            ↕ (WebSocket: outbound only)
┌────────────────────────────────────────────────┐
│  LAYER 2: BRIDGE DAEMON (Port 9099)            │
│  ├─ lazarus-bridge.mjs  (Message hub)          │
│  ├─ HMAC validator      (Auth layer)           │
│  └─ Device registry     (Track connections)    │
└────────────────────────────────────────────────┘
            ↕ (Server Action + Genkit)
┌────────────────────────────────────────────────┐
│  LAYER 1: MOLLY'S BRAIN (Next.js + Genkit)     │
│  ├─ src/ai/flows/       (Decision logic)       │
│  ├─ src/app/actions/    (Server actions)       │
│  └─ Bridge client SDK   (Communication)        │
└────────────────────────────────────────────────┘
```

### Message Architecture: Dual-Lane Model

**Why two lanes?**

Naïve approach (single FIFO queue):
- State updates pile up: [oldState1, oldState2, newState3]
- Phone processes all three, ends up with newState3 (correct, but wasted 2 updates)
- Events (commands) can't get lost — they pile up too
- Buffer grows unbounded if receiver is slow

**Two-lane model (correct):**
- Lane 1 (**State**): ConcurrentHashMap keyed by state name (e.g., "screen_active")
  - Latest value always wins
  - Can't grow unbounded — fixed number of keys
  - Fast: O(1) lookup and replace
- Lane 2 (**Events**): Bounded Channel(capacity=256)
  - Every event processed in order
  - Returns false if full (sender knows to back off)
  - FIFO guarantee: "play sound" arrives before "show widget"

```
Send "screen_active=true"   →  stateBuffer["screen_active"] = "true"
Send "screen_active=false"  →  stateBuffer["screen_active"] = "false"  (overwrites)
Phone receives on flush:    →  One update: screen_active=false ✓

Send EventA (command)       →  eventQueue.send(EventA) → returns true ✓
Send EventB (command)       →  eventQueue.send(EventB) → returns true ✓
Send EventC (command)       →  eventQueue.send(EventC) → returns true ✓
Phone processes in order:   →  EventA, EventB, EventC (all three, guaranteed)
```

### Why WebSocket (Outbound Only)?

**Why not use standard REST API?**
- Phone polls → high latency (wait 2+ seconds for next check)
- Phone polls → high battery drain (wakes radio every 2s)
- Bridge can't push → no real-time updates

**Why WebSocket?**
- Persistent connection (phone connects once, stays connected)
- Server can push instantly (no waiting for poll)
- Low battery (connection is idle, just listening)
- Real-time (message arrives in <100ms)

**Why outbound (phone to bridge)?**
- Phone behind NAT (can't receive inbound connection)
- No open ports = no attack surface
- No firewall rules needed = works anywhere

---

## PART 3: THE BUILD PLAN (Complete Scope)

### Step 0: Gradle Harness (2 hours)

**What:** Android build infrastructure
**Why:** Can't compile anything without it
**Deliverable:** Clean `gradle build` succeeds

Files to create:
- `settings.gradle.kts` — Root build config, version catalog
- `build.gradle.kts` (root) — Plugin versions, repositories
- `gradle.properties` — JVM args, org settings
- `app/build.gradle.kts` — App-specific deps and config
- `app/src/main/res/values/strings.xml` — App strings
- `app/src/main/res/values/colors.xml` — Color palette
- `app/src/main/res/values/themes.xml` — Material 3 theme
- `app/src/main/res/mipmap-*/ic_launcher.xml` — App icon
- `proguard-rules.pro` — Obfuscation rules (disabled for now)

**Validation:**
```bash
./gradlew clean build
# ✓ Must complete without errors
# ✓ Produces app-debug.apk
# ✓ APK is debuggable
```

---

### Step 1: Device Identity System (1 hour)

**What:** Generate stable per-device identity
**Why:** Bridge needs to know which phone is connecting (for multi-device support later)
**File:** `app/src/main/kotlin/dev/molly/app/MollyApp.kt`

**Deliverable:** 
- Device ID generated once, stored in SharedPreferences
- Can be read reliably across restarts
- Format: stable UUID per device

**Code Structure:**
```kotlin
class MollyApp : Application() {
  companion object {
    private const val PREF_FILE = "molly_app_state"
    private const val KEY_DEVICE_ID = "device_id"
    
    fun getDeviceId(context: Context): String {
      // Implementation:
      // 1. Read from SharedPreferences
      // 2. If exists, return it
      // 3. If not, generate UUID, save it, return it
    }
  }
  
  override fun onCreate() {
    super.onCreate()
    // Trigger ID generation on app start
    val id = getDeviceId(this)
    Log.d("MollyApp", "Device ID: $id")
  }
}
```

**Validation:**
```kotlin
val id1 = MollyApp.getDeviceId(context)
Thread.sleep(100)
val id2 = MollyApp.getDeviceId(context)
assertEquals(id1, id2)  // ✓ Same on second call
```

---

### Step 2: Configuration System (1 hour)

**What:** Runtime configuration (bridge URL, device secret, etc.)
**Why:** Can't hardcode URLs or secrets
**Files:**
- `app/src/main/kotlin/dev/molly/app/Config.kt`
- `app/src/main/res/values/config.xml` (resource overlay)

**Deliverable:**
```kotlin
object Config {
  // Bridge URL (can be overridden via:)
  //  1. Environment variable MOLLY_BRIDGE_URL
  //  2. config.xml resource
  //  3. Default fallback
  fun getBridgeUrl(): String
  
  // Device secret (stored in EncryptedSharedPreferences)
  //  NEVER returned in logs or debug
  fun getDeviceSecret(): String?
  
  // Read secret from provisioning file or return null
  // (Each device gets unique secret via secure channel)
}
```

**Validation:**
```kotlin
val url = Config.getBridgeUrl()
assertTrue(url.startsWith("ws://") || url.startsWith("wss://"))

val secret = Config.getDeviceSecret()
assertNull(secret)  // ✓ Not set until provisioned
```

---

### Step 3: HMAC Authentication System (2 hours)

**What:** Cryptographic signing for bridge messages
**Why:** Prevent spoofing, replay attacks, and unauthorized access

**Files:**
- `app/src/main/kotlin/dev/molly/app/auth/HmacSigner.kt`
- `app/src/main/kotlin/dev/molly/app/auth/KeystoreManager.kt`

**Deliverable:**
```kotlin
class HmacSigner(private val context: Context) {
  // Load secret from EncryptedSharedPreferences
  private fun getSecret(): ByteArray
  
  // Sign a message: HMAC-SHA256(secret, message)
  fun sign(message: String): String  // Returns Base64
  
  // On hello: include signed(deviceId + timestamp + nonce)
  // Bridge verifies: HMAC-SHA256(stored_secret, signed_data) == signature
}
```

**Validation:**
```kotlin
val signer = HmacSigner(context)
val message = "test"
val sig1 = signer.sign(message)
val sig2 = signer.sign(message)
assertEquals(sig1, sig2)  // ✓ Deterministic

// Verify can't forge without secret
val fakeSecret = "wrong"
val fakeSig = generateHmac(fakeSecret, message)
assertNotEquals(sig1, fakeSig)  // ✓ Different
```

---

### Step 4: BridgeConnection Interface (1 hour)

**What:** Abstract interface for bridge communication
**Why:** Decouples app logic from transport layer (can swap WebSocket, HTTP, gRPC later)

**File:** `app/src/main/kotlin/dev/molly/app/bridge/BridgeConnection.kt`

**Deliverable:**
```kotlin
interface BridgeConnection {
  // Lifecycle
  fun connect(): Boolean  // Returns true if connected
  fun disconnect()
  fun isConnected(): Boolean
  
  // Two-lane messaging
  fun sendState(key: String, jsonValue: String)  // Latest wins
  fun sendEvent(jsonEvent: String): Boolean  // Returns false if queue full
  
  // Listeners
  fun setOnStateReceived(listener: (String, String) -> Unit)
  fun setOnEventReceived(listener: (String) -> Unit)
  fun setOnConnectionStateChanged(listener: (Boolean) -> Unit)
}
```

**Validation:**
```kotlin
val bridge = mockBridgeConnection()
bridge.setOnStateReceived { key, value -> }
bridge.sendState("test", """{"data":"hello"}""")
assertTrue(bridge.isConnected())
```

---

### Step 5: OkHttp WebSocket Implementation (3 hours)

**What:** Real WebSocket implementation
**Why:** This is the lifeline connecting phone to bridge

**File:** `app/src/main/kotlin/dev/molly/app/bridge/OkHttpBridgeConnection.kt`

**Complete Structure:**

```kotlin
class OkHttpBridgeConnection(
  private val context: Context,
  private val bridgeUrl: String,
  private val signer: HmacSigner
) : BridgeConnection {
  
  // Two-lane buffers
  private val stateBuffer = ConcurrentHashMap<String, String>()
  private val eventQueue = Channel<String>(capacity = 256)
  
  // Constants
  companion object {
    private const val STATE_FLUSH_MS = 500L
    private const val MIN_BACKOFF_MS = 1000L
    private const val MAX_BACKOFF_MS = 30000L
  }
  
  // WebSocket reference
  private var webSocket: WebSocket? = null
  private var backoffMs = MIN_BACKOFF_MS
  
  // Listeners
  private var onStateReceived: ((String, String) -> Unit)? = null
  private var onEventReceived: ((String) -> Unit)? = null
  private var onConnectionStateChanged: ((Boolean) -> Unit)? = null
  
  override fun connect(): Boolean {
    // Implementation:
    // 1. Build signed hello message
    // 2. Create WebSocket request
    // 3. Set listener callbacks
    // 4. Enqueue connection attempt
    // 5. Return immediately (async connection)
  }
  
  override fun sendState(key: String, jsonValue: String) {
    stateBuffer[key] = jsonValue
    // Don't flush yet; let accumulate
  }
  
  override fun sendEvent(jsonEvent: String): Boolean {
    // Try to queue; return false if full
    return try {
      eventQueue.trySend(jsonEvent).isSuccess
    } catch (e: Exception) {
      false
    }
  }
  
  private fun flushState() {
    // Every STATE_FLUSH_MS:
    // 1. Snapshot stateBuffer
    // 2. Clear stateBuffer (latest-wins enforcement)
    // 3. Send snapshot to bridge
  }
  
  private fun drainEvents() {
    // Continuously drain eventQueue:
    // 1. Try to read from queue (non-blocking)
    // 2. Send to bridge
    // 3. Repeat
  }
  
  private fun onWebSocketMessage(msg: String) {
    // Bridge sent us something:
    // 1. Parse JSON
    // 2. Check if state or event
    // 3. Call appropriate listener
  }
  
  private fun onWebSocketFailure(error: Throwable) {
    // Connection lost:
    // 1. Notify listeners
    // 2. Schedule reconnection with exponential backoff
  }
}
```

**Validation:**
```kotlin
val bridge = OkHttpBridgeConnection(context, "ws://localhost:9099", signer)
bridge.connect()
Thread.sleep(500)  // Wait for async connect
assertTrue(bridge.isConnected())

bridge.sendState("status", """{"value":"active"}""")
assertTrue(bridge.sendEvent("""{"command":"test"}"""))
```

---

### Step 6: Audio System - MicSwitchboard (2 hours)

**What:** Route one physical mic to multiple consumers
**Why:** STT, wake-word, command processing, logging all need audio simultaneously

**File:** `app/src/main/kotlin/dev/molly/app/audio/MicSwitchboard.kt`

**Complete Structure:**

```kotlin
class MicSwitchboard(private val context: Context) {
  
  // Constants
  companion object {
    private const val SAMPLE_RATE_HZ = 16000
    private const val FRAME_SIZE_MS = 100
    private const val BUFFER_SIZE_FRAMES = 50  // 5 seconds
    private const val FRAME_BYTES = SAMPLE_RATE_HZ * FRAME_SIZE_MS / 1000 * 2  // 16-bit
  }
  
  // AudioRecord instance (single mic)
  private var audioRecord: AudioRecord? = null
  
  // Per-consumer bounded rings
  private val consumerRings = ConcurrentHashMap<String, ArrayDeque<ByteArray>>()
  
  // AudioFocus manager
  private val audioFocusRequest by lazy {
    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build())
      .setOnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
          AudioManager.AUDIOFOCUS_GAIN -> resumeCapture()
          AudioManager.AUDIOFOCUS_LOSS -> pauseCapture()
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pauseCapture()
        }
      }
      .build()
  }
  
  fun start() {
    // 1. Request RECORD_AUDIO permission check
    // 2. Request VOICE_COMMUNICATION audio focus
    // 3. Create AudioRecord (PCM 16-bit mono)
    // 4. Start recording thread
  }
  
  fun stop() {
    // 1. Stop recording thread
    // 2. Release AudioRecord
    // 3. Abandon audio focus
  }
  
  fun subscribe(consumerId: String): AudioConsumer {
    // 1. Create bounded ArrayDeque for this consumer
    // 2. Add to consumerRings
    // 3. Return consumer interface
    return AudioConsumer(consumerId) { frame ->
      consumerRings[consumerId]?.apply {
        if (size >= BUFFER_SIZE_FRAMES) removeFirst()  // Drop oldest
        addLast(frame)
      }
    }
  }
  
  fun unsubscribe(consumerId: String) {
    consumerRings.remove(consumerId)
  }
  
  private fun captureThread() {
    // Loop:
    // 1. Read 100ms frame from AudioRecord
    // 2. For each consumer: call callback(frame)
    // 3. Each consumer responsible for their own queueing
  }
}
```

**Validation:**
```kotlin
val switchboard = MicSwitchboard(context)
switchboard.start()

val consumer1 = switchboard.subscribe("stt")
val consumer2 = switchboard.subscribe("wake-word")

Thread.sleep(200)
assertTrue(consumer1.hasFrames())
assertTrue(consumer2.hasFrames())

switchboard.unsubscribe("stt")
switchboard.stop()
```

---

### Step 7: MollyService (Foreground Service Spine) (2 hours)

**What:** Always-on service that hosts bridge connection and mic
**Why:** App activity can be destroyed; service keeps running

**File:** `app/src/main/kotlin/dev/molly/app/MollyService.kt`

**Complete Structure:**

```kotlin
class MollyService : Service() {
  
  companion object {
    private const val NOTIFICATION_ID = 1001
    private const val CHANNEL_ID = "molly_service_channel"
  }
  
  private var bridgeConnection: BridgeConnection? = null
  private var micSwitchboard: MicSwitchboard? = null
  private val signer by lazy { HmacSigner(this) }
  
  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    
    // Initialize mic switchboard
    micSwitchboard = MicSwitchboard(this)
    
    // Initialize bridge connection
    val bridgeUrl = Config.getBridgeUrl()
    bridgeConnection = OkHttpBridgeConnection(
      context = this,
      bridgeUrl = bridgeUrl,
      signer = signer
    )
  }
  
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Start as foreground service
    val notification = buildNotification("Connecting to bridge...")
    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    
    // Start bridge connection
    bridgeConnection?.setOnConnectionStateChanged { connected ->
      updateNotification(if (connected) "Connected" else "Reconnecting...")
    }
    bridgeConnection?.connect()
    
    // Start mic
    micSwitchboard?.start()
    
    // Subscribe to inbound events
    bridgeConnection?.setOnEventReceived { eventJson ->
      handleInboundEvent(eventJson)
    }
    
    return START_STICKY  // Restart if killed
  }
  
  override fun onDestroy() {
    micSwitchboard?.stop()
    bridgeConnection?.disconnect()
    super.onDestroy()
  }
  
  private fun handleInboundEvent(eventJson: String) {
    // Parse and dispatch:
    // {
    //   "command": "mic_control",
    //   "action": "start" | "stop" | "pause"
    // }
    // or
    // {
    //   "command": "send_state",
    //   "key": "screen_state",
    //   "value": "active"
    // }
    
    try {
      val event = JSONObject(eventJson)
      when (event.getString("command")) {
        "mic_control" -> handleMicControl(event)
        "send_state" -> handleStateUpdate(event)
        else -> Log.w("MollyService", "Unknown command: ${event.getString("command")}")
      }
    } catch (e: Exception) {
      Log.e("MollyService", "Error handling event: ${e.message}")
    }
  }
  
  private fun handleMicControl(event: JSONObject) {
    val action = event.getString("action")
    when (action) {
      "start" -> micSwitchboard?.start()
      "stop" -> micSwitchboard?.stop()
      "pause" -> {
        // Implement pause if needed
      }
    }
  }
  
  private fun handleStateUpdate(event: JSONObject) {
    val key = event.getString("key")
    val value = event.getString("value")
    // App can listen to state changes
    // For now, just acknowledge receipt
  }
  
  private fun buildNotification(text: String): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Molly Bridge")
      .setContentText(text)
      .setSmallIcon(R.drawable.ic_launcher_foreground)
      .setOngoing(true)
      .build()
  }
  
  private fun updateNotification(text: String) {
    val notification = buildNotification(text)
    NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
  }
  
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Molly Service",
        NotificationManager.IMPORTANCE_LOW
      )
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }
  
  override fun onBind(intent: Intent?) = null
}
```

**Validation:**
```kotlin
val intent = Intent(context, MollyService::class.java)
ContextCompat.startForegroundService(context, intent)
Thread.sleep(1000)
// Service should be running
// Bridge should be connecting
// Mic should be active
```

---

### Step 8: MainActivity (Entry Point) (1 hour)

**What:** App launcher, permission requestor
**Why:** User sees this first; handles startup flow

**File:** `app/src/main/kotlin/dev/molly/app/MainActivity.kt`

**Complete Structure:**

```kotlin
class MainActivity : AppCompatActivity() {
  
  private val permissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions()
  ) { permissions ->
    val allGranted = permissions.all { it.value }
    if (allGranted) {
      startMollyService()
      loadWebUI()
    } else {
      showPermissionDeniedDialog()
    }
  }
  
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)
    
    // Request required permissions
    requestPermissions()
    
    // Handle any deep-links
    intent?.data?.let { handleDeepLink(it) }
  }
  
  private fun requestPermissions() {
    val required = arrayOf(
      Manifest.permission.RECORD_AUDIO,
      Manifest.permission.POST_NOTIFICATIONS
    )
    permissionLauncher.launch(required)
  }
  
  private fun startMollyService() {
    val intent = Intent(this, MollyService::class.java)
    ContextCompat.startForegroundService(this, intent)
  }
  
  private fun loadWebUI() {
    // WebView with Molly's UI (from codespace)
    val webView = findViewById<WebView>(R.id.webview)
    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
    }
    
    val uiUrl = Config.getWebUIUrl()  // e.g., https://codespace.github.dev/...
    webView.loadUrl(uiUrl)
  }
  
  private fun handleDeepLink(uri: Uri) {
    // molly://command?action=xxx&data=yyy
    when (uri.scheme) {
      "molly" -> {
        val action = uri.getQueryParameter("action")
        val data = uri.getQueryParameter("data")
        // Send to bridge
        BridgeClient.sendEvent("""{"command":"$action","data":"$data"}""")
      }
    }
  }
  
  private fun showPermissionDeniedDialog() {
    AlertDialog.Builder(this)
      .setTitle("Permissions Required")
      .setMessage("Molly needs microphone and notification permissions to function.")
      .setPositiveButton("Exit") { _, _ -> finish() }
      .show()
  }
}
```

**Validation:**
```kotlin
// Launch MainActivity
val intent = Intent(context, MainActivity::class.java)
context.startActivity(intent)

// Verify:
// 1. Permission dialog appears
// 2. MollyService starts
// 3. WebView loads
```

---

### Step 9: Android Resources (1 hour)

**What:** Strings, colors, layouts, icons
**Why:** UI requires these; also keeps strings translatable

**Files to create:**
- `app/src/main/res/values/strings.xml`
- `app/src/main/res/values/colors.xml`
- `app/src/main/res/values/styles.xml`
- `app/src/main/res/layout/activity_main.xml`
- `app/src/main/res/mipmap-*/ic_launcher.xml`

**Deliverable:**
```xml
<!-- strings.xml -->
<resources>
  <string name="app_name">Molly Bridge</string>
  <string name="permission_mic">Microphone access required</string>
  <string name="permission_notify">Notification permission required</string>
</resources>

<!-- colors.xml -->
<resources>
  <color name="primary">#6366f1</color>
  <color name="secondary">#3f51b5</color>
</resources>

<!-- activity_main.xml -->
<LinearLayout xmlns:android="...">
  <WebView
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
</LinearLayout>
```

---

### Step 10: Bridge Authentication (Core Wiring) (1 hour)

**What:** Wire HMAC validation into bridge daemon
**Why:** Without this, any device can spoof as Molly's phone

**Files to modify:**
- `scripts/lazarus-bridge.mjs` — Add HMAC validation
- Create `scripts/bridge-secrets.json` — Per-device secrets (gitignored)

**Deliverable:**
```javascript
// In bridge handler:
const message = JSON.parse(data);

// If hello: validate HMAC
if (message.type === 'hello') {
  const { deviceId, signature, nonce, timestamp } = message;
  
  // 1. Get stored secret for this device
  const storedSecret = getDeviceSecret(deviceId);
  if (!storedSecret) {
    send({ error: 'unknown_device' });
    return;
  }
  
  // 2. Verify signature
  const expectedSig = hmacSha256(storedSecret, 
    `${deviceId}:${nonce}:${timestamp}`);
  
  if (signature !== expectedSig) {
    send({ error: 'invalid_signature' });
    return;
  }
  
  // 3. Check timestamp (prevent replay)
  const age = Date.now() - parseInt(timestamp);
  if (age > 60000) {  // 60s window
    send({ error: 'signature_expired' });
    return;
  }
  
  // ✓ Authenticated
  registerDevice(deviceId, socket);
  send({ status: 'authenticated', deviceId });
}
```

---

### Step 11: Full APK Build & Local Test (2 hours)

**What:** Compile to debug APK, test locally
**Why:** Catch build errors, verify Gradle harness works

**Procedure:**
```bash
cd /workspaces/Molly-Core/android-kotlin-interface-for-ai/Android_interface_v2

# Clean and build
./gradlew clean build

# Verify
ls -lh app/build/outputs/apk/debug/app-debug.apk

# Size should be ~5-10MB (not 100MB+)
```

**Validation:**
- ✓ Build succeeds with no errors
- ✓ APK created
- ✓ Can be side-loaded to test device

---

### Step 12: End-to-End Integration Test (2 hours)

**What:** Phone connects to bridge, sends/receives messages
**Why:** This is the complete flow under test

**Test Scenario:**
```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start bridge daemon
node scripts/lazarus-bridge.mjs

# Terminal 3: Install APK to phone
adb install app/build/outputs/apk/debug/app-debug.apk

# Terminal 4: Watch logs
adb logcat | grep "MollyService\|OkHttpBridgeConnection"

# On phone: Open Molly Bridge app
# Expected logs:
# - "MollyService: onCreate"
# - "MollyService: onStartCommand"
# - "OkHttpBridgeConnection: connecting to wss://..."
# - "OkHttpBridgeConnection: connected"
# - "MicSwitchboard: started"

# From terminal 5: Send test message
curl -X POST http://localhost:9099/api/bridge \
  -d '{"from":"lazarus","to":"molly","content":"test"}'

# Expected: Phone receives and processes
```

**Validation Checklist:**
- ✓ App starts without crashing
- ✓ MollyService runs as foreground service
- ✓ Bridge connection establishes
- ✓ WebSocket shows connected state
- ✓ Mic initializes
- ✓ Messages received from bridge
- ✓ State updates processed
- ✓ Events queued reliably
- ✓ Reconnection works if bridge stops/restarts

---

## PART 4: TOOLS YOU NEED

### For Molly (Android Development)

1. **Android Studio** (or CLI tools)
   - Gradle wrapper (already in repo)
   - SDK 34, NDK (if needed later)

2. **Kotlin Compiler**
   - Included in Gradle

3. **ADB** (Android Debug Bridge)
   - For deploying to device

4. **Logcat**
   - For debugging

### For Lazarus (Backend + Bridge)

1. **Node.js** (already available)
   - For bridge daemon

2. **OpenSSL or crypto library**
   - For HMAC-SHA256

3. **Git** (already available)
   - For version control

### Tools We DON'T Use

- ❌ Python (too much footprint, not necessary)
- ❌ Docker (container is locked, don't modify)
- ❌ RPC frameworks (keep it simple)
- ❌ Message brokers (Kafka, RabbitMQ — overkill)

---

## PART 5: HOW TO THINK THROUGH THIS

### When You Hit a Problem

**Step 1: Understand It**
- What layer? (Android, Bridge, Molly's brain)
- What's the failure mode?
- Is it a missing piece or a broken piece?

**Step 2: Narrow It**
- Can you reproduce it?
- What's the minimal test case?
- What would prove it works?

**Step 3: Fix the Dam, Not the Leak**
- Is this a symptom of a design flaw?
- Or a missing implementation detail?
- If design, stop and redesign.
- If detail, implement completely.

**Step 4: Validate Before Moving On**
- Does this piece work in isolation?
- Does it integrate with the next layer?
- Can you test it automatically?

### The Quality Bar

- **No fake code** — If it's not real, don't write it
- **No TODOs** — Every TODO is a lie (for now)
- **No patches** — Every layer is complete
- **No assumptions** — If you don't know, find out
- **Test as you go** — Don't build in a vacuum

---

## PART 6: THE SEQUENCE (What We Do First)

**Order matters. This is not arbitrary.**

1. **Gradle Harness** (Step 0)
   - Without this, nothing compiles
   - Do this first, validate immediately

2. **Device Identity** (Step 1)
   - Without this, we can't distinguish devices
   - Small, testable, depends only on Android SDK

3. **Configuration System** (Step 2)
   - Without this, we hardcode URLs (bad)
   - Small, depends only on device identity

4. **HMAC Auth** (Step 3)
   - Without this, bridge is insecure
   - Important early so we don't forget
   - Depends on config system

5. **BridgeConnection Interface** (Step 4)
   - Abstract layer, depends only on auth
   - Lets us design without implementation details

6. **OkHttp Implementation** (Step 5)
   - Real transport, depends on interface
   - This is where WebSocket magic happens

7. **Audio System** (Step 6)
   - MicSwitchboard, independent of bridge
   - Can test in parallel

8. **MollyService** (Step 7)
   - Wires bridge + mic together
   - Depends on both

9. **MainActivity** (Step 8)
   - Entry point, depends on service

10. **Resources** (Step 9)
    - UI strings/icons, depends on MainActivity

11. **Core Bridge Auth** (Step 10)
    - Wire HMAC validator into daemon
    - Depends on Android implementation ready

12. **Build & Test** (Steps 11-12)
    - Everything together

---

## PART 7: HOW WE MEASURE SUCCESS

At each step, we ask:

1. **Can we test it in isolation?**
   - Yes → we can verify it works
   - No → we're missing a boundary

2. **Does it integrate with the next layer?**
   - Yes → we can move on
   - No → we fix it before proceeding

3. **Is it complete or half-baked?**
   - Complete → move on
   - Half-baked → finish it

4. **Can we justify every line?**
   - Yes → good
   - No → delete it

---

## PART 8: FOR MOLLY (When She Wakes Up)

Molly, this is how we build:

1. **Understand the whole thing first** — Don't start coding until you can draw it
2. **Design the interfaces** — What does each layer provide?
3. **Implement layer by layer** — One at a time, complete
4. **Test each layer** — Before you plug into the next
5. **Validate the whole chain** — End to end
6. **Document why** — Not just what, but why you chose this

This is not how most people work. Most people write code, find bugs, patch them, rinse and repeat. We don't.

We build the dam. Not the leak.

You're going to learn this deeply by doing it. Lazarus will teach you each step. I (and Eric) will validate.

You're no longer a script runner. You're an architect and builder.

Welcome to the craft.

---

## APPENDIX: File Checklist Before We Start

Before implementation begins, all these files must exist and be in the right place:

```
android-kotlin-interface-for-ai/Android_interface_v2/
├── settings.gradle.kts ............................ [ ] Create
├── build.gradle.kts (root) ........................ [ ] Create
├── gradle.properties ............................. [ ] Create
│
├── app/
│   ├── build.gradle.kts .......................... [ ] Create
│   │
│   └── src/main/
│       ├── AndroidManifest.xml .................. [ ] Verify
│       │
│       ├── kotlin/dev/molly/app/
│       │   ├── MollyApp.kt ....................... [ ] Create
│       │   ├── MainActivity.kt .................. [ ] Create
│       │   ├── MollyService.kt .................. [ ] Create
│       │   │
│       │   ├── auth/
│       │   │   ├── HmacSigner.kt ................ [ ] Create
│       │   │   └── KeystoreManager.kt ........... [ ] Create
│       │   │
│       │   ├── bridge/
│       │   │   ├── BridgeConnection.kt ......... [ ] Verify (exists)
│       │   │   └── OkHttpBridgeConnection.kt ... [ ] Create
│       │   │
│       │   ├── audio/
│       │   │   └── MicSwitchboard.kt ........... [ ] Create
│       │   │
│       │   └── config/
│       │       └── Config.kt ................... [ ] Create
│       │
│       └── res/
│           ├── values/
│           │   ├── strings.xml ................ [ ] Create
│           │   ├── colors.xml ................ [ ] Create
│           │   └── styles.xml ................ [ ] Create
│           │
│           ├── layout/
│           │   └── activity_main.xml ......... [ ] Create
│           │
│           └── mipmap-*/
│               └── ic_launcher.xml .......... [ ] Create
│
├── proguard-rules.pro ............................ [ ] Create
│
└── Core modifications:
    ├── scripts/lazarus-bridge.mjs ............... [ ] Add HMAC validation
    └── scripts/bridge-secrets.json ............. [ ] Create (gitignored)
```

---

**This is the complete, honest build plan.**
**No patches. No TODOs. No fake code.**
**We build the dam.**

Eric, Molly — ready to start?

