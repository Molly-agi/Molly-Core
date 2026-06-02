package dev.molly.app.bridge

/**
 * Contract for phone<->bridge connectivity.
 *
 * - State lane: latest-wins (coalesced by key).
 * - Event lane: reliable ordered queue with explicit bounded backpressure.
 */
interface BridgeConnection {
  fun getDeviceId(): String
  fun isConnected(): Boolean
  fun isAuthenticated(): Boolean

  fun start()
  fun stop()

  fun sendState(key: String, json: String)
  fun sendEvent(json: String): Boolean

  fun setListener(listener: Listener)

  interface Listener {
    fun onConnecting()
    fun onConnected()
    fun onReconnecting(attempt: Int, nextRetryMs: Long)
    fun onDisconnected(reason: String)
    fun onMessage(json: String)
  }
}

enum class LinkState {
  IDLE,
  CONNECTING,
  CONNECTED,
  BACKOFF,
}
