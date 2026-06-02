// app/build.gradle.kts
// Molly native shell — application module build file.
// The dependency set is deliberately tiny. The only non-AndroidX library is
// OkHttp, used for the WebSocket transport (see BridgeConnection). If you want
// zero third-party libs, BridgeConnection is an interface — swap the impl and
// drop OkHttp; everything else here is OS / AndroidX only.

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "dev.molly.app"
  compileSdk = rootProject.extra["compileSdkVersion"] as Int

  defaultConfig {
    applicationId = "dev.molly.app"
    minSdk = rootProject.extra["minSdkVersion"] as Int
    targetSdk = rootProject.extra["targetSdkVersion"] as Int
    versionCode = rootProject.extra["versionCode"] as Int
    versionName = rootProject.extra["versionName"] as String

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

    val bridgeUrl =
      project.findProperty("MOLLY_BRIDGE_URL") as String?
        ?: "wss://your-bridge.example/ws"
    val webUiUrl =
      project.findProperty("MOLLY_WEB_UI_URL") as String?
        ?: "https://your-codespace-url:9002"
    buildConfigField("String", "MOLLY_BRIDGE_URL", "\"$bridgeUrl\"")
    buildConfigField("String", "MOLLY_WEB_UI_URL", "\"$webUiUrl\"")
  }

  buildFeatures {
    buildConfig = true
  }

  buildTypes {
    release {
      // Turn this ON when you ship; OFF now so stack traces stay readable.
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro",
      )
    }
    debug {
      isMinifyEnabled = false
      isDebuggable = true
      // Debug-only: auto-provision secret for emulator/CI testing.
      // Empty string = no provisioning (production debug builds).
      val debugSecret = project.findProperty("MOLLY_DEBUG_SECRET") as String? ?: ""
      buildConfigField("String", "DEBUG_BRIDGE_SECRET", "\"$debugSecret\"")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  buildFeatures {
    viewBinding = true
    buildConfig = true
  }

  lint {
    abortOnError = false
    targetSdk = rootProject.extra["targetSdkVersion"] as Int
  }
}

dependencies {
  // AndroidX Core
  implementation("androidx.core:core-ktx:${rootProject.extra["androidxCoreVersion"]}")
  implementation("androidx.appcompat:appcompat:${rootProject.extra["androidxAppCompatVersion"]}")

  // Lifecycle / Service
  implementation("androidx.lifecycle:lifecycle-service:${rootProject.extra["androidxLifecycleVersion"]}")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:${rootProject.extra["androidxLifecycleVersion"]}")

  // Kotlin Coroutines for Android
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:${rootProject.extra["kotlinCoroutinesVersion"]}")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:${rootProject.extra["kotlinCoroutinesVersion"]}")

  // Material Design
  implementation("com.google.android.material:material:${rootProject.extra["materialVersion"]}")

  // OkHttp for WebSocket (transport layer)
  implementation("com.squareup.okhttp3:okhttp:${rootProject.extra["okhttpVersion"]}")

  // EncryptedSharedPreferences for per-device secret storage.
  implementation("androidx.security:security-crypto:1.1.0-alpha06")

  // Testing
  testImplementation("junit:junit:${rootProject.extra["junitVersion"]}")
  androidTestImplementation("androidx.test.ext:junit:${rootProject.extra["androidxTestVersion"]}")
  androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
