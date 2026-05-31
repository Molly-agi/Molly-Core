package dev.molly.browser

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * WiFi and Bluetooth scanner for Molly's presence detection system.
 *
 * Exposes scanning capabilities to JavaScript via WebView interface.
 * The web app can call MollySensing.scan() to get nearby networks and devices.
 */
class WiFiScanner(
    private val context: Context,
    webView: WebView
) {
    private val webViewRef = WeakReference(webView)
    private val wifiManager: WifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private val bluetoothManager: BluetoothManager? = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter

    private val handler = Handler(Looper.getMainLooper())
    private var isScanning = false
    private var scanIntervalMs = 2000L

    // Last scan results
    private var lastWifiResults: List<ScanResult> = emptyList()
    private val bluetoothDevices = mutableMapOf<String, BluetoothDeviceInfo>()

    data class BluetoothDeviceInfo(
        val address: String,
        val name: String?,
        val rssi: Int,
        val type: String,
        val lastSeen: Long
    )

    // WiFi scan receiver
    private val wifiScanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == WifiManager.SCAN_RESULTS_AVAILABLE_ACTION) {
                val success = intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false)
                if (success || true) { // Always get results even if scan didn't trigger
                    lastWifiResults = wifiManager.scanResults ?: emptyList()
                    notifyWebView()
                }
            }
        }
    }

    // Bluetooth scan receiver
    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }

                    val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()

                    device?.let {
                        val name = try {
                            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
                                it.name
                            } else null
                        } catch (e: SecurityException) { null }

                        val type = when (it.type) {
                            BluetoothDevice.DEVICE_TYPE_CLASSIC -> "classic"
                            BluetoothDevice.DEVICE_TYPE_LE -> "ble"
                            BluetoothDevice.DEVICE_TYPE_DUAL -> "dual"
                            else -> "unknown"
                        }

                        bluetoothDevices[it.address] = BluetoothDeviceInfo(
                            address = it.address,
                            name = name,
                            rssi = rssi,
                            type = type,
                            lastSeen = System.currentTimeMillis()
                        )
                    }
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                    // Discovery finished, notify web
                    notifyWebView()
                }
            }
        }
    }

    init {
        // Register WiFi receiver
        val wifiFilter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
        context.registerReceiver(wifiScanReceiver, wifiFilter)

        // Register Bluetooth receiver
        val btFilter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        context.registerReceiver(bluetoothReceiver, btFilter)
    }

    /**
     * JavaScript interface exposed to WebView as window.MollySensing
     */
    @JavascriptInterface
    fun startScanning(intervalMs: Int = 2000): Boolean {
        if (isScanning) return true

        scanIntervalMs = intervalMs.toLong().coerceIn(1000, 10000)
        isScanning = true

        // Start periodic scanning
        handler.post(object : Runnable {
            override fun run() {
                if (!isScanning) return
                performScan()
                handler.postDelayed(this, scanIntervalMs)
            }
        })

        return true
    }

    @JavascriptInterface
    fun stopScanning() {
        isScanning = false
        handler.removeCallbacksAndMessages(null)

        // Stop Bluetooth discovery
        try {
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED) {
                bluetoothAdapter?.cancelDiscovery()
            }
        } catch (e: SecurityException) { /* ignore */ }
    }

    @JavascriptInterface
    fun scan(): String {
        performScan()
        return getResultsJson()
    }

    @JavascriptInterface
    fun getResults(): String {
        return getResultsJson()
    }

    @JavascriptInterface
    fun isWifiEnabled(): Boolean {
        return wifiManager.isWifiEnabled
    }

    @JavascriptInterface
    fun isBluetoothEnabled(): Boolean {
        return bluetoothAdapter?.isEnabled ?: false
    }

    private fun performScan() {
        // WiFi scan
        try {
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                @Suppress("DEPRECATION")
                wifiManager.startScan()
            }
        } catch (e: SecurityException) { /* ignore */ }

        // Bluetooth scan
        try {
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED) {
                if (bluetoothAdapter?.isDiscovering == true) {
                    bluetoothAdapter.cancelDiscovery()
                }
                bluetoothAdapter?.startDiscovery()
            }
        } catch (e: SecurityException) { /* ignore */ }
    }

    private fun getResultsJson(): String {
        val result = JSONObject()

        // WiFi networks
        val networks = JSONArray()
        for (scanResult in lastWifiResults) {
            val network = JSONObject().apply {
                put("ssid", scanResult.SSID ?: "")
                put("bssid", scanResult.BSSID ?: "")
                put("rssi", scanResult.level)
                put("frequency", scanResult.frequency)
                put("channel", frequencyToChannel(scanResult.frequency))
                put("capabilities", scanResult.capabilities ?: "")
                put("lastSeen", System.currentTimeMillis())
            }
            networks.put(network)
        }
        result.put("networks", networks)

        // Bluetooth devices
        val devices = JSONArray()
        val now = System.currentTimeMillis()
        val staleThreshold = 30000L // 30 seconds

        bluetoothDevices.values
            .filter { now - it.lastSeen < staleThreshold }
            .forEach { device ->
                val deviceJson = JSONObject().apply {
                    put("address", device.address)
                    put("name", device.name ?: "Unknown")
                    put("rssi", device.rssi)
                    put("type", device.type)
                    put("lastSeen", device.lastSeen)
                }
                devices.put(deviceJson)
            }
        result.put("bluetoothDevices", devices)

        // Stats
        result.put("timestamp", System.currentTimeMillis())
        result.put("wifiEnabled", wifiManager.isWifiEnabled)
        result.put("bluetoothEnabled", bluetoothAdapter?.isEnabled ?: false)
        result.put("networkCount", lastWifiResults.size)
        result.put("deviceCount", bluetoothDevices.size)

        return result.toString()
    }

    private fun frequencyToChannel(frequency: Int): Int {
        return when {
            frequency in 2412..2484 -> (frequency - 2412) / 5 + 1
            frequency in 5170..5825 -> (frequency - 5170) / 5 + 34
            else -> 0
        }
    }

    private fun notifyWebView() {
        handler.post {
            webViewRef.get()?.let { webView ->
                val json = getResultsJson().replace("'", "\\'")
                webView.evaluateJavascript(
                    "if(window.onMollySensingUpdate) window.onMollySensingUpdate('$json');",
                    null
                )
            }
        }
    }

    fun cleanup() {
        stopScanning()
        try {
            context.unregisterReceiver(wifiScanReceiver)
            context.unregisterReceiver(bluetoothReceiver)
        } catch (e: Exception) { /* already unregistered */ }
    }
}
