package dev.molly.browser

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.widget.Toast

/**
 * BatteryOptimization - Request exemption from battery optimization.
 *
 * Why this matters:
 * - Samsung, Xiaomi, Huawei, OnePlus aggressively kill background apps
 * - Battery optimization exemption tells Android "don't kill this app"
 * - Without this, the foreground service might still get killed on some devices
 */
object BatteryOptimization {

    private const val TAG = "BatteryOptimization"

    /**
     * Check if the app is already exempt from battery optimization.
     */
    fun isExempt(context: Context): Boolean {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Request battery optimization exemption.
     *
     * Shows a system dialog asking the user to exempt this app.
     * This is a one-time request - user can always change in settings.
     */
    fun requestExemption(context: Context) {
        if (isExempt(context)) {
            Log.d(TAG, "Already exempt from battery optimization")
            return
        }

        try {
            // Direct intent to add app to battery optimization whitelist
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            context.startActivity(intent)
            Log.d(TAG, "Requested battery optimization exemption")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request exemption: ${e.message}")
            // Fallback: Open battery optimization settings
            openBatterySettings(context)
        }
    }

    /**
     * Open the battery optimization settings screen.
     *
     * Use this as a fallback or to let users manually toggle the setting.
     */
    fun openBatterySettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open battery settings: ${e.message}")
            Toast.makeText(
                context,
                "Please manually disable battery optimization for MollyBrowser in Settings",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    /**
     * Show status of battery optimization to user.
     */
    fun showStatus(context: Context) {
        val status = if (isExempt(context)) {
            "Battery optimization is DISABLED (good!)"
        } else {
            "Battery optimization is ENABLED (connections may drop)"
        }
        Toast.makeText(context, status, Toast.LENGTH_LONG).show()
    }
}
