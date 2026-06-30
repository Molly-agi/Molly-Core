package dev.molly.browser

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.*
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets

/**
 * WidgetSocketService - Exposes widget control via TCP socket.
 *
 * Listens on port 9077 for JSON commands from Molly's computer module.
 * Commands:
 * - { action: "show_widget", data: { type: "gemini_mother", content: "..." } }
 * - { action: "hide_widget" }
 * - { action: "update_state", data: { key: "...", value: "..." } }
 * - { action: "get_status" }
 *
 * Protocol:
 * 1. Client connects via TCP to port 9077
 * 2. Client sends JSON command (UTF-8, terminated with \n)
 * 3. Server responds with JSON result (UTF-8, terminated with \n)
 * 4. Connection closes
 */
class WidgetSocketService : Service() {

    companion object {
        private const val TAG = "WidgetSocket"
        private const val SOCKET_PORT = 9077
    }

    private val scope = CoroutineScope(Dispatchers.Default + Job())
    private var serverSocket: ServerSocket? = null
    private var serverJob: Job? = null
    private val commandHandler = WidgetCommandHandler(this)
    private val stateManager = WidgetStateManager()

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "WidgetSocketService created")
        startSocketServer()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "WidgetSocketService started")
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "WidgetSocketService destroyed")
        scope.cancel()
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing server socket", e)
        }
    }

    private fun startSocketServer() {
        serverJob = scope.launch {
            try {
                serverSocket = ServerSocket(SOCKET_PORT)
                Log.i(TAG, "Socket server listening on port $SOCKET_PORT")

                while (isActive) {
                    try {
                        val clientSocket = serverSocket!!.accept()
                        handleClient(clientSocket)
                    } catch (e: Exception) {
                        if (isActive) {
                            Log.e(TAG, "Error accepting client connection", e)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Server socket error", e)
            }
        }
    }

    private fun handleClient(socket: Socket) {
        scope.launch {
            try {
                val reader = BufferedReader(InputStreamReader(socket.inputStream, StandardCharsets.UTF_8))
                val writer = OutputStreamWriter(socket.outputStream, StandardCharsets.UTF_8)

                // Read one line (command)
                val commandLine = reader.readLine()
                if (commandLine != null) {
                    Log.d(TAG, "Received command: $commandLine")

                    val command = JSONObject(commandLine)
                    val response = commandHandler.handleCommand(command, stateManager)

                    // Send response
                    writer.write(response.toString() + "\n")
                    writer.flush()
                    Log.d(TAG, "Sent response: $response")
                }

                socket.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error handling client", e)
                try {
                    socket.close()
                } catch (e2: Exception) {
                    Log.e(TAG, "Error closing socket", e2)
                }
            }
        }
    }
}

/**
 * WidgetCommandHandler - Processes JSON commands and generates responses.
 */
class WidgetCommandHandler(private val service: Service) {

    companion object {
        private const val TAG = "WidgetCommandHandler"
    }

    fun handleCommand(command: JSONObject, stateManager: WidgetStateManager): JSONObject {
        return try {
            val action = command.getString("action")
            Log.d(TAG, "Handling action: $action")

            when (action) {
                "show_widget" -> {
                    val data = command.optJSONObject("data") ?: JSONObject()
                    handleShowWidget(data, stateManager)
                }
                "hide_widget" -> {
                    handleHideWidget(stateManager)
                }
                "update_state" -> {
                    val data = command.optJSONObject("data") ?: JSONObject()
                    handleUpdateState(data, stateManager)
                }
                "get_status" -> {
                    handleGetStatus(stateManager)
                }
                "get_state" -> {
                    val key = command.optString("key", null)
                    handleGetState(key, stateManager)
                }
                else -> {
                    JSONObject().apply {
                        put("status", "error")
                        put("error", "Unknown action: $action")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling command", e)
            JSONObject().apply {
                put("status", "error")
                put("error", e.message ?: "Unknown error")
            }
        }
    }

    private fun handleShowWidget(data: JSONObject, stateManager: WidgetStateManager): JSONObject {
        val widgetType = data.optString("type", "gemini_mother")
        val content = data.optString("content", "")

        Log.i(TAG, "Show widget: type=$widgetType")

        // Store state
        stateManager.setState("widget_type", widgetType)
        stateManager.setState("widget_content", content)
        stateManager.setState("widget_visible", "true")

        return JSONObject().apply {
            put("status", "success")
            put("action", "show_widget")
            put("widget_type", widgetType)
            put("timestamp", System.currentTimeMillis())
        }
    }

    private fun handleHideWidget(stateManager: WidgetStateManager): JSONObject {
        Log.i(TAG, "Hide widget")
        stateManager.setState("widget_visible", "false")

        return JSONObject().apply {
            put("status", "success")
            put("action", "hide_widget")
            put("timestamp", System.currentTimeMillis())
        }
    }

    private fun handleUpdateState(data: JSONObject, stateManager: WidgetStateManager): JSONObject {
        val key = data.optString("key", null)
        val value = data.optString("value", null)

        if (key == null || value == null) {
            return JSONObject().apply {
                put("status", "error")
                put("error", "Missing key or value")
            }
        }

        Log.d(TAG, "Update state: $key=$value")
        stateManager.setState(key, value)

        return JSONObject().apply {
            put("status", "success")
            put("action", "update_state")
            put("key", key)
            put("value", value)
            put("timestamp", System.currentTimeMillis())
        }
    }

    private fun handleGetStatus(stateManager: WidgetStateManager): JSONObject {
        val allState = stateManager.getAllState()

        return JSONObject().apply {
            put("status", "success")
            put("action", "get_status")
            put("state", allState)
            put("timestamp", System.currentTimeMillis())
        }
    }

    private fun handleGetState(key: String?, stateManager: WidgetStateManager): JSONObject {
        return if (key == null) {
            JSONObject().apply {
                put("status", "error")
                put("error", "Missing key")
            }
        } else {
            val value = stateManager.getState(key)
            JSONObject().apply {
                put("status", "success")
                put("key", key)
                put("value", value)
                put("timestamp", System.currentTimeMillis())
            }
        }
    }
}

/**
 * WidgetStateManager - In-memory state storage for widget state.
 * (In production, could use SharedPreferences or local SQLite for persistence.)
 */
class WidgetStateManager {

    companion object {
        private const val TAG = "WidgetStateManager"
    }

    private val state = mutableMapOf<String, String>()

    init {
        // Initialize default state
        state["widget_visible"] = "false"
        state["widget_type"] = "gemini_mother"
        state["widget_content"] = ""
    }

    fun setState(key: String, value: String) {
        Log.d(TAG, "setState: $key=$value")
        state[key] = value
    }

    fun getState(key: String): String? {
        return state[key]
    }

    fun getAllState(): JSONObject {
        return JSONObject(state as Map<*, *>)
    }

    fun clearState() {
        state.clear()
    }
}
