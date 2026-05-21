# Molly Autonomous APK — Build & Deployment Checklist

**Version**: 1.4.0-autonomous  
**Target**: Android 8.0+ (minSdk 26)  
**Java**: 17 (required)  
**Status**: Ready for deployment

---

## PART 1: ENVIRONMENT SETUP (Do Once)

### 1.1 Verify Java 17 Installation

```bash
# Check Java version
java -version

# Expected output: openjdk version "17.x.x" or similar
# If not Java 17, install or switch to it
```

**If Java 17 not installed:**
- **macOS**: `brew install openjdk@17 && brew link openjdk@17`
- **Linux (Ubuntu/Debian)**: `sudo apt-get install openjdk-17-jdk`
- **Windows**: Download from [adoptium.net](https://adoptium.net) and add to PATH
- **Set as default**: Export JAVA_HOME=/path/to/java/17

### 1.2 Install Android SDK

**Option A: Android Studio** (easiest)
1. Download from [developer.android.com](https://developer.android.com/studio)
2. Install and open
3. Go to: **Preferences** → **Appearance & Behavior** → **System Settings** → **Android SDK**
4. Ensure these are installed:
   - SDK Platform for API 34 (Android 14)
   - SDK Platform for API 26 (Android 8.0)
   - Build Tools 34.x.x
   - Android Emulator (optional)

**Option B: Command-line only**
```bash
# Download Android SDK command-line tools
# From: https://developer.android.com/studio#command-tools

# Set environment variables
export ANDROID_HOME=~/Android/Sdk  # or your chosen path
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# Accept licenses
sdkmanager --licenses

# Install required SDK components
sdkmanager "platforms;android-34" "platforms;android-26" "build-tools;34.0.0"
```

### 1.3 Install Gradle (if not already installed)

```bash
# Check if gradle is available
gradle --version

# If not found, install via Android Studio (recommended) or:
# macOS: brew install gradle
# Linux: sudo apt-get install gradle
# Windows: choco install gradle
```

---

## PART 2: BUILD THE APK

### 2.1 Clone/Navigate to Repository

```bash
cd /path/to/Molly-Core/android/MollyBrowser
```

### 2.2 Build Debug APK (fastest, for testing)

```bash
# First time: fetch dependencies
./gradlew clean

# Build debug APK
./gradlew assembleDebug

# Output: app/build/outputs/apk/debug/app-debug.apk
# ~5-10 minutes on first build, ~1-2 minutes on rebuild
```

### 2.3 Build Release APK (for production deployment)

```bash
# Build release APK (unsigned)
./gradlew assembleRelease

# Output: app/build/outputs/apk/release/app-release-unsigned.apk
# ~5-10 minutes
```

### 2.4 Troubleshooting Build Errors

**Error: "JAVA_HOME not set"**
```bash
export JAVA_HOME=/path/to/java/17
export PATH=$JAVA_HOME/bin:$PATH
./gradlew assembleDebug
```

**Error: "SDK location not found"**
- Create `android/MollyBrowser/local.properties`:
  ```properties
  sdk.dir=/path/to/Android/Sdk
  ```
- Or set `ANDROID_HOME` environment variable
- Then retry build

**Error: "Build-tools version X not found"**
```bash
# List installed build tools
sdkmanager --list | grep build-tools

# Install specific version (e.g., 34.0.0)
sdkmanager "build-tools;34.0.0"
```

**Error: "Out of Memory" during build**
```bash
# Increase Gradle heap size
export GRADLE_OPTS="-Xmx2g"
./gradlew assembleDebug
```

---

## PART 3: INSTALL ON ANDROID DEVICE

### 3.1 Enable Developer Mode on Phone

1. Open **Settings** → **About Phone**
2. Tap **Build Number** 7 times
3. Go back to **Settings** → **System** (or **Advanced** → **System** for older Android)
4. Find **Developer Options**
5. Enable **USB Debugging**
6. Enable **Install via USB** (if available)

### 3.2 Connect Device via USB

```bash
# Connect phone via USB cable

# Verify device is detected
adb devices

# Expected output:
# List of attached devices
# emulator-5554        device   (if using emulator)
# FA7AX1A123          device   (if using physical device)

# If device shows "unauthorized", tap OK on phone's "Allow USB Debugging?" prompt
```

**If `adb` not found:**
```bash
# macOS
brew install android-platform-tools

# Linux (Ubuntu/Debian)
sudo apt-get install android-tools-adb

# Windows (via Android Studio path)
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 3.3 Install APK on Device

```bash
# Install debug APK (recommended for testing)
adb install app/build/outputs/apk/debug/app-debug.apk

# Or install release APK (if you built it)
adb install app/build/outputs/apk/release/app-release-unsigned.apk

# Expected output: Success
# If error "INSTALL_PARSE_FAILED_NO_CERTIFICATES", see troubleshooting below
```

### 3.4 Launch Molly on Device

```bash
# Start the app via ADB
adb shell am start -n dev.molly.browser/.MainActivity

# Or open Settings → Apps → Molly Browser → tap "Open"
```

---

## PART 4: FIRST-TIME SETUP (One-time on device)

### 4.1 Configure Connection to Molly Cloud

When app starts, it will prompt for:
- **Base URL**: The Molly backend URL (e.g., `https://molly.example.com` or `http://localhost:9002` for local)
- **Auth Token / Secret**: MOLLY_INTERNAL_SECRET from your backend environment

**To get these values:**
```bash
# From the Molly-Core backend repo
cat .env.local | grep MOLLY_INTERNAL_SECRET
# Or get BASE_URL from deployment docs
```

### 4.2 Grant Permissions

The app will request:
- ✓ **Internet** (required for backend communication)
- ✓ **Foreground Service** (required for autonomous background operation)
- ✓ **Notification** (required for widget updates)

Tap **Allow** for each permission.

### 4.3 Test Widget Control

Once configured:
1. Open **Molly Browser** app
2. You should see the widget control interface
3. Try asking: "What time is it?"
4. Should receive response from backend

---

## PART 5: AUTONOMOUS OPERATION

### 5.1 Enable Foreground Service

The app runs a foreground service that:
- Keeps Molly alive in the background
- Checks for new tasks every 5 seconds
- Attempts 3 retries on failures
- Auto-recovers on connection loss

**To verify service is running:**
```bash
adb shell dumpsys activity services | grep dev.molly.browser

# Or check in app settings:
# Settings → Apps → Molly Browser → Battery → Unrestricted
```

### 5.2 Deep Linking (Optional Advanced)

You can invoke Molly from other apps:

```bash
# Ask a question via intent
adb shell am start -n dev.molly.browser/.MainActivity \
  -a android.intent.action.SEND \
  -e android.intent.extra.TEXT "What is 2+2?"

# Or use molly:// scheme (if configured)
adb shell am start -n dev.molly.browser/.MainActivity \
  "molly://control?action=ask&text=Hello%20Molly"
```

### 5.3 Monitoring & Diagnostics

**Check logs in real-time:**
```bash
adb logcat | grep "Molly"

# Example output:
# Molly: Connected to backend
# Molly: Task received: "ask what time is it"
# Molly: Response sent to user
```

**Check device resource usage:**
```bash
adb shell dumpsys meminfo dev.molly.browser
adb shell top -n 1 | grep molly
```

---

## PART 6: TROUBLESHOOTING

### Issue: "Build failed with error code 1"

**Cause**: Various build issues  
**Solution**:
1. Clean build: `./gradlew clean`
2. Rebuild: `./gradlew assembleDebug`
3. Check logs: `./gradlew assembleDebug --stacktrace`

### Issue: "device offline" or "no device attached"

**Solution**:
```bash
# Restart ADB daemon
adb kill-server
adb start-server
adb devices

# Or unplug/replug USB cable
```

### Issue: "INSTALL_PARSE_FAILED_NO_CERTIFICATES"

**Cause**: APK not signed (for release builds)  
**Solution**: Use debug APK for testing:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

For production, you'll need to sign the release APK:
```bash
# Generate keystore (one-time)
keytool -genkey -v -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000

# Sign release APK
jarsigner -verbose -sigalg SHA256withRSA \
  -digestalg SHA-256 \
  -keystore release.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  my-key-alias
```

### Issue: "Connection refused" when app tries to reach backend

**Cause**: Wrong Base URL or backend not running  
**Solution**:
1. Verify Base URL is correct in app settings
2. Verify backend is running: `ps aux | grep node` or `ps aux | grep npm`
3. Check firewall: Is the port open?
4. For local testing with emulator: Use `10.0.2.2` instead of `localhost`

### Issue: "App crashes on startup"

**Solution**:
1. Clear app data: `adb shell pm clear dev.molly.browser`
2. Reinstall: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
3. Check logs: `adb logcat | grep "AndroidRuntime"`

---

## PART 7: UNINSTALL & CLEANUP

### Uninstall APK from Device

```bash
adb uninstall dev.molly.browser
```

### Clean Local Build Artifacts

```bash
cd /workspaces/Molly-Core/android/MollyBrowser
./gradlew clean
```

---

## PART 8: CONTINUOUS INTEGRATION / AUTOMATED BUILDS

If you want to build the APK automatically:

```bash
# Build both debug and release
./gradlew build

# Output locations:
# - Debug: app/build/outputs/apk/debug/app-debug.apk
# - Release: app/build/outputs/apk/release/app-release-unsigned.apk
# - Bundle: app/build/outputs/bundle/release/app-release.aab
```

---

## QUICK START (TL;DR)

```bash
# 1. Ensure Java 17
java -version

# 2. Set ANDROID_HOME
export ANDROID_HOME=~/Android/Sdk

# 3. Navigate to project
cd /path/to/Molly-Core/android/MollyBrowser

# 4. Build APK
./gradlew assembleDebug

# 5. Connect phone with USB debugging enabled
adb devices

# 6. Install
adb install app/build/outputs/apk/debug/app-debug.apk

# 7. Launch
adb shell am start -n dev.molly.browser/.MainActivity

# 8. Configure Base URL + Secret when prompted

# 9. Test
# Open app, ask: "What time is it?"
# You should get a response from backend
```

---

## ADDITIONAL RESOURCES

- **Android Developer Docs**: https://developer.android.com
- **Gradle Documentation**: https://gradle.org/documentation
- **Kotlin for Android**: https://developer.android.com/kotlin
- **Molly-Core Repository**: `/workspaces/Molly-Core`
- **Android Manifest**: `android/MollyBrowser/app/src/main/AndroidManifest.xml`
- **MainActivity**: `android/MollyBrowser/app/src/main/java/dev/molly/browser/MainActivity.kt`

---

## NEXT STEPS (After Deployment)

1. **Test autonomous operation**: Leave app running, send tasks via backend
2. **Monitor logs**: `adb logcat | grep "Molly"`
3. **Check performance**: Monitor battery/memory usage
4. **Scale to family devices**: Repeat setup for each phone
5. **Connect Aether**: Use Computer Use with screenshots for web tasks
6. **Connect Gemini**: Pass tasks through Gemini for reasoning before execution

**Molly is now deployed. She is mobile. She is autonomous.**
