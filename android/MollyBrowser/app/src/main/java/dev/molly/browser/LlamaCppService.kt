package dev.molly.browser

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Foreground service that runs the llama-server binary extracted from the
 * official llama.cpp Android ARM64 release artifact.
 *
 * SETUP (one-time, Eric does this manually):
 *   1. On the Revvl Tab, download:
 *      https://github.com/ggml-org/llama.cpp/releases/download/b9843/llama-b9843-bin-android-arm64.tar.gz
 *   2. Extract and place the `llama-server` binary in:
 *      /sdcard/Download/llama-server   (or any path Eric remembers)
 *   3. Place the GGUF model file in:
 *      /sdcard/Download/qwen2.5-3b-q4_k_m.gguf
 *   4. Configure in MollyBrowser Settings → LocalChat → (long-press title)
 *
 * Alternatively, set BINARY_DOWNLOAD_URL and the service will fetch it on first run.
 *
 * Once running, llama-server serves the OpenAI-compatible HTTP API on port 8080.
 * LocalChatActivity targets http://127.0.0.1:8080 by default.
 */
class LlamaCppService : Service() {

    companion object {
        private const val TAG = "LlamaCppService"
        private const val NOTIF_ID = 9001
        private const val CHANNEL_ID = "llama_cpp"

        // Default port llama-server binds to
        const val DEFAULT_PORT = 8080

        // Where we copy the binary inside app-private storage
        private const val BINARY_NAME = "llama-server"

        // Download URL for the official Android ARM64 release (b9843)
        private const val BINARY_DOWNLOAD_URL =
            "https://github.com/ggml-org/llama.cpp/releases/download/b9843/llama-b9843-bin-android-arm64.tar.gz"

        // Intent actions
        const val ACTION_START = "dev.molly.browser.LLAMA_START"
        const val ACTION_STOP  = "dev.molly.browser.LLAMA_STOP"

        // Intent extras
        const val EXTRA_MODEL_PATH  = "model_path"
        const val EXTRA_BINARY_PATH = "binary_path"
        const val EXTRA_PORT        = "port"
        const val EXTRA_CTX_SIZE    = "ctx_size"
        const val EXTRA_THREADS     = "threads"

        private var _process: Process? = null
        val isRunning: Boolean get() = _process?.isAlive == true

        fun defaultModelPath(): String =
            "/sdcard/Download/qwen2.5-3b-q4_k_m.gguf"

        fun defaultBinaryPath(): String =
            "/sdcard/Download/llama-server"

        // Where P4 (bake-crystal script) places the pre-baked persona crystal
        private const val EXTERNAL_CRYSTAL_PATH = "/sdcard/molly/crystals/molly-persona.cache"
        private const val CRYSTAL_NAME = "molly-persona.cache"
    }

    private val executor = Executors.newSingleThreadExecutor()

    // ── Service lifecycle ─────────────────────────────────────────────────────

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopLlama()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> { // ACTION_START or null
                startForeground(NOTIF_ID, buildNotification("Molly Brain: starting…"))

                val modelPath  = intent?.getStringExtra(EXTRA_MODEL_PATH)  ?: defaultModelPath()
                val binaryPath = intent?.getStringExtra(EXTRA_BINARY_PATH) ?: defaultBinaryPath()
                val port       = intent?.getIntExtra(EXTRA_PORT, DEFAULT_PORT) ?: DEFAULT_PORT
                val ctxSize    = intent?.getIntExtra(EXTRA_CTX_SIZE, 2048) ?: 2048
                val threads    = intent?.getIntExtra(EXTRA_THREADS, 4) ?: 4

                executor.execute { launchServer(binaryPath, modelPath, port, ctxSize, threads) }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopLlama()
        executor.shutdown()
    }

    // ── Core launch logic ─────────────────────────────────────────────────────

    private fun launchServer(
        binaryPath: String,
        modelPath: String,
        port: Int,
        ctxSize: Int,
        threads: Int
    ) {
        // If already running, nothing to do
        if (_process?.isAlive == true) {
            Log.i(TAG, "llama-server already running")
            updateNotification("Molly Brain: already running on :$port")
            return
        }

        // Resolve or install the binary
        val binary = resolveOrInstallBinary(binaryPath) ?: run {
            Log.e(TAG, "llama-server binary not found at $binaryPath. " +
                "Download llama-b9843-bin-android-arm64.tar.gz and extract llama-server to $binaryPath")
            updateNotification("Molly Brain: binary missing — see HELP_WANTED.md")
            return
        }

        if (!File(modelPath).exists()) {
            Log.e(TAG, "Model file not found: $modelPath")
            updateNotification("Molly Brain: model missing at $modelPath")
            return
        }

        // Mark executable (required after copy to app-private storage)
        binary.setExecutable(true)

        // Crystal OS persona is pre-baked on the codespace by bake-crystal.sh
        // and dropped at /sdcard/molly/crystals/molly-persona.cache. We install
        // it into the directory llama-server reads slot snapshots from, then
        // POST /slots/0?action=restore after /health goes green.
        // Modern llama.cpp (b9000+) dropped --prompt-cache; /slots is the path.
        val slotDir = File(filesDir, "molly-slots").apply { mkdirs() }
        val crystalFile = resolveOrInstallCrystal(slotDir)

        val cmd = listOf(
            binary.absolutePath,
            "--model",           modelPath,
            "--port",            port.toString(),
            "--ctx-size",        ctxSize.toString(),
            "--threads",         threads.toString(),
            "--host",            "127.0.0.1",        // loopback only — no external exposure
            "--slot-save-path",  slotDir.absolutePath,
            "--parallel",        "1",
            "--no-webui",
            "--log-disable"                          // reduce logcat noise
        )
        Log.i(TAG, "Launching: ${cmd.joinToString(" ")}")

        try {
            val pb = ProcessBuilder(cmd)
                .redirectErrorStream(true)
            pb.environment()["HOME"] = filesDir.absolutePath

            _process = pb.start()
            updateNotification("Molly Brain: booting on :$port")

            // Persona restore runs on a side thread so we can keep draining
            // stdout below. It waits for /health, then POSTs /slots/0?action=restore
            // with the crystal filename. If the crystal file isn't on the device
            // yet (first boot before sync), this is a no-op — llama-server stays
            // up as a blank model.
            if (crystalFile.exists() && crystalFile.length() > 0) {
                Thread({ restorePersonaCrystal(port, crystalFile.name) }, "molly-crystal-restore").start()
            } else {
                Log.w(TAG, "No persona crystal at ${crystalFile.absolutePath} — " +
                    "Molly will boot blank. Sync /sdcard/molly/crystals/$CRYSTAL_NAME from codespace.")
                updateNotification("Molly Brain: running blank on :$port (no crystal)")
            }

            // Drain stdout/stderr to logcat
            _process!!.inputStream.bufferedReader().forEachLine { line ->
                Log.d(TAG, "[llama] $line")
            }

            val exitCode = _process!!.waitFor()
            Log.w(TAG, "llama-server exited with code $exitCode")
            updateNotification("Molly Brain: stopped (exit $exitCode)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch llama-server", e)
            updateNotification("Molly Brain: launch failed — ${e.message}")
        }
    }

    /**
     * Waits up to 60s for /health, then POSTs /slots/0?action=restore with the
     * given filename. The filename is resolved by llama-server inside the
     * --slot-save-path directory. On success, Molly's persona KV state is
     * restored in 2-3s and the next /completion picks up where bake left off.
     */
    private fun restorePersonaCrystal(port: Int, filename: String) {
        val healthUrl = URL("http://127.0.0.1:$port/health")
        var healthy = false
        for (i in 1..60) {
            try {
                val conn = healthUrl.openConnection() as HttpURLConnection
                conn.connectTimeout = 1000
                conn.readTimeout = 1000
                if (conn.responseCode == 200) { healthy = true; conn.disconnect(); break }
                conn.disconnect()
            } catch (_: Exception) { /* not up yet */ }
            Thread.sleep(1000)
        }
        if (!healthy) {
            Log.e(TAG, "Persona restore aborted — llama-server /health never came green")
            updateNotification("Molly Brain: running blank (health timeout)")
            return
        }

        val restoreUrl = URL("http://127.0.0.1:$port/slots/0?action=restore")
        try {
            val conn = restoreUrl.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 5000
            conn.readTimeout = 30000
            conn.setRequestProperty("Content-Type", "application/json")
            val body = "{\"filename\":\"$filename\"}".toByteArray()
            conn.outputStream.use { it.write(body) }
            val code = conn.responseCode
            val resp = (if (code in 200..299) conn.inputStream else conn.errorStream)
                .bufferedReader().use { it.readText() }
            conn.disconnect()
            if (code in 200..299) {
                Log.i(TAG, "Persona crystal restored (HTTP $code): ${resp.take(200)}")
                updateNotification("Molly Brain: persona loaded on :$port")
            } else {
                Log.e(TAG, "Restore failed HTTP $code: ${resp.take(500)}")
                updateNotification("Molly Brain: running blank (restore $code)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Restore POST failed", e)
            updateNotification("Molly Brain: running blank (restore exception)")
        }
    }

    private fun stopLlama() {
        _process?.let { p ->
            if (p.isAlive) {
                p.destroy()
                Log.i(TAG, "llama-server stopped")
            }
        }
        _process = null
    }

    /**
     * Find the binary at [binaryPath], or if it's not there, look in app-private storage.
     * Does NOT auto-download (that would require the user to be online — Eric won't be).
     * Returns null if not found anywhere.
     */
    private fun resolveOrInstallBinary(binaryPath: String): File? {
        // 1. Try the path as provided (e.g., user placed it in Downloads)
        val externalFile = File(binaryPath)
        if (externalFile.exists()) {
            // Copy to app-private storage so we can chmod +x reliably
            val privateFile = File(filesDir, BINARY_NAME)
            if (!privateFile.exists() || privateFile.length() != externalFile.length()) {
                externalFile.copyTo(privateFile, overwrite = true)
            }
            return privateFile
        }

        // 2. Try app-private storage (already installed from a previous run)
        val privateFile = File(filesDir, BINARY_NAME)
        if (privateFile.exists()) return privateFile

        // 3. Try assets/ (if someone bundled it at build time)
        return try {
            assets.open(BINARY_NAME).use { input ->
                FileOutputStream(privateFile).use { out ->
                    input.copyTo(out)
                }
            }
            privateFile
        } catch (_: Exception) { null }
    }

    /**
     * Returns the crystal file in [slotDir] (the dir llama-server reads slot
     * snapshots from). If P4 pre-baked a crystal at the external SD-card path,
     * copies it into [slotDir] so /slots/0?action=restore can find it by name.
     */
    private fun resolveOrInstallCrystal(slotDir: File): File {
        val targetFile = File(slotDir, CRYSTAL_NAME)
        val externalFile = File(EXTERNAL_CRYSTAL_PATH)
        if (externalFile.exists() && externalFile.length() > 0) {
            if (!targetFile.exists() || targetFile.length() != externalFile.length()) {
                Log.i(TAG, "Installing pre-baked persona crystal from $EXTERNAL_CRYSTAL_PATH " +
                    "(${externalFile.length()} bytes) → ${targetFile.absolutePath}")
                externalFile.copyTo(targetFile, overwrite = true)
            }
        }
        return targetFile
    }

    // ── Health check (can be called from other components) ───────────────────

    fun isHealthy(port: Int = DEFAULT_PORT): Boolean {
        return try {
            val conn = URL("http://127.0.0.1:$port/health").openConnection() as HttpURLConnection
            conn.connectTimeout = 2000
            conn.readTimeout = 2000
            val ok = conn.responseCode == 200
            conn.disconnect()
            ok
        } catch (_: Exception) { false }
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Molly Local Brain",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Local LLM inference (llama-server)" }
            getSystemService(NotificationManager::class.java)
                ?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("Molly Brain")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(text))
    }
}
