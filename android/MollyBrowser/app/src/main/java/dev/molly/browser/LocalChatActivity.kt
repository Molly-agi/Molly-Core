package dev.molly.browser

import android.app.AlertDialog
import android.content.Context
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

    private val ollamaUrl get() = prefs().getString("ollama_url", "http://127.0.0.1:11434")!!
    private val modelName get() = prefs().getString("local_model", "qwen2.5:3b")!!

    private fun prefs() = getSharedPreferences("molly_local_chat", Context.MODE_PRIVATE)

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
        sendButton.setOnClickListener { onSend() }
        inputField.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) { onSend(); true } else false
        }
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

        statusText = TextView(this).apply {
            text = "● checking"
            setTextColor(0xFFFFCC44.toInt())
            textSize = 12f
        }

        titleBar.addView(backBtn)
        titleBar.addView(titleView)
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
            hint = "Ollama URL"
            setText(ollamaUrl)
        }
        val modelInput = EditText(this).apply {
            hint = "Model name"
            setText(modelName)
        }
        layout.addView(TextView(this).apply { text = "Ollama URL"; setTextColor(0xFF888888.toInt()) })
        layout.addView(urlInput)
        layout.addView(TextView(this).apply { text = "Model"; setTextColor(0xFF888888.toInt()); setPadding(0, 16, 0, 0) })
        layout.addView(modelInput)

        AlertDialog.Builder(this)
            .setTitle("Local Chat Config")
            .setView(layout)
            .setPositiveButton("Save") { _, _ ->
                prefs().edit()
                    .putString("ollama_url", urlInput.text.toString().trim().trimEnd('/'))
                    .putString("local_model", modelInput.text.toString().trim())
                    .apply()
                Toast.makeText(this, "Saved. Checking connection…", Toast.LENGTH_SHORT).show()
                checkHealth()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ── Health check ──────────────────────────────────────────────────────────

    private fun checkHealth() {
        ioExecutor.execute {
            val online = try {
                val conn = URL("$ollamaUrl/api/tags").openConnection() as HttpURLConnection
                conn.connectTimeout = 4000
                conn.readTimeout = 4000
                val code = conn.responseCode
                conn.disconnect()
                code == 200
            } catch (_: Exception) { false }

            runOnUiThread {
                if (online) {
                    statusText.text = "● online  [$modelName]"
                    statusText.setTextColor(0xFF44FF88.toInt())
                } else {
                    statusText.text = "● offline"
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
            conn.readTimeout = 120_000  // local inference can be slow
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
