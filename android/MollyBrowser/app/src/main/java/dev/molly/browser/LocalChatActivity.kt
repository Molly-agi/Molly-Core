package dev.molly.browser

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Native chat UI that talks directly to a local Ollama instance.
 *
 * No cloud, no API key, no Next.js required.
 * Configure via long-press on the title bar.
 * Launch via: molly://?action=local-chat
 */
class LocalChatActivity : AppCompatActivity() {

    private val history = mutableListOf<Pair<String, String>>() // role → content
    private lateinit var chatLog: LinearLayout
    private lateinit var scrollView: ScrollView
    private lateinit var inputField: EditText
    private lateinit var sendButton: Button
    private lateinit var statusText: TextView
    private val ioExecutor = Executors.newSingleThreadExecutor()

    private val ollamaUrl get() = prefs().getString("ollama_url", "http://127.0.0.1:8080")!!
    private val modelName get() = prefs().getString("local_model", "qwen2.5:3b")!!

    private fun prefs() = getSharedPreferences("molly_local_chat", Context.MODE_PRIVATE)

    private val crystalStore by lazy {
        CrystalMemoryStore(java.io.File(
            prefs().getString("crystal_dir", CrystalMemoryStore.DEFAULT_CRYSTAL_DIR)!!
        ))
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
        sendButton.setOnClickListener { onSend() }
        inputField.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) { onSend(); true } else false
        }
        checkFirstRun()
        injectSessionCrystals()
        checkHealth()
    }

    override fun onDestroy() {
        super.onDestroy()
        ioExecutor.shutdown()
    }

    // ── UI Builder (programmatic — no extra layout XML needed) ────────────────

    private fun buildLayout(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1A1A2E.toInt())
        }

        // Title bar
        val titleBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(0xFF16213E.toInt())
            setPadding(24, 20, 24, 20)
            gravity = Gravity.CENTER_VERTICAL
        }

        val backBtn = Button(this).apply {
            text = "←"
            setTextColor(0xFFCCCCCC.toInt())
            setBackgroundColor(0x00000000)
            textSize = 18f
            setOnClickListener { finish() }
        }

        val titleView = TextView(this).apply {
            text = "Molly — Local Chat"
            setTextColor(0xFFE0E0FF.toInt())
            textSize = 17f
            setPadding(12, 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnLongClickListener { showConfigDialog(); true }
        }

        val startBrainBtn = Button(this).apply {
            text = "⚡"
            setTextColor(0xFFFFCC44.toInt())
            setBackgroundColor(0x00000000)
            textSize = 16f
            setOnClickListener { startLocalBrain() }
        }

        statusText = TextView(this).apply {
            text = "● checking"
            setTextColor(0xFFFFCC44.toInt())
            textSize = 12f
        }

        titleBar.addView(backBtn)
        titleBar.addView(titleView)
        titleBar.addView(startBrainBtn)
        titleBar.addView(statusText)

        // Chat scroll area
        chatLog = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 16, 16, 16)
        }
        scrollView = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
            )
            addView(chatLog)
        }

        // Input bar
        val inputBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(0xFF16213E.toInt())
            setPadding(16, 12, 16, 12)
            gravity = Gravity.CENTER_VERTICAL
        }

        inputField = EditText(this).apply {
            hint = "Talk to Molly..."
            setHintTextColor(0xFF666688.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setBackgroundColor(0xFF0F3460.toInt())
            setPadding(16, 14, 16, 14)
            imeOptions = EditorInfo.IME_ACTION_SEND
            maxLines = 4
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        sendButton = Button(this).apply {
            text = "Send"
            setTextColor(0xFFFFFFFF.toInt())
            setBackgroundColor(0xFF533483.toInt())
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(12, 0, 0, 0) }
        }

        inputBar.addView(inputField)
        inputBar.addView(sendButton)

        root.addView(titleBar)
        root.addView(scrollView)
        root.addView(inputBar)
        return root
    }

    // ── Config dialog (long-press title) ──────────────────────────────────────

    private fun showConfigDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 24, 40, 8)
        }
        val urlInput = EditText(this).apply {
            hint = "Server URL (http://127.0.0.1:8080)"
            setText(ollamaUrl)
        }
        val modelInput = EditText(this).apply {
            hint = "Model name (for Ollama) or leave blank"
            setText(modelName)
        }
        val binaryInput = EditText(this).apply {
            hint = "Binary path (llama-server)"
            setText(prefs().getString("local_binary_path", LlamaCppService.defaultBinaryPath()))
        }
        val modelPathInput = EditText(this).apply {
            hint = "GGUF model path"
            setText(prefs().getString("local_model_path", LlamaCppService.defaultModelPath()))
        }
        val crystalDirInput = EditText(this).apply {
            hint = "Crystal memory dir (/sdcard/molly/memory/crystals)"
            setText(prefs().getString("crystal_dir", CrystalMemoryStore.DEFAULT_CRYSTAL_DIR))
        }

        fun label(text: String) = TextView(this).apply {
            this.text = text; setTextColor(0xFF888888.toInt()); setPadding(0, 16, 0, 0)
        }
        layout.addView(label("Server URL"))
        layout.addView(urlInput)
        layout.addView(label("Ollama model name"))
        layout.addView(modelInput)
        layout.addView(label("llama-server binary path"))
        layout.addView(binaryInput)
        layout.addView(label("GGUF model file path"))
        layout.addView(modelPathInput)
        layout.addView(label("Crystal memory directory"))
        layout.addView(crystalDirInput)

        AlertDialog.Builder(this)
            .setTitle("Local Chat Config")
            .setView(layout)
            .setPositiveButton("Save") { _, _ ->
                prefs().edit()
                    .putString("ollama_url", urlInput.text.toString().trim().trimEnd('/'))
                    .putString("local_model", modelInput.text.toString().trim())
                    .putString("local_binary_path", binaryInput.text.toString().trim())
                    .putString("local_model_path", modelPathInput.text.toString().trim())
                    .putString("crystal_dir", crystalDirInput.text.toString().trim())
                    .apply()
                Toast.makeText(this, "Saved. Tap ⚡ to start local brain.", Toast.LENGTH_SHORT).show()
                checkHealth()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ── First-run setup check ─────────────────────────────────────────────────

    private fun checkFirstRun() {
        if (prefs().getBoolean("setup_done", false)) return
        val binaryOk = java.io.File(
            prefs().getString("local_binary_path", LlamaCppService.defaultBinaryPath())!!
        ).exists()
        val modelOk = java.io.File(
            prefs().getString("local_model_path", LlamaCppService.defaultModelPath())!!
        ).exists()
        if (binaryOk && modelOk) {
            prefs().edit().putBoolean("setup_done", true).apply()
            return
        }
        val msg = buildString {
            appendLine("Molly needs two files on your tablet before the local brain can start.")
            appendLine()
            if (!binaryOk) {
                appendLine("1. llama-server binary")
                appendLine("   Download: github.com/ggml-org/llama.cpp/releases/download/b9843/llama-b9843-bin-android-arm64.tar.gz")
                appendLine("   Extract llama-server → place at:")
                appendLine("   /sdcard/Download/llama-server")
                appendLine()
            }
            if (!modelOk) {
                appendLine("${if (!binaryOk) "2" else "1"}. GGUF model file")
                appendLine("   Place your model at:")
                appendLine("   /sdcard/Download/qwen2.5-3b-q4_k_m.gguf")
                appendLine()
            }
            appendLine("Long-press the title bar to change paths.")
            append("Tap ⚡ once files are in place.")
        }
        AlertDialog.Builder(this)
            .setTitle("Setup needed")
            .setMessage(msg)
            .setPositiveButton("Got it") { _, _ -> }
            .show()
    }

    // ── Crystal memory injection ──────────────────────────────────────────────

    private fun injectSessionCrystals() {
        ioExecutor.execute {
            val block = crystalStore.buildContextBlock() ?: return@execute
            runOnUiThread {
                // Insert as a system message at the start of history (not shown as a bubble)
                history.add(0, "system" to block)
            }
        }
    }

    // ── Start llama-server (⚡ button) ─────────────────────────────────────────

    private fun startLocalBrain() {
        val intent = Intent(this, LlamaCppService::class.java).apply {
            action = LlamaCppService.ACTION_START
            putExtra(LlamaCppService.EXTRA_MODEL_PATH,
                prefs().getString("local_model_path", LlamaCppService.defaultModelPath()))
            putExtra(LlamaCppService.EXTRA_BINARY_PATH,
                prefs().getString("local_binary_path", LlamaCppService.defaultBinaryPath()))
            putExtra(LlamaCppService.EXTRA_PORT, LlamaCppService.DEFAULT_PORT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        Toast.makeText(this, "Starting local brain… may take 10-30s", Toast.LENGTH_LONG).show()
        // Re-check health after a brief delay
        inputField.postDelayed({ checkHealth() }, 5000)
    }

    // ── Health check ──────────────────────────────────────────────────────────

    private fun checkHealth() {
        ioExecutor.execute {
            val (online, label) = try {
                // Try llama-server /health first
                val conn = URL("$ollamaUrl/health").openConnection() as HttpURLConnection
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                val code = conn.responseCode
                conn.disconnect()
                if (code == 200) true to "llama-server" else {
                    // Fall back: try Ollama /api/tags
                    val c2 = URL("$ollamaUrl/api/tags").openConnection() as HttpURLConnection
                    c2.connectTimeout = 3000
                    c2.readTimeout = 3000
                    val c2code = c2.responseCode
                    c2.disconnect()
                    (c2code == 200) to "ollama"
                }
            } catch (_: Exception) { false to "" }

            runOnUiThread {
                if (online) {
                    statusText.text = "● online  [$label]"
                    statusText.setTextColor(0xFF44FF88.toInt())
                } else {
                    statusText.text = "● offline  tap ⚡ to start"
                    statusText.setTextColor(0xFFFF6B6B.toInt())
                }
            }
        }
    }

    // ── Send / receive ────────────────────────────────────────────────────────

    private fun onSend() {
        val text = inputField.text.toString().trim()
        if (text.isBlank()) return
        inputField.setText("")

        history.add("user" to text)
        addBubble(text, isUser = true)

        sendButton.isEnabled = false
        statusText.text = "● thinking…"
        statusText.setTextColor(0xFFFFCC44.toInt())

        val snapshot = history.toList()
        ioExecutor.execute {
            val reply = callOllama(snapshot)
            runOnUiThread {
                sendButton.isEnabled = true
                if (reply != null) {
                    history.add("assistant" to reply)
                    addBubble(reply, isUser = false)
                    statusText.text = "● online  [$modelName]"
                    statusText.setTextColor(0xFF44FF88.toInt())
                } else {
                    addBubble("⚠  No response from Ollama ($ollamaUrl). Is it running?", isUser = false)
                    statusText.text = "● offline"
                    statusText.setTextColor(0xFFFF6B6B.toInt())
                }
            }
        }
    }

    private fun callOllama(msgs: List<Pair<String, String>>): String? {
        // Try llama-server (OpenAI-compatible) first, then fall back to Ollama native API
        return callLlamaServer(msgs) ?: callOllamaApi(msgs)
    }

    private fun callLlamaServer(msgs: List<Pair<String, String>>): String? {
        // llama-server exposes /v1/chat/completions (OpenAI-compatible)
        return try {
            val arr = JSONArray()
            for ((role, content) in msgs) {
                arr.put(JSONObject().put("role", role).put("content", content))
            }
            val body = JSONObject()
                .put("messages", arr)
                .put("max_tokens", 1024)
                .put("stream", false)

            val conn = URL("$ollamaUrl/v1/chat/completions").openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 10_000
            conn.readTimeout = 120_000
            conn.setRequestProperty("Content-Type", "application/json")

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
            if (conn.responseCode !in 200..299) { conn.disconnect(); return null }

            val raw = BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).readText()
            conn.disconnect()

            JSONObject(raw)
                .getJSONArray("choices")
                .getJSONObject(0)
                .getJSONObject("message")
                .getString("content")
                .trim()
        } catch (_: Exception) { null }
    }

    private fun callOllamaApi(msgs: List<Pair<String, String>>): String? {
        // Ollama native /api/chat endpoint
        return try {
            val arr = JSONArray()
            for ((role, content) in msgs) {
                arr.put(JSONObject().put("role", role).put("content", content))
            }
            val body = JSONObject()
                .put("model", modelName)
                .put("messages", arr)
                .put("stream", false)

            val conn = URL("$ollamaUrl/api/chat").openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 10_000
            conn.readTimeout = 120_000
            conn.setRequestProperty("Content-Type", "application/json")

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
            if (conn.responseCode !in 200..299) { conn.disconnect(); return null }

            val raw = BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).readText()
            conn.disconnect()

            JSONObject(raw).getJSONObject("message").getString("content").trim()
        } catch (_: Exception) { null }
    }

    // ── Chat bubble ───────────────────────────────────────────────────────────

    private fun addBubble(text: String, isUser: Boolean) {
        val bubble = TextView(this).apply {
            this.text = text
            setTextColor(0xFFEEEEFF.toInt())
            textSize = 15f
            setPadding(20, 14, 20, 14)
            setBackgroundColor(if (isUser) 0xFF533483.toInt() else 0xFF0F3460.toInt())
            maxWidth = (resources.displayMetrics.widthPixels * 0.80).toInt()
        }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = if (isUser) Gravity.END else Gravity.START
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 6, 0, 6) }
        }
        row.addView(bubble)
        chatLog.addView(row)
        scrollView.post { scrollView.fullScroll(ScrollView.FOCUS_DOWN) }
    }
}
