# MollyBrowser

A full-featured Android browser designed for developers who need persistent connections to Codespaces, GitHub, and other web-based development environments.

## The Problem

When you open GitHub Codespaces in Chrome on Android and switch to another tab, Chrome suspends the Codespace tab to save battery. This kills your WebSocket connections and, when you return, Codespace fully reloads - losing all your Claude Code agent context.

## The Solution

MollyBrowser hosts web apps in a WebView within our own app process. A Foreground Service with persistent notification keeps the app alive. Battery optimization exemption prevents aggressive OEMs (Samsung, Xiaomi) from killing it.

## Features

### Core

- **Persistent Connections** - WebSocket connections survive backgrounding
- **Foreground Service** - `dataSync` type keeps app alive
- **Wake Lock** - Keeps CPU running when screen off
- **Battery Exemption** - Survives aggressive battery optimization

### Browser

- **Full JavaScript Support** - Modern web apps work perfectly
- **File Upload/Download** - Upload to GitHub, download files
- **OAuth Support** - GitHub login, SSO flows work seamlessly
- **Third-party Cookies** - Required for authentication

### Developer Features

- **Quick Access Bookmarks** - Type `github`, `codespaces`, `gitpod`, `replit`
- **Remote Debugging** - `chrome://inspect` works for debugging
- **Desktop User Agent** - Sites render as desktop, not mobile

### Media & Permissions

- **Camera & Microphone** - Video calls, screen sharing
- **Geolocation** - Location-aware features
- **Downloads** - Direct to Downloads folder

## Quick Access Shortcuts

Type these in the URL bar:

- `codespaces` → https://github.dev
- `github` → https://github.com
- `gitpod` → https://gitpod.io
- `replit` → https://replit.com
- `codesandbox` → https://codesandbox.io

## Build

```bash
# Debug build
./gradlew assembleDebug

# Release build (requires signing key)
./gradlew assembleRelease

# Install via ADB
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Requirements

- Android 8.0+ (API 26)
- Android Studio or Gradle CLI
- ADB for installation

## Permissions

| Permission                             | Purpose                              |
| -------------------------------------- | ------------------------------------ |
| `INTERNET`                             | Network access                       |
| `FOREGROUND_SERVICE`                   | Background operation                 |
| `FOREGROUND_SERVICE_DATA_SYNC`         | Network sync service type            |
| `WAKE_LOCK`                            | Keep CPU awake                       |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Survive battery optimization         |
| `POST_NOTIFICATIONS`                   | Foreground service notification      |
| `CAMERA`                               | Video calls                          |
| `RECORD_AUDIO`                         | Voice/video calls                    |
| `ACCESS_FINE_LOCATION`                 | Geolocation features                 |
| `WRITE_EXTERNAL_STORAGE`               | File downloads (Android 9 and below) |

## Supported Services

MollyBrowser is optimized for:

- GitHub Codespaces (github.dev)
- GitHub (github.com)
- GitPod (gitpod.io)
- Replit (replit.com)
- CodeSandbox (codesandbox.io)
- Any web-based development environment

## Architecture

```
MainActivity (WebView host)
    │
    └── ConnectionKeeperService (Foreground Service)
            │
            ├── Persistent notification
            ├── PARTIAL_WAKE_LOCK
            ├── 30-second heartbeat
            └── START_STICKY (auto-restart if killed)
```

## Battery Optimization

On first launch, MollyBrowser requests battery optimization exemption. This is required for Samsung, Xiaomi, Huawei, and other aggressive OEMs that kill background apps.

If connections still drop, manually disable battery optimization:

1. Settings → Apps → MollyBrowser
2. Battery → Unrestricted (or "Don't optimize")

## Troubleshooting

### WebSocket disconnects

- Check notification is showing (service running)
- Verify battery optimization is disabled
- Try enabling "Don't keep activities" in Developer Options

### OAuth not working

- Clear app data and retry
- Ensure third-party cookies are enabled (they are by default)

### Downloads fail

- Grant storage permission manually in Settings
- Check Downloads folder has space

## License

MIT - Part of Molly-Core

## Market Potential

This browser solves a universal pain point for mobile developers. Consider distributing on:

- GitHub Releases (APK)
- F-Droid (open source app store)
- Google Play Store
