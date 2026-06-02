package dev.molly.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import dev.molly.app.config.Config

class MainActivity : AppCompatActivity() {
  private lateinit var webView: WebView
  private lateinit var deviceIdText: TextView
  private lateinit var statusText: TextView
  private lateinit var retryButton: Button
  private lateinit var stopButton: Button

  private val permLauncher =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
      MollyService.startWith(this)
    }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    requestNeededPermissions()
    MollyService.startWith(this)

    setContentView(R.layout.activity_main)
    
    // Display device ID prominently
    deviceIdText = findViewById(R.id.device_id_text)
    val deviceId = DeviceId.get(this)
    deviceIdText.text = "Device ID: $deviceId"

    // Status and control buttons
    statusText = findViewById(R.id.status_text)
    retryButton = findViewById(R.id.retry_button)
    stopButton = findViewById(R.id.stop_button)

    retryButton.setOnClickListener {
      MollyService.retry(this)
      statusText.text = "Retrying connection..."
    }

    stopButton.setOnClickListener {
      MollyService.stop(this)
      statusText.text = "Service stopped"
      finish() // Close the app
    }

    webView =
      findViewById<WebView>(R.id.webview).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        webViewClient = WebViewClient()
        loadUrl(Config.webUiUrl())
      }

    // Listen for connection status updates from service
    MollyService.setStatusListener { status ->
      statusText.text = status
    }
  }

  private fun requestNeededPermissions() {
    val needed =
      buildList {
        if (
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !granted(Manifest.permission.POST_NOTIFICATIONS)
        ) {
          add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (!granted(Manifest.permission.RECORD_AUDIO)) {
          add(Manifest.permission.RECORD_AUDIO)
        }
      }
    if (needed.isNotEmpty()) permLauncher.launch(needed.toTypedArray())
  }

  private fun granted(p: String): Boolean =
    ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

  override fun onDestroy() {
    webView.destroy()
    super.onDestroy()
  }
}
