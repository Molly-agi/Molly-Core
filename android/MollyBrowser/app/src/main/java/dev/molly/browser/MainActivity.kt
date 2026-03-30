package dev.molly.browser

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import android.Manifest

/**
 * MollyBrowser - A full-featured browser that keeps Codespace connections alive.
 *
 * Features:
 * - WebView in our app process (survives backgrounding)
 * - Foreground Service keeps connection alive
 * - Full GitHub/internet access
 * - File upload/download support
 * - OAuth login support
 * - Camera/microphone for video calls
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var urlInput: EditText
    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView
    private lateinit var refreshButton: ImageButton
    private lateinit var homeButton: ImageButton
    private lateinit var githubButton: ImageButton

    // File upload callback
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    // File picker launcher
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        fileUploadCallback?.onReceiveValue(uris.toTypedArray())
        fileUploadCallback = null
    }

    // Default URLs
    private val defaultUrl = "https://github.dev"
    private val githubUrl = "https://github.com"

    // Quick access bookmarks
    private val bookmarks = mapOf(
        "codespaces" to "https://github.dev",
        "github" to "https://github.com",
        "gitpod" to "https://gitpod.io",
        "replit" to "https://replit.com",
        "codesandbox" to "https://codesandbox.io"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize views
        webView = findViewById(R.id.webView)
        urlInput = findViewById(R.id.urlInput)
        progressBar = findViewById(R.id.progressBar)
        statusText = findViewById(R.id.statusText)
        refreshButton = findViewById(R.id.refreshButton)

        // Optional buttons (may not exist in layout)
        try {
            homeButton = findViewById(R.id.homeButton)
            homeButton.setOnClickListener { loadUrl(defaultUrl) }
        } catch (e: Exception) { /* Button not in layout */ }

        try {
            githubButton = findViewById(R.id.githubButton)
            githubButton.setOnClickListener { loadUrl(githubUrl) }
        } catch (e: Exception) { /* Button not in layout */ }

        // Request permissions
        requestPermissions()

        // Request battery optimization exemption
        BatteryOptimization.requestExemption(this)

        // Start the connection keeper service
        startConnectionKeeperService()

        // Setup WebView with full capabilities
        setupWebView()

        // Setup URL input
        setupUrlInput()

        // Setup refresh button
        refreshButton.setOnClickListener { webView.reload() }

        // Enable third-party cookies for OAuth
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        // Load initial URL (from intent or default)
        val intentUrl = intent?.data?.toString()
        val urlToLoad = intentUrl ?: defaultUrl
        urlInput.setText(urlToLoad)
        webView.loadUrl(urlToLoad)
    }

    private fun requestPermissions() {
        val permissions = mutableListOf<String>()

        // Notification permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // Camera permission for video calls
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.CAMERA)
        }

        // Microphone permission for voice/video
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.RECORD_AUDIO)
        }

        // Location permission (optional, for location-aware features)
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), PERMISSION_REQUEST_CODE)
        }
    }

    private fun startConnectionKeeperService() {
        val serviceIntent = Intent(this, ConnectionKeeperService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
        updateStatus("Connected", true)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            // Enable JavaScript - required for modern web apps
            javaScriptEnabled = true

            // Enable DOM storage - required for most web apps
            domStorageEnabled = true

            // Enable database storage
            databaseEnabled = true

            // Allow file access (for uploads/downloads)
            allowFileAccess = true
            allowContentAccess = true

            // Enable zoom
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false

            // Use wide viewport (desktop-like rendering)
            useWideViewPort = true
            loadWithOverviewMode = true

            // Enable mixed content (some dev tools need this)
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

            // Cache settings - cache for offline/faster loading
            cacheMode = WebSettings.LOAD_DEFAULT

            // User agent - identify as Chrome on Android (not WebView)
            // This helps with GitHub OAuth and other services
            userAgentString = userAgentString
                .replace("; wv", "")
                .replace("Version/4.0 ", "")

            // Enable geolocation
            setGeolocationEnabled(true)

            // Media playback
            mediaPlaybackRequiresUserGesture = false

            // Allow opening windows (for OAuth popups)
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)  // Handle in same WebView
        }

        // Handle page loading and OAuth redirects
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false

                // Handle OAuth callbacks - keep in WebView
                if (url.contains("callback") || url.contains("oauth") || url.contains("authorize")) {
                    return false  // Load in WebView
                }

                // Handle external app links (tel:, mailto:, etc.)
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    } catch (e: Exception) {
                        return false
                    }
                }

                // Load all other URLs in WebView
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                urlInput.setText(url)
                injectKeepalive()
            }

            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                updateStatus("Error: $description", false)
            }
        }

        // Handle progress, file uploads, permissions
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                    updateStatus("Connected", true)
                }
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                // Could update title bar here
            }

            // Handle file upload
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val mimeTypes = fileChooserParams?.acceptTypes?.joinToString(",") ?: "*/*"
                filePickerLauncher.launch(mimeTypes.ifEmpty { "*/*" })
                return true
            }

            // Handle geolocation permission
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }

            // Handle camera/microphone permission for video calls
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.let {
                    val resources = it.resources
                    val granted = mutableListOf<String>()

                    for (resource in resources) {
                        when (resource) {
                            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> {
                                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                    granted.add(resource)
                                }
                            }
                            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> {
                                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                    granted.add(resource)
                                }
                            }
                        }
                    }

                    if (granted.isNotEmpty()) {
                        it.grant(granted.toTypedArray())
                    } else {
                        it.deny()
                    }
                }
            }
        }

        // Handle file downloads
        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, contentLength ->
            try {
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimeType)
                    addRequestHeader("User-Agent", userAgent)
                    setDescription("Downloading file...")
                    setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType))
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS,
                        URLUtil.guessFileName(url, contentDisposition, mimeType)
                    )
                }

                val downloadManager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
                downloadManager.enqueue(request)

                Toast.makeText(this, "Downloading...", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        })

        // Enable debugging (for development)
        WebView.setWebContentsDebuggingEnabled(true)
    }

    private fun setupUrlInput() {
        urlInput.setOnEditorActionListener { _, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_GO ||
                (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)) {
                loadUrl(urlInput.text.toString())
                true
            } else {
                false
            }
        }
    }

    private fun loadUrl(url: String) {
        var finalUrl = url.trim()

        // Check for bookmark shortcuts
        bookmarks[finalUrl.lowercase()]?.let {
            finalUrl = it
        }

        // Add https:// if no protocol specified
        if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
            finalUrl = "https://$finalUrl"
        }

        urlInput.setText(finalUrl)
        webView.loadUrl(finalUrl)
    }

    private fun injectKeepalive() {
        // Inject JavaScript that keeps WebSocket connections alive
        val script = """
            (function() {
                if (window.__mollyKeepalive) return;
                window.__mollyKeepalive = true;

                // Ping every 30 seconds
                setInterval(function() {
                    window.postMessage({ type: 'molly-keepalive', timestamp: Date.now() }, '*');
                    console.log('[MollyBrowser] Keepalive ping');
                }, 30000);

                // Listen for online/offline events
                window.addEventListener('online', function() {
                    console.log('[MollyBrowser] Network restored');
                    window.postMessage({ type: 'molly-online' }, '*');
                });

                window.addEventListener('offline', function() {
                    console.log('[MollyBrowser] Network lost');
                    window.postMessage({ type: 'molly-offline' }, '*');
                });

                console.log('[MollyBrowser] Keepalive installed - GitHub & Internet enabled');
            })();
        """.trimIndent()

        webView.evaluateJavascript(script, null)
    }

    private fun updateStatus(message: String, connected: Boolean) {
        statusText.text = message
        statusText.setTextColor(
            if (connected) getColor(android.R.color.holo_green_light)
            else getColor(android.R.color.holo_red_light)
        )
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.data?.toString()?.let { url ->
            urlInput.setText(url)
            webView.loadUrl(url)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Don't stop the service - keep running in background
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val granted = grantResults.count { it == PackageManager.PERMISSION_GRANTED }
            Toast.makeText(this, "$granted permissions granted", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        private const val PERMISSION_REQUEST_CODE = 1001
    }
}
