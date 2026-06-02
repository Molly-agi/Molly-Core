package dev.molly.app.config

import dev.molly.app.BuildConfig

/**
 * Runtime-safe config access for bridge/web endpoints.
 * Values come from buildConfigField so they can be overridden without code edits.
 */
object Config {
  fun bridgeUrl(): String = BuildConfig.MOLLY_BRIDGE_URL

  fun webUiUrl(): String = BuildConfig.MOLLY_WEB_UI_URL
}
