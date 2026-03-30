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
import android.view.LayoutInflater
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
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
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
 * - Multi-tab support (up to 6 tabs)
 */
class MainActivity : AppCompatActivity() {

    // Tab data class
    data class Tab(
        val id: Int,
        val webView: WebView,
        var title: String = "New Tab",
        var url: String = "",
        var tabButton: View? = null
    )

    // Tab management
    private val tabs = mutableListOf<Tab>()
    private var activeTabId = -1
    private var nextTabId = 0
    private val maxTabs = 6

    private lateinit var webViewContainer: FrameLayout
    private lateinit var tabContainer: LinearLayout
    private lateinit var newTabButton: ImageButton
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
        webViewContainer = findViewById(R.id.webViewContainer)
        tabContainer = findViewById(R.id.tabContainer)
        newTabButton = findViewById(R.id.newTabButton)
        urlInput = findViewById(R.id.urlInput)
        progressBar = findViewById(R.id.progressBar)
        statusText = findViewById(R.id.statusText)
        refreshButton = findViewById(R.id.refreshButton)

        // Setup new tab button
        newTabButton.setOnClickListener { createNewTab(defaultUrl) }

        // Optional buttons (may not exist in layout)
        try {
            homeButton = findViewById(R.id.homeButton)
            homeButton.setOnClickListener { loadUrlInActiveTab(defaultUrl) }
        } catch (e: Exception) { /* Button not in layout */ }

        try {
            githubButton = findViewById(R.id.githubButton)
            githubButton.setOnClickListener { loadUrlInActiveTab(githubUrl) }
        } catch (e: Exception) { /* Button not in layout */ }

        // Request permissions
        requestPermissions()

        // Request battery optimization exemption
        BatteryOptimization.requestExemption(this)

        // Start the connection keeper service
        startConnectionKeeperService()

        // Setup URL input
        setupUrlInput()

        // Setup refresh button
        refreshButton.setOnClickListener {
            getActiveTab()?.webView?.reload()
        }

        // Enable third-party cookies for OAuth
        CookieManager.getInstance().setAcceptCookie(true)

        // Create first tab with initial URL
        val intentUrl = intent?.data?.toString()
        val urlToLoad = intentUrl ?: defaultUrl
        createNewTab(urlToLoad)
    }

    private fun createNewTab(url: String): Tab? {
        if (tabs.size >= maxTabs) {
            Toast.makeText(this, "Maximum $maxTabs tabs reached", Toast.LENGTH_SHORT).show()
            return null
        }

        val tabId = nextTabId++
        val webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            visibility = View.GONE
        }

        setupWebView(webView, tabId)
        webViewContainer.addView(webView)

        val tab = Tab(
            id = tabId,
            webView = webView,
            url = url
        )
        tabs.add(tab)

        // Create tab button
        createTabButton(tab)

        // Switch to the new tab
        switchToTab(tabId)

        // Load URL
        webView.loadUrl(url)

        return tab
    }

    private fun createTabButton(tab: Tab) {
        val tabButton = LayoutInflater.from(this).inflate(R.layout.tab_button, tabContainer, false)
        val titleView = tabButton.findViewById<TextView>(R.id.tabTitle)
        val closeButton = tabButton.findViewById<ImageButton>(R.id.closeTabButton)

        titleView.text = tab.title

        tabButton.setOnClickListener {
            switchToTab(tab.id)
        }

        closeButton.setOnClickListener {
            closeTab(tab.id)
        }

        tab.tabButton = tabButton
        tabContainer.addView(tabButton)
    }

    private fun switchToTab(tabId: Int) {
        // Hide current tab
        getActiveTab()?.let { currentTab ->
            currentTab.webView.visibility = View.GONE
            currentTab.tabButton?.isSelected = false
        }

        // Show new tab
        val newTab = tabs.find { it.id == tabId } ?: return
        newTab.webView.visibility = View.VISIBLE
        newTab.tabButton?.isSelected = true
        activeTabId = tabId

        // Update URL bar
        urlInput.setText(newTab.url)

        // Enable cookies for this webview
        CookieManager.getInstance().setAcceptThirdPartyCookies(newTab.webView, true)

        updateStatus("Connected", true)
    }

    private fun closeTab(tabId: Int) {
        val tabIndex = tabs.indexOfFirst { it.id == tabId }
        if (tabIndex == -1) return

        val tab = tabs[tabIndex]

        // Don't allow closing the last tab
        if (tabs.size == 1) {
            Toast.makeText(this, "Can't close the last tab", Toast.LENGTH_SHORT).show()
            return
        }

        // Remove tab button from container
        tab.tabButton?.let { tabContainer.removeView(it) }

        // Remove webview from container
        webViewContainer.removeView(tab.webView)
        tab.webView.destroy()

        // Remove from list
        tabs.removeAt(tabIndex)

        // If we closed the active tab, switch to another
        if (activeTabId == tabId) {
            val newActiveTab = tabs.getOrNull(tabIndex.coerceAtMost(tabs.size - 1))
            newActiveTab?.let { switchToTab(it.id) }
        }
    }

    private fun getActiveTab(): Tab? = tabs.find { it.id == activeTabId }

    private fun loadUrlInActiveTab(url: String) {
        getActiveTab()?.webView?.let { loadUrl(url, it) }
    }

    private fun updateTabTitle(tabId: Int, title: String) {
        val tab = tabs.find { it.id == tabId } ?: return
        tab.title = title.take(20)
        tab.tabButton?.findViewById<TextView>(R.id.tabTitle)?.text = tab.title
    }

    private fun updateTabUrl(tabId: Int, url: String) {
        val tab = tabs.find { it.id == tabId } ?: return
        tab.url = url
        if (tabId == activeTabId) {
            urlInput.setText(url)
        }
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
    private fun setupWebView(webView: WebView, tabId: Int) {
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
            userAgentString = userAgentString
                .replace("; wv", "")
                .replace("Version/4.0 ", "")

            // Enable geolocation
            setGeolocationEnabled(true)

            // Media playback
            mediaPlaybackRequiresUserGesture = false

            // Allow opening windows (for OAuth popups)
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
        }

        // Handle page loading and OAuth redirects
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false

                // Handle OAuth callbacks - keep in WebView
                if (url.contains("callback") || url.contains("oauth") || url.contains("authorize")) {
                    return false
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

                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                url?.let { updateTabUrl(tabId, it) }
                injectKeepalive(webView)
            }

            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                if (tabId == activeTabId) {
                    updateStatus("Error: $description", false)
                }
            }
        }

        // Handle progress, file uploads, permissions
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (tabId != activeTabId) return
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
                title?.let { updateTabTitle(tabId, it) }
            }

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

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }

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
                getActiveTab()?.webView?.let { loadUrl(urlInput.text.toString(), it) }
                true
            } else {
                false
            }
        }
    }

    private fun loadUrl(url: String, webView: WebView) {
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

    private fun injectKeepalive(webView: WebView) {
        val script = """
            (function() {
                if (window.__mollyKeepalive) return;
                window.__mollyKeepalive = true;

                setInterval(function() {
                    window.postMessage({ type: 'molly-keepalive', timestamp: Date.now() }, '*');
                    console.log('[MollyBrowser] Keepalive ping');
                }, 30000);

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
        val activeWebView = getActiveTab()?.webView
        if (activeWebView != null && activeWebView.canGoBack()) {
            activeWebView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.data?.toString()?.let { url ->
            // Open in new tab if we have room, otherwise load in current tab
            if (tabs.size < maxTabs) {
                createNewTab(url)
            } else {
                loadUrlInActiveTab(url)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Clean up all WebViews
        tabs.forEach { it.webView.destroy() }
        tabs.clear()
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
