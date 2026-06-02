package dev.molly.app

import android.app.Application
import android.content.Context
import android.util.Log
import dev.molly.app.auth.KeystoreManager
import java.util.UUID

class MollyApp : Application() {
  override fun onCreate() {
    super.onCreate()
    // In debug builds, auto-provision the bridge secret if a debug secret is
    // baked in via BuildConfig and the keystore has no secret yet.
    if (BuildConfig.DEBUG) {
      val debugSecret = BuildConfig.DEBUG_BRIDGE_SECRET
      if (debugSecret.isNotEmpty()) {
        val km = KeystoreManager(this)
        if (km.getBridgeSecret().isNullOrEmpty()) {
          km.setBridgeSecret(debugSecret)
          Log.i("MollyApp", "Debug bridge secret provisioned")
        }
      }
    }
  }
}

object DeviceId {
  private const val PREFS = "molly_device"
  private const val KEY = "device_id"

  fun get(context: Context): String {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return p.getString(KEY, null) ?: UUID.randomUUID().toString().also {
      p.edit().putString(KEY, it).apply()
    }
  }
}
