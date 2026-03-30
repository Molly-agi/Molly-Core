package dev.molly.browser

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * ConnectionKeeperService - Foreground Service that keeps Codespace connections alive.
 *
 * Why this works:
 * 1. Foreground services with persistent notification survive app backgrounding
 * 2. PARTIAL_WAKE_LOCK keeps CPU running when screen is off
 * 3. dataSync service type tells Android this is for network data transfer
 * 4. START_STICKY ensures service restarts if killed
 *
 * This is fundamentally different from Chrome tabs which Android aggressively kills.
 */
class ConnectionKeeperService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var heartbeatCount = 0

    // Heartbeat runnable - logs every 30 seconds to prove we're alive
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            heartbeatCount++
            Log.d(TAG, "Heartbeat #$heartbeatCount - Connection keeper alive")

            // Update notification with heartbeat count (optional)
            if (heartbeatCount % 10 == 0) {
                updateNotification("Active - ${heartbeatCount * 30}s uptime")
            }

            // Schedule next heartbeat
            handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")

        // Create notification channel (required for Android 8+)
        createNotificationChannel()

        // Acquire wake lock to keep CPU running
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service started")

        // Check for stop action
        if (intent?.action == ACTION_STOP) {
            Log.d(TAG, "Stop action received")
            stopSelf()
            return START_NOT_STICKY
        }

        // Create and show foreground notification
        val notification = createNotification("Maintaining Codespace connection")

        // Start as foreground service with dataSync type
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Start heartbeat
        handler.removeCallbacks(heartbeatRunnable)
        handler.post(heartbeatRunnable)

        // START_STICKY: Restart service if killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d(TAG, "Service destroyed")

        // Stop heartbeat
        handler.removeCallbacks(heartbeatRunnable)

        // Release wake lock
        releaseWakeLock()

        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Connection Keeper",
                NotificationManager.IMPORTANCE_LOW  // Low importance = no sound
            ).apply {
                description = "Keeps Codespace WebSocket connections alive"
                setShowBadge(false)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(message: String): Notification {
        // Intent to open the app when notification tapped
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        // Intent to stop the service
        val stopIntent = Intent(this, ConnectionKeeperService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Molly Connected")
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_info)  // TODO: Custom icon
            .setOngoing(true)  // Can't be swiped away
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openPendingIntent)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop",
                stopPendingIntent
            )
            .build()
    }

    private fun updateNotification(message: String) {
        val notification = createNotification(message)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "MollyBrowser::ConnectionKeeper"
        ).apply {
            // Acquire with timeout (1 hour, will be re-acquired by heartbeat)
            acquire(60 * 60 * 1000L)
        }
        Log.d(TAG, "Wake lock acquired")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Wake lock released")
            }
        }
        wakeLock = null
    }

    companion object {
        private const val TAG = "ConnectionKeeper"
        private const val CHANNEL_ID = "molly_connection"
        private const val NOTIFICATION_ID = 1
        private const val HEARTBEAT_INTERVAL_MS = 30_000L  // 30 seconds
        const val ACTION_STOP = "dev.molly.browser.STOP_SERVICE"
    }
}
