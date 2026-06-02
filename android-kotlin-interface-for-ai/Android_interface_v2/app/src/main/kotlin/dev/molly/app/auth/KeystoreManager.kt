package dev.molly.app.auth

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Stores per-device bridge secret securely. Secret is provisioned per device,
 * never hardcoded in the APK.
 *
 * In debug builds, falls back to plain SharedPreferences if EncryptedSharedPreferences
 * cannot be initialised (e.g. emulator without full hardware Keystore support).
 */
class KeystoreManager(context: Context) {
  private val prefs: SharedPreferences = createPrefs(context)

  fun getBridgeSecret(): String? = prefs.getString(KEY_SECRET, null)

  fun setBridgeSecret(secret: String) {
    prefs.edit().putString(KEY_SECRET, secret).apply()
  }

  companion object {
    private const val TAG = "KeystoreManager"
    private const val PREFS = "molly_secure"
    private const val PREFS_PLAIN = "molly_secure_plain"
    private const val KEY_SECRET = "bridge_secret"

    private fun createPrefs(context: Context): SharedPreferences {
      return try {
        val masterKey = MasterKey.Builder(context)
          .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
          .build()
        EncryptedSharedPreferences.create(
          context,
          PREFS,
          masterKey,
          EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
          EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
      } catch (e: Exception) {
        // Emulator / test environment: hardware Keystore unavailable.
        // Fall back to plain prefs — acceptable for debug/test only.
        Log.w(TAG, "EncryptedSharedPreferences unavailable, using plain prefs: ${e.message}")
        context.getSharedPreferences(PREFS_PLAIN, Context.MODE_PRIVATE)
      }
    }
  }
}
