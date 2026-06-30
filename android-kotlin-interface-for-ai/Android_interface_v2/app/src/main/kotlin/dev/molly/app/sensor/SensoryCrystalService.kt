package dev.molly.app.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import dev.molly.app.bridge.BridgeConnection
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.math.sqrt

/**
 * Gap 5 — sensory significance bridge (Android side).
 *
 * Samples accelerometer, light, and proximity sensors at a fixed window
 * interval and emits sensor windows to the bridge for Lazarus's TS-side
 * significance scorer to evaluate. Windows that score >= 0.7 on the server
 * trigger crystal formation in memory-crystallizer.ts.
 *
 * Wire into MollyService:
 *   private lateinit var sensoryCrystal: SensoryCrystalService
 *   // in onCreate():
 *   sensoryCrystal = SensoryCrystalService(
 *       getSystemService(Context.SENSOR_SERVICE) as SensorManager,
 *       bridge, lifecycleScope)
 *   // in onStartCommand(): sensoryCrystal.start()
 *   // in onDestroy():      sensoryCrystal.stop()
 */
class SensoryCrystalService(
    private val sensorManager: SensorManager,
    private val bridge: BridgeConnection,
    private val scope: CoroutineScope,
    private val windowMs: Long = WINDOW_MS,
) {
    // ── Sensor sample accumulators ──────────────────────────────────────────

    @Volatile private var accelX = 0f
    @Volatile private var accelY = 0f
    @Volatile private var accelZ = 0f
    private val accelMags = ArrayDeque<Float>()

    @Volatile private var lightLux = 0f
    private val lightSamples = ArrayDeque<Float>()

    @Volatile private var proximityNear = false

    // ── Lifecycle ───────────────────────────────────────────────────────────

    private var windowJob: Job? = null
    private var accelSensor: Sensor? = null
    private var lightSensor: Sensor? = null
    private var proxSensor: Sensor? = null

    private val sensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            when (event.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> {
                    accelX = event.values[0]
                    accelY = event.values[1]
                    accelZ = event.values[2]
                    val mag = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ)
                    if (accelMags.size >= MAX_SAMPLES) accelMags.removeFirst()
                    accelMags.addLast(mag)
                }
                Sensor.TYPE_LIGHT -> {
                    lightLux = event.values[0]
                    if (lightSamples.size >= MAX_SAMPLES) lightSamples.removeFirst()
                    lightSamples.addLast(lightLux)
                }
                Sensor.TYPE_PROXIMITY -> {
                    proximityNear = event.values[0] < (event.sensor.maximumRange / 2f)
                }
            }
        }

        override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
    }

    fun start() {
        if (windowJob?.isActive == true) return

        accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT)
        proxSensor  = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY)

        accelSensor?.let { sensorManager.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_NORMAL) }
        lightSensor?.let { sensorManager.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_NORMAL) }
        proxSensor?.let  { sensorManager.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_NORMAL) }

        windowJob = scope.launch { windowLoop() }
        Log.i(TAG, "started — window=${windowMs}ms")
    }

    fun stop() {
        windowJob?.cancel()
        windowJob = null
        sensorManager.unregisterListener(sensorListener)
        Log.i(TAG, "stopped")
    }

    // ── Window emission ─────────────────────────────────────────────────────

    private suspend fun windowLoop() {
        while (scope.isActive) {
            delay(windowMs)
            if (!bridge.isConnected()) continue
            val payload = buildWindow() ?: continue
            val sent = bridge.sendEvent(payload.toString())
            if (!sent) Log.w(TAG, "sendEvent backpressure — window dropped")
        }
    }

    /**
     * Build a sensor window JSON. Returns null if there is no meaningful data
     * (e.g., sensors unavailable or all samples are zero).
     */
    private fun buildWindow(): JSONObject? {
        val accelSnap = accelMags.toList()
        val lightSnap = lightSamples.toList()

        if (accelSnap.isEmpty() && lightSnap.isEmpty()) return null

        val accelMean = if (accelSnap.isNotEmpty()) accelSnap.average().toFloat() else 0f
        val accelVar  = if (accelSnap.size > 1) {
            accelSnap.map { (it - accelMean) * (it - accelMean) }.average().toFloat()
        } else 0f

        val lightMean  = if (lightSnap.isNotEmpty()) lightSnap.average().toFloat() else 0f
        val lightDelta = if (lightSnap.size > 1) lightSnap.last() - lightSnap.first() else 0f

        // Skip low-signal windows — no motion (within gravity noise) + stable light
        val moving = accelVar > ACCEL_VAR_THRESHOLD
        val lightChange = kotlin.math.abs(lightDelta) > LIGHT_DELTA_THRESHOLD
        if (!moving && !lightChange && !proximityNear) return null

        return JSONObject().apply {
            put("type", "sensorWindow")
            put("ts", System.currentTimeMillis())
            put("windowMs", windowMs)
            put("accel", JSONObject().apply {
                put("meanMag", accelMean.roundTo(3))
                put("variance", accelVar.roundTo(4))
                put("samples", accelSnap.size)
            })
            put("light", JSONObject().apply {
                put("meanLux", lightMean.roundTo(1))
                put("deltaLux", lightDelta.roundTo(1))
            })
            put("proximity", JSONObject().apply {
                put("near", proximityNear)
            })
        }
    }

    companion object {
        private const val TAG = "SensoryCrystal"
        private const val WINDOW_MS = 5_000L
        private const val MAX_SAMPLES = 50
        private const val ACCEL_VAR_THRESHOLD = 0.09f  // ~0.3g² — filters gravity noise
        private const val LIGHT_DELTA_THRESHOLD = 20f  // lux — ignores minor ambient flicker
    }
}

private fun Float.roundTo(decimals: Int): Double {
    val factor = Math.pow(10.0, decimals.toDouble())
    return Math.round(this * factor) / factor
}
