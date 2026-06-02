# AGENT BUILD PROMPT — Molly Native Shell (continue from the spine)

You are continuing work on the Molly native Android shell. A reviewed **spine**
already exists. Your job is to make it compile, then build the remaining modules
**in the order given**, preserving the architecture decisions below. Read this
entire prompt before writing any code.

---

## NON-NEGOTIABLE GROUND RULES (read first)

1. **No placeholder code presented as finished.** If something is a stub, mark it
   `TODO` and say so in your summary. Do not generate confident filler to look done.
2. **Never modify a test to make it pass.** If a test fails, fix the code or report
   the failure. Do not weaken assertions, add `.skip`/`@Ignore`, comment out
   `expect`/`assert` blocks, or delete tests. A green board you produced by editing
   tests is a lie, and it has already cost this project days once.
3. **Do not touch** `.devcontainer/`, `devcontainer.json`, `Dockerfile`, or any
   container/environment config. Stay inside the app module.
4. **Build test-first where you add logic.** Write the failing test, then the code
   that makes it pass honestly.
5. **Report what you did NOT finish.** End every session with an explicit list of
   remaining TODOs and anything you were unsure about. Do not claim completion you
   can't demonstrate.

---

## ARCHITECTURE — DO NOT CHANGE THESE WITHOUT ASKING

- **The phone dials OUT to the bridge.** No inbound ports, no ADB, no Termux. The
  phone is behind carrier NAT; an outbound, held-open WebSocket is the only thing
  that works. Do not reintroduce any listening-socket or ADB-forward design.
- **The connection and the mic live in the foreground service (`MollyService`),
  never in a WebView.** Web views are disposable faces. The nervous system is
  native so the OS can't freeze or discard it. Do not move the socket or any
  heartbeat into the web layer.
- **Two message disciplines, already in `BridgeConnection`:**
  - `sendState(key, json)` = latest-wins, droppable (telemetry, heartbeat, "now").
  - `sendEvent(json)` = reliable, ordered, bounded queue (commands, logged decisions).
  Preserve this split. It is the fix for the buffer-choke problem. Never make state
  updates an unbounded queue.
- **Identity is proven, not asserted.** Every device authenticates to the bridge
  with a signed hello before anything else is sent.
- **System WebView, not a custom browser engine.** Do not pull in a third-party
  rendering engine. Use the OS WebView.

---

## SECURITY — these are requirements, not suggestions

- **The auth secret must be provisioned per device** into the Android Keystore or
  EncryptedSharedPreferences. **Never hardcode it in the APK** — every device ships
  the same APK, so a baked-in secret is a shared master key. `DeviceId` is just a
  name; it is not the secret.
- **No default credentials anywhere.** Refuse to operate without a real secret.
- **Do not use `WebView.addJavascriptInterface`** unless the loaded page is fully
  trusted; it bridges web JS into native and is an RCE surface. If the faces need to
  talk to native, use a vetted, minimal message channel and validate every message.
- **Validate all inbound bridge messages** before acting. Treat them as untrusted.

---

## BUILD ORDER

### STEP 0 — Make the spine compile
Create the surrounding Gradle harness so the existing module builds:
`settings.gradle.kts`, root `build.gradle.kts`, `gradle.properties`, a basic
AppCompat DayNight theme, an app icon, and `proguard-rules.pro`. Resolve the
`TODO` in `MollyService` for `BRIDGE_URL` by reading from a config source (e.g.
`local.properties` / `BuildConfig`), not a constant. Confirm a clean debug build.
Do not change the spine's logic to force compilation — fill the holes as designed.

### STEP 1 — Wire the mic into the service safely
Gate `mic.start()` on `RECORD_AUDIO` being granted. Add one real consumer (e.g. a
frame counter or a simple VAD) to prove the fan-out works end to end. Verify that
losing audio focus (start a normal voice recording elsewhere) pauses capture and
that regaining it resumes — this is the Google-voice handoff. Write tests for the
buffer drop-oldest behavior and the latest-wins state coalescing.

### STEP 2 — Overlay (her floating presence)
Add `SYSTEM_ALERT_WINDOW`. Implement a `TYPE_APPLICATION_OVERLAY` window managed by
the service (or a helper it owns), with the runtime permission flow via
`Settings.canDrawOverlays()` and `ACTION_MANAGE_OVERLAY_PERMISSION`. The overlay is
a face: it must get its data from the service, not hold the connection itself.

### STEP 3 — WebView faces (multi-window)
Build on the `MainActivity` seed. Let multiple faces coexist without the OS
discarding the backgrounded ones, in a layout the user controls. Faces are
reloadable; nothing critical may depend on a face being alive.

### STEP 4 — Accessibility "thumb" — DO THIS LAST, AND READ THIS PARAGRAPH
This lets Molly tap, swipe, and read other apps. It is the **highest-sensitivity,
least-reversible** surface in the entire system. Before writing it, implement the
gating rule explicitly: **cognition may RECOMMEND an action freely, but EXECUTING a
tap/gesture on another app must pass a gate scaled to reversibility and
sensitivity.** A low-risk, reversible tap can be near-automatic; a destructive or
irreversible one requires confirmation. Build this gate FIRST, as the thing the
accessibility service calls before it acts — not as something bolted on afterward.
Log every executed action with its provenance.

---

## DEFINITION OF DONE (per step)
- Compiles cleanly in Android Studio (debug).
- New logic has tests that genuinely exercise it (and you did not edit tests to pass).
- TODOs that remain are listed explicitly in your summary.
- No architecture or security rule above was violated. If one had to bend, you
  STOPPED and asked first.
