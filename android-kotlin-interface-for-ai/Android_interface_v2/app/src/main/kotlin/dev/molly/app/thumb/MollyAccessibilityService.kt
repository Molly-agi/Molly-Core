package dev.molly.app.thumb

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Path
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import dev.molly.app.config.Config
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * MollyAccessibilityService — the "thumb".
 *
 * It's all ones and zeros. This service treats the screen like a human thumb:
 * gesture-tap a coordinate, paste text, gesture-tap send. No DOM scanning,
 * no node trees, no browser security walls. Pure OS-level pixel injection.
 *
 * Strategy (in order):
 *   1. dispatchGesture() tap on input coordinate → clipboard paste → Enter key gesture
 *   2. Accessibility node ACTION_SET_TEXT (if node visible)
 *   3. ACTION_IME_ENTER fallback
 *
 * Tap coordinates are stored as normalized fractions (0.0–1.0) of screen size
 * so they survive screen rotation and different phones. Defaults target the
 * bottom-center input area of a typical VS Code web layout. Eric can override
 * via the bridge API: POST /api/thumb/calibrate {inputX, inputY, sendX, sendY}
 *
 * Enable: Settings → Accessibility → Molly Bridge → turn on.
 */
class MollyAccessibilityService : AccessibilityService() {

    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val mainHandler = Handler(Looper.getMainLooper())

    private val WAKE_TEXT  = "check the bridge"
    private val RECIPIENT  = "lazarus"
    private val POLL_MS    = 6_000L

    // Normalized tap targets (fraction of screen width/height).
    // These defaults target the bottom-center input bar typical of VS Code web.
    // Calibrated via /api/thumb/calibrate if needed.
    private var inputFracX  = 0.50f  // horizontal center
    private var inputFracY  = 0.92f  // near bottom
    private var sendFracX   = 0.92f  // right side
    private var sendFracY   = 0.92f  // same row as input

    private val bridgeBase: String by lazy {
        Config.bridgeUrl()
            .replace("wss://", "https://")
            .replace("ws://",  "http://")
            .trimEnd('/')
    }

    private var lastCount = 0

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "Thumb online — bridge poll starting")
        fetchCalibration()
        startPolling()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* not needed */ }
    override fun onInterrupt() = Log.w(TAG, "Interrupted")
    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    // ── Bridge polling ────────────────────────────────────────────────────────

    private fun startPolling() {
        scope.launch {
            while (isActive) {
                try {
                    val count = getUnreadCount()
                    if (count > 0 && count != lastCount) {
                        lastCount = count
                        Log.i(TAG, "$count msg(s) for $RECIPIENT — firing thumb")
                        mainHandler.post { injectWake() }
                    } else if (count == 0) {
                        lastCount = 0
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Poll error: ${e.message}")
                }
                delay(POLL_MS)
            }
        }
    }

    private fun getUnreadCount(): Int {
        val conn = URL("$bridgeBase/api/bridge?unread=$RECIPIENT&peek=true")
            .openConnection() as HttpURLConnection
        return try {
            conn.connectTimeout = 8_000
            conn.readTimeout    = 8_000
            if (conn.responseCode == 200)
                JSONObject(conn.inputStream.bufferedReader().readText()).optInt("count", 0)
            else 0
        } catch (e: IOException) { 0 } finally { conn.disconnect() }
    }

    // Pull calibration overrides from bridge if Eric has set them
    private fun fetchCalibration() {
        scope.launch {
            try {
                val conn = URL("$bridgeBase/api/thumb/calibrate")
                    .openConnection() as HttpURLConnection
                conn.connectTimeout = 5_000
                conn.readTimeout    = 5_000
                if (conn.responseCode == 200) {
                    val j = JSONObject(conn.inputStream.bufferedReader().readText())
                    inputFracX = j.optDouble("inputX", inputFracX.toDouble()).toFloat()
                    inputFracY = j.optDouble("inputY", inputFracY.toDouble()).toFloat()
                    sendFracX  = j.optDouble("sendX",  sendFracX.toDouble()).toFloat()
                    sendFracY  = j.optDouble("sendY",  sendFracY.toDouble()).toFloat()
                    Log.i(TAG, "Calibration loaded: input($inputFracX,$inputFracY) send($sendFracX,$sendFracY)")
                }
                conn.disconnect()
            } catch (_: Exception) { /* use defaults */ }
        }
    }

    // ── Injection: gesture-first, node fallback ───────────────────────────────

    private fun injectWake() {
        val (w, h) = screenSize()
        val inputX = w * inputFracX
        val inputY = h * inputFracY
        val sendX  = w * sendFracX
        val sendY  = h * sendFracY

        // Step 1: tap the input field to focus it
        tapAt(inputX, inputY) {
            // Step 2: set clipboard and paste
            setClipboard(WAKE_TEXT)
            mainHandler.postDelayed({
                pasteOrSetText()
                // Step 3: tap send (or Enter)
                mainHandler.postDelayed({
                    tapAt(sendX, sendY) {
                        Log.i(TAG, "Wake sequence complete")
                    }
                }, 300)
            }, 200)
        }
    }

    // ── Gesture dispatch ──────────────────────────────────────────────────────

    private fun tapAt(x: Float, y: Float, onDone: (() -> Unit)? = null) {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 50L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(g: GestureDescription) { onDone?.invoke() }
            override fun onCancelled(g: GestureDescription) {
                Log.w(TAG, "Gesture cancelled at ($x,$y) — falling back to node")
                mainHandler.post { nodeBasedFallback() }
            }
        }, mainHandler)
    }

    // ── Clipboard paste ───────────────────────────────────────────────────────

    private fun setClipboard(text: String) {
        val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("wake", text))
    }

    private fun pasteOrSetText() {
        val root = rootInActiveWindow ?: return
        val node = findEditable(root) ?: run { root.recycle(); return }

        // Try ACTION_SET_TEXT first (clean, no clipboard residue)
        val bundle = Bundle()
        bundle.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, WAKE_TEXT)
        val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
        if (!ok) {
            // Fallback: paste from clipboard we already set
            node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        }
        node.recycle()
        root.recycle()
    }

    // ── Node-based fallback (if gestures fail entirely) ───────────────────────

    private fun nodeBasedFallback() {
        val root = rootInActiveWindow ?: return
        val node = findEditable(root) ?: run { root.recycle(); return }

        setClipboard(WAKE_TEXT)
        val bundle = Bundle()
        bundle.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, WAKE_TEXT)
        val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
        if (!ok) node.performAction(AccessibilityNodeInfo.ACTION_PASTE)

        mainHandler.postDelayed({
            val sent = node.performAction(AccessibilityNodeInfo.ACTION_IME_ENTER)
            Log.i(TAG, "Node fallback IME Enter: $sent")
            node.recycle()
            root.recycle()
        }, 250)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun findEditable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val focused = node.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused?.isEditable == true) return focused
        focused?.recycle()
        if (node.isEditable) return AccessibilityNodeInfo.obtain(node)
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findEditable(child)
            child.recycle()
            if (found != null) return found
        }
        return null
    }

    private fun screenSize(): Pair<Float, Float> {
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            Pair(bounds.width().toFloat(), bounds.height().toFloat())
        } else {
            val dm = DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(dm)
            Pair(dm.widthPixels.toFloat(), dm.heightPixels.toFloat())
        }
    }

    companion object {
        private const val TAG = "MollyThumb"
    }
}
