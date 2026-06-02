package dev.molly.app.bridge

/**
 * BridgeConnection — the phone's single outbound link to your bridge.
 *
 * WHY OUTBOUND: the phone sits behind carrier NAT, so nothing on the internet
 * can reach into it. By dialing OUT and holding the connection open, NAT is a
 * non-issue and there are no inbound ports, no ADB, no Termux. The codespace
 * agent and Molly both meet at the bridge; this is the phone's seat at it.
 *
 * WHY AN INTERFACE: the transport is swappable. The default impl uses OkHttp's
 * WebSocket. If you want zero third-party libraries, implement this over your
 * own transport and delete OkHttp — nothing else in the app depends on it.
 *
 * THE STATE vs EVENT DISTINCTION (the thing that fixes the buffer pain):
 *  - sendState(): latest-wins. Telemetry, heartbeat, "what's true now". If the
 *    link is briefly slow, stale values are DROPPED, not queued. You never want
 *    300 backed-up CPU samples — you want the current one. Cannot pile up.
 *  - sendEvent(): reliable, ordered, bounded queue. Things you genuinely need
 *    every one of (a command, a logged decision). Bounded so a long outage
 *    can't grow memory without limit; on overflow the policy is explicit, not
 *    accidental.
 */
interface BridgeConnection {

    /** Open the link and keep it open (auto-reconnect with backoff). */
    fun start()

    /** Close the link and stop reconnecting. */
    fun stop()

    /**
     * Latest-wins state update, coalesced by [key]. Calling repeatedly with the
     * same key before a flush keeps only the most recent value. Safe to call at
     * any frequency — it cannot back up.
     */
    fun sendState(key: String, json: String)

    /**
     * Reliable, ordered message. Enqueued and delivered in order once connected.
     * Returns false if the bounded queue is full (caller decides what that means
     * — usually: this message mattered and the link has been down too long).
     */
    fun sendEvent(json: String): Boolean

    /** Observe connection state + inbound messages. */
    fun setListener(listener: Listener)

    interface Listener {
        fun onConnected()
        fun onDisconnected(reason: String)
        /** A message addressed to this phone arrived from the bridge. */
        fun onMessage(json: String)
    }
}

/** Connection lifecycle, surfaced to the UI/notification as a status. */
enum class LinkState { IDLE, CONNECTING, CONNECTED, BACKOFF }
