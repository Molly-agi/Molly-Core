package dev.molly.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import dev.molly.app.audio.MicSwitchboard
import dev.molly.app.auth.HmacSigner
import dev.molly.app.bridge.BridgeConnection
import dev.molly.app.bridge.OkHttpBridgeConnection
import dev.molly.app.config.Config
import dev.molly.app.sensor.SensoryCrystalService

class MollyService : LifecycleService() {
  private lateinit var bridge: BridgeConnection
  private lateinit var mic: MicSwitchboard
  private lateinit var sensoryCrystal: SensoryCrystalService

  override fun onCreate() {
    super.onCreate()
    instanceRef = this
    createChannel()

    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    mic = MicSwitchboard(audioManager, lifecycleScope)

    val sensorManager = getSystemService(Context.SENSOR_SERVICE) as android.hardware.SensorManager

    val hmac = HmacSigner(this)
    bridge =
      OkHttpBridgeConnection(
        bridgeUrl = Config.bridgeUrl(),
        deviceId = DeviceId.get(this),
        signer =
          object : OkHttpBridgeConnection.AuthSigner {
            override fun sign(payload: String): String = hmac.sign(payload)

            override fun isProvisioned(): Boolean = hmac.isProvisioned()
          },
        scope = lifecycleScope,
        onProvision = { secret ->
          // Bridge sent us a secret — store it, reconnect will auto-authenticate
          hmac.setBridgeSecret(secret)
          android.util.Log.i("MollyService", "Device provisioned — reconnecting with HMAC auth")
        },
      )

    bridge.setListener(
      object : BridgeConnection.Listener {
        override fun onConnecting() {
          val msg = getString(R.string.service_status_connecting)
          updateNotification(msg)
          statusListener?.invoke(msg)
        }

        override fun onConnected() {
          val msg = getString(R.string.service_status_connected)
          updateNotification(msg)
          statusListener?.invoke(msg)
        }

        override fun onReconnecting(attempt: Int, nextRetryMs: Long) {
          val msg = "${getString(R.string.service_status_reconnecting)} (attempt $attempt, retry in ${nextRetryMs / 1000}s)"
          updateNotification(msg)
          statusListener?.invoke(msg)
        }

        override fun onDisconnected(reason: String) {
          val msg = "${getString(R.string.service_status_disconnected)} ($reason)"
          updateNotification(msg)
          statusListener?.invoke(msg)
        }

        override fun onMessage(json: String) {
          // Inbound command routing lands here in next step.
        }
      },
    )

    sensoryCrystal = SensoryCrystalService(sensorManager, bridge, lifecycleScope)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    startAsForeground()
    bridge.start()
    sensoryCrystal.start()
    // Audio capture is NOT auto-started to reduce idle battery drain.
    // Microphone will be activated only when explicitly requested via bridge message.
    // This keeps the service lean: WebSocket spine + FGS notification only.
    if (hasRecordAudioPermission()) {
      // Audio permission exists but mic is not started yet
      android.util.Log.i("MollyService", "Audio capture available but idle (on-demand only)")
    }
    return START_STICKY
  }

  override fun onDestroy() {
    sensoryCrystal.stop()
    bridge.stop()
    mic.stop()
    super.onDestroy()
  }

  override fun onBind(intent: Intent): IBinder? {
    super.onBind(intent)
    return null
  }

  // Called by bridge when audio capture is needed (e.g., when Molly requests it)
  fun startAudioCapture() {
    if (hasRecordAudioPermission()) {
      mic.start()
      android.util.Log.i("MollyService", "Audio capture started on-demand")
    } else {
      android.util.Log.w("MollyService", "Audio capture requested but RECORD_AUDIO permission missing")
    }
  }

  // Called by bridge when audio capture should stop
  fun stopAudioCapture() {
    mic.stop()
    android.util.Log.i("MollyService", "Audio capture stopped")
  }

  private fun hasRecordAudioPermission(): Boolean {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun startAsForeground() {
    val notif = buildNotification(getString(R.string.service_status_connecting))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  private fun buildNotification(text: String): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(getString(R.string.app_name))
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setOngoing(true)
      .build()
  }

  private fun updateNotification(text: String) {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    mgr.notify(NOTIF_ID, buildNotification(text))
  }

  private fun createChannel() {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "Molly Service", NotificationManager.IMPORTANCE_LOW)
    mgr.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "molly_spine"
    private const val NOTIF_ID = 1
    private var statusListener: ((String) -> Unit)? = null
    private var instanceRef: MollyService? = null

    fun startWith(context: Context) {
      val i = Intent(context, MollyService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(i)
      } else {
        context.startService(i)
      }
    }

    fun setStatusListener(listener: (String) -> Unit) {
      statusListener = listener
    }

    fun retry(context: Context) {
      instanceRef?.bridge?.stop()
      instanceRef?.bridge?.start()
    }

    fun stop(context: Context) {
      val i = Intent(context, MollyService::class.java)
      context.stopService(i)
    }
  }
}
