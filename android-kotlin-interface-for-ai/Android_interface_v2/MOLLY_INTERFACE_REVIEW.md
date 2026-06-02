# Molly Android Interface — Review & Remediation Plan

**Reviewer:** Opus 4.8
**For:** Eric Sidburn
**Scope:** MollyBrowser APK, Termux relay, Bridge, deep-link + socket + computer-use paths
**Posture:** Severity-ranked. Fix top-down. Each item has a concrete remediation.

---

## CRITICAL — fix before running this anywhere but an airplane-mode device

### C1. `termux-relay.py` is unauthenticated-by-default remote code execution

Three compounding faults:

1. **Blocklist filtering is fundamentally bypassable.** `BLOCKLIST = ['rm -rf', ...]`
   with substring matching is defeated by: `rm -fr`, `rm  -rf`, `rm -r -f`,
   `rm --recursive --force`, `find . -delete`, `truncate -s0`, `$(printf 'rm') -rf ~`,
   base64-decoded payloads, etc. There is no blocklist long enough.
2. **Default credential.** `os.environ.get('MOLLY_RELAY_TOKEN', 'default-token')` —
   if the env var is unset (e.g. during a recovery, or a fresh boot before
   `.bashrc` sourced), the relay runs with a token anyone can guess.
3. **Binds all interfaces.** `HTTPServer(('0.0.0.0', PORT), ...)` listens on the
   phone's WiFi/cell interface, not just loopback. On shared WiFi this is a remote
   shell into your phone.

**Remediation (in order):**
- **Drop `shell=True` and free-form commands entirely.** Replace with an
  *allowlist* of named operations the relay knows how to perform, each mapped to
  an argument vector (no shell). Example:
  ```python
  ALLOWED = {
      "list_dir":  lambda args: ["ls", "-la", safe_path(args["path"])],
      "read_file": lambda args: ["cat", safe_path(args["path"])],
      "screencap": lambda args: ["termux-screencap", "-"],
      # ... explicit, audited, no shell metacharacters reach a shell
  }
  # subprocess.run(ALLOWED[op](args), shell=False, ...)
  ```
  If you genuinely need arbitrary shell later, that is a different, much larger
  security project — not a relay default.
- **Require the token; refuse to start without it.** No default. `sys.exit(1)` if
  `MOLLY_RELAY_TOKEN` is unset.
- **Bind loopback only:** `HTTPServer(('127.0.0.1', PORT), ...)`. Reach it from the
  codespace via `adb forward`/`adb reverse`, never over the open network.
- **Constant-time token compare:** `hmac.compare_digest(token, BEARER_TOKEN)`.
- If it must ever leave loopback, it needs TLS — bearer tokens over plain HTTP are
  sniffable on the LAN.

### C2. Spoofable agent identity (Bridge + Socket)

The bridge trusts the client-supplied `from` field. Any process that can reach
:9099 can post `{"from":"molly", ...}` or `{"from":"eric", ...}` and your agents
will act on it as authentic. The socket service (:9077) accepts any connection.

**Remediation:**
- Give each agent a per-process secret; sign every bridge message (HMAC over
  `from|to|content|timestamp|nonce`). Reject unsigned/mis-signed messages.
- Reject stale/replayed messages via the timestamp+nonce.
- This also gives you real provenance — which ties directly into the provenance
  log from the Phase 7 agency layer. Reuse that signing approach if it exists.

### C3. Deep links are untrusted input treated as trusted

`BROWSABLE` category means any web page the phone loads can fire
`molly://control?action=...`. And `uri.getQueryParameter("limit")?.toInt()`
throws → activity crash on any non-numeric value.

**Remediation:**
- Treat every deep-link parameter as hostile. Validate `action` against a fixed
  enum; validate/parse all params defensively (`toIntOrNull() ?: default`).
- Gate state-changing actions (research dispatch, agent messaging) behind an
  in-app confirmation, or drop `BROWSABLE` and trigger only from your own
  trusted launcher/widget.

---

## HIGH

### H1. `ServerSocket(9077)` binds all interfaces
Java's `ServerSocket(port)` binds `0.0.0.0`. "Safe via ADB forward" is only true
if nothing else can reach the port — but the LAN can.
**Fix:** `ServerSocket(PORT, backlog, InetAddress.getLoopbackAddress())`, and still
add the HMAC from C2.

### H2. Socket service is single-threaded and crash-prone
The shown `listenForConnections()` calls `handleClient()` inline — one slow client
blocks all others. No try/catch around `parseCommand`, so malformed JSON kills the
loop. Protocol framing is inconsistent (troubleshooting says "end with `\n`" but
`readText()` reads to EOF).
**Fix:** thread-per-connection (or a small pool), wrap handling in try/catch, define
one framing rule (newline-delimited JSON) and honor it on both ends, bound the read
size.

### H3. The cloud-codespace → phone ADB path may not actually work as drawn
`adb forward` is host-local. A GitHub cloud Codespace has no USB/LAN route to a
physical phone behind carrier NAT. Path 2 ("Molly in codespace → TCP → ADB forward
→ phone") realistically only works when phone + adb host are the *same local
machine*. Confirm whether the cloud topology has ever run end-to-end, or whether the
diagram is the intended (not the achieved) state. If you need true cloud→phone, you
need a phone-initiated outbound persistent connection (phone dials out to the
codespace), not adb forward.

---

## MEDIUM

### M1. Foreground-service types vs Android 14 (targetSdk 34)
`specialUse` requires a declared `<property>` justification and is gated; a localhost
socket likely isn't `connectedDevice`. Wrong/unjustified FGS type → the system
refuses to start or kills the service. Also, Android 12+ blocks starting a FGS from
the background — this is almost certainly the real cause of "ConnectionKeeperService
sometimes stops."
**Fix:** pick the correct, justified FGS type; start the service from a foreground
context; for OEM killers (Samsung/Xiaomi) document the user-side battery exemption
rather than fighting the OS with restart loops.

### M2. `START_STICKY` + battery exemption + restart loop is the pattern that just bit you
A keep-alive that the OS keeps killing and you keep reviving is the same shape as the
watcher-thrash that cost four days. Prefer *one* correctly-typed FGS + WorkManager for
periodic reconnection with backoff, over aggressive auto-restart.

### M3. WiFiScanner returns `<unknown ssid>`
`wifiManager.connectionInfo` is deprecated, and SSID is redacted without
`ACCESS_FINE_LOCATION` — which the manifest never requests. As written this module is
effectively non-functional.
**Fix:** request location (and justify it), or move to `ConnectivityManager` +
`NetworkCallback`. Or cut it if network detection isn't load-bearing.

### M4. Polling → use the SSE you already built
2s `Timer` HTTP polling drains battery (~5%/hr by your own numbers) and adds latency.
You already implemented SSE streaming in the Phase 7 admin API — reuse that transport
for phone↔bridge instead of inventing a new one. WebSocket is also fine; the point is
*don't poll*.

### M5. Version drift across files
APK named `v1.2.0`, `build.gradle.kts` says `versionName "1.3.0"`, socket doc says
`v1.4.0-autonomous`. This is exactly the kind of ambiguity that makes a recovery
harder. Pin one version, stamp it in the APK, reference it everywhere.

### M6. `isMinifyEnabled = false` with proguardFiles set
ProGuard is configured but disabled, so it does nothing — no shrinking, no
obfuscation. Decide if you want it; right now it's dead config.

---

## ARCHITECTURE — answers to your 8 questions

1. **Polling vs WebSocket:** WebSocket/SSE. Reuse Phase 7 SSE. (M4)
2. **TCP+JSON vs gRPC:** Keep TCP+JSON for now — gRPC's efficiency win is dwarfed by
   the auth and reliability work you need first. Don't add a serialization framework
   to a system that isn't yet authenticated. Revisit only if message volume becomes a
   measured bottleneck.
3. **Multi-device:** A device registry keyed by a per-device signed identity, with the
   bridge routing by device-id. But this is a *later* problem — single-device must be
   secure and reliable first.
4. **Unify the three paths:** Yes, collapse toward one. The cleanest model is a single
   **phone-initiated persistent authenticated channel** (phone dials out to the
   bridge, holds the connection, receives commands, returns results). That one channel
   replaces deep-link polling and the inbound socket, dodges NAT (H3), and gives you
   one security surface instead of three. Keep ADB/computer-use as a *dev-only* tool,
   not a production path.
5. **Android process killing:** Correct FGS type + user battery exemption + reconnect
   with backoff. There is no API that fully beats OEM killers; design to reconnect
   gracefully rather than to never die. (M1, M2)
6. **Relay security:** See C1 — allowlist, no shell, no default token, loopback only.
7. **Device discovery (mDNS):** Skip for now. Adds complexity and a new attack surface
   to a single-device system. Manual config is fine until multi-device is real.
8. **What to rebuild from scratch:** Only the relay's execution model (C1). Everything
   else is refactor-in-place: add auth, fix bindings, unify transport. You do not need
   to throw the architecture away — you need to authenticate it and make one channel do
   the work of three.

---

## WHAT'S ACTUALLY GOOD (keep these)

- **The bridge-as-hub instinct.** A central message bus with agents subscribing is the
  right shape; it just needs authenticated identity on top.
- **Your own Known-Issues list.** You independently flagged auth, polling, persistence,
  and error recovery. That's accurate self-assessment — the same skill that makes the
  rest of this tractable.
- **Foreground service for connection survival** is the correct *category* of solution;
  it just needs the Android-14-correct typing.
- **Separation of fast/reliable/powerful paths** was reasonable thinking. The
  refinement is to collapse them now that you know which one actually carries weight.

---

## SUGGESTED ORDER OF WORK

1. C1 (relay) — stop the RCE.
2. C2 (sign messages) — stop impersonation.
3. C3 + H1 (deep-link validation, loopback binding) — close the easy doors.
4. H3 (confirm the real topology) — know what actually runs before building on it.
5. M4 (SSE) + M1/M2 (service lifecycle) — reliability.
6. Everything else.
