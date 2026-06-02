package dev.molly.app.bridge

import android.util.Log
import org.json.JSONObject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.min
import kotlin.random.Random

class OkHttpBridgeConnection(
  private val bridgeUrl: String,
  private val deviceId: String,
  private val signer: AuthSigner,
  private val scope: CoroutineScope,
  private val onProvision: ((secret: String) -> Unit)? = null,
) : BridgeConnection {

  interface AuthSigner {
    fun sign(payload: String): String
    fun isProvisioned(): Boolean
  }

  private val client =
    OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)  // Give connection up to 15 seconds
      .readTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(15, TimeUnit.SECONDS)
      .pingInterval(20, TimeUnit.SECONDS)
      .build()

  private val state = AtomicReference(LinkState.IDLE)
  private val authenticated = AtomicBoolean(false)
  private var listener: BridgeConnection.Listener? = null
  private var webSocket: WebSocket? = null
  private var runJob: Job? = null

  private val stateBuffer = ConcurrentHashMap<String, String>()
  private val eventQueue = Channel<String>(capacity = 256)
  private var failures = 0

  override fun getDeviceId(): String = deviceId

  override fun isConnected(): Boolean = state.get() == LinkState.CONNECTED

  override fun isAuthenticated(): Boolean = authenticated.get()

  override fun setListener(listener: BridgeConnection.Listener) {
    this.listener = listener
  }

  override fun start() {
    if (runJob?.isActive == true) return
    runJob = scope.launch(Dispatchers.IO) { connectLoop() }
  }

  override fun stop() {
    runJob?.cancel()
    runJob = null
    webSocket?.close(1000, "client stop")
    webSocket = null
    state.set(LinkState.IDLE)
    authenticated.set(false)
  }

  override fun sendState(key: String, json: String) {
    stateBuffer[key] = json
  }

  override fun sendEvent(json: String): Boolean = eventQueue.trySend(json).isSuccess

  private suspend fun connectLoop() {
    while (scope.isActive) {
      state.set(LinkState.CONNECTING)
      listener?.onConnecting()
      val connected = CompletableDeferred<Boolean>()

      val request = Request.Builder().url(bridgeUrl).build()
      val ws =
        client.newWebSocket(
          request,
          object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
              val nonce = Random.nextLong().toString()
              val ts = System.currentTimeMillis()
              val payload = "$deviceId|$ts|$nonce"
              val sig = if (signer.isProvisioned()) signer.sign(payload) else ""
              val hello =
                """{"op":"hello","device":"$deviceId","ts":$ts,"nonce":"$nonce","sig":"$sig"}"""
              ws.send(hello)
              state.set(LinkState.CONNECTED)
              failures = 0
              authenticated.set(signer.isProvisioned())
              listener?.onConnected()
              connected.complete(true)
            }

            override fun onMessage(ws: WebSocket, text: String) {
              // Handle auto-provisioning: bridge sends secret on first contact
              try {
                val json = JSONObject(text)
                if (json.optString("type") == "provision") {
                  val secret = json.optString("secret")
                  if (secret.isNotEmpty()) {
                    Log.i(TAG, "Received provisioning secret — storing and reconnecting")
                    onProvision?.invoke(secret)
                    // Close triggers reconnect loop; next connect will have HMAC sig
                    ws.close(1000, "provisioned")
                    return
                  }
                }
              } catch (_: Exception) { }
              listener?.onMessage(text)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, r: Response?) {
              Log.w(TAG, "ws failure", t)
              if (!connected.isCompleted) connected.complete(false)
              authenticated.set(false)
              listener?.onDisconnected(t.message ?: "ws failure")
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
              if (!connected.isCompleted) connected.complete(false)
              authenticated.set(false)
              listener?.onDisconnected("closed:$code:$reason")
            }
          },
        )
      webSocket = ws

      val ok = connected.await()
      if (ok) pumpUntilClosed(ws)
      if (!scope.isActive) break

      failures++
      state.set(LinkState.BACKOFF)
      val waitMs = backoffMs(failures)
      listener?.onReconnecting(failures, waitMs)
      delay(waitMs)
    }
  }

  private suspend fun pumpUntilClosed(ws: WebSocket) {
    val stateJob =
      scope.launch(Dispatchers.IO) {
        while (isActive && state.get() == LinkState.CONNECTED) {
          if (stateBuffer.isNotEmpty()) {
            val snapshot = HashMap(stateBuffer)
            stateBuffer.clear()
            snapshot.forEach { (k, v) ->
              if (!ws.send("""{"op":"state","key":"$k","data":$v}""")) return@forEach
            }
          }
          delay(500)
        }
      }

    val eventJob =
      scope.launch(Dispatchers.IO) {
        while (isActive && state.get() == LinkState.CONNECTED) {
          val msg = eventQueue.receiveCatching().getOrNull() ?: break
          if (!ws.send("""{"op":"event","data":$msg}""")) break
        }
      }

    while (scope.isActive && state.get() == LinkState.CONNECTED) delay(250)
    stateJob.cancel()
    eventJob.cancel()
  }

  private fun backoffMs(n: Int): Long {
    val exp = MIN_BACKOFF_MS * (1L shl min(n, 6))
    val capped = min(exp, MAX_BACKOFF_MS)
    return capped / 2 + Random.nextLong(capped / 2 + 1)
  }

  companion object {
    private const val TAG = "BridgeConn"
    private const val MIN_BACKOFF_MS = 1_000L
    private const val MAX_BACKOFF_MS = 30_000L
  }
}
