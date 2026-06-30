package dev.molly.browser

import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * Reads crystal memory JSON files from on-device storage and provides ranked
 * recall for context injection into LocalChatActivity.
 *
 * Crystal files are produced by the Molly brain (crystallizer.ts) and placed at:
 *   /sdcard/molly/memory/crystals/{id}.json
 *
 * Each crystal JSON has the shape:
 *   { id, summary, significance: float, sigVector: {emotionalResonance, ...},
 *     timestamp, sourceEngrams: [...] }
 *
 * Significance tiers (matching P4 bake-crystal thresholds):
 *   >= 0.8  — baked into KV persona crystal (always present via prompt cache)
 *   0.5–0.8 — injected at session start as system message context (THIS CLASS)
 *   < 0.5   — retrieved on demand via semantic search (future)
 */
class CrystalMemoryStore(private val crystalDir: File) {

    companion object {
        private const val TAG = "CrystalMemoryStore"

        // Primary path where Molly writes crystals
        const val DEFAULT_CRYSTAL_DIR = "/sdcard/molly/memory/crystals"

        // Significance threshold for session-start injection (Tier 2)
        private const val SESSION_INJECT_MIN = 0.5f
        private const val SESSION_INJECT_MAX = 0.8f

        // Max crystals to inject (keep system message under ~2K tokens)
        private const val MAX_INJECT_COUNT = 20
    }

    data class Crystal(
        val id: String,
        val summary: String,
        val significance: Float,
        val timestamp: Long
    )

    fun load(): List<Crystal> {
        if (!crystalDir.exists()) {
            Log.d(TAG, "Crystal dir not found: ${crystalDir.absolutePath}")
            return emptyList()
        }

        val crystals = crystalDir.listFiles { f -> f.extension == "json" }
            ?.mapNotNull { parseCrystal(it) }
            ?: emptyList()

        Log.i(TAG, "Loaded ${crystals.size} crystals from ${crystalDir.absolutePath}")
        return crystals.sortedByDescending { it.significance }
    }

    /**
     * Returns crystals in the Tier 2 range (0.5–0.8 significance) for session injection.
     * Tier 1 (>=0.8) are baked into the KV persona crystal via --prompt-cache-all.
     * Tier 3 (<0.5) are retrieved on demand (not yet implemented on-device).
     */
    fun sessionCrystals(): List<Crystal> =
        load()
            .filter { it.significance in SESSION_INJECT_MIN..SESSION_INJECT_MAX }
            .take(MAX_INJECT_COUNT)

    /**
     * Formats session crystals as a system message block for injection.
     * Returns null if no session crystals are available.
     */
    fun buildContextBlock(): String? {
        val crystals = sessionCrystals()
        if (crystals.isEmpty()) return null

        val sb = StringBuilder()
        sb.appendLine("[MOLLY MEMORY — session context]")
        crystals.forEachIndexed { i, c ->
            sb.appendLine("${i + 1}. ${c.summary} (significance: ${"%.2f".format(c.significance)})")
        }
        sb.appendLine("[END MEMORY]")
        return sb.toString().trim()
    }

    private fun parseCrystal(file: File): Crystal? = try {
        val json = JSONObject(file.readText())
        Crystal(
            id          = json.optString("id", file.nameWithoutExtension),
            summary     = json.optString("summary", ""),
            significance= json.optDouble("significance", 0.0).toFloat(),
            timestamp   = json.optLong("timestamp", 0L)
        ).takeIf { it.summary.isNotBlank() }
    } catch (e: Exception) {
        Log.w(TAG, "Failed to parse crystal ${file.name}: ${e.message}")
        null
    }
}
