# Running Molly On Your Own Hardware

Molly does **not** depend on GitHub, VS Code, or Codespaces to run. GitHub is just where the code is stored. Once you have a copy of the code, you never need to touch GitHub again.

This guide covers two ways to run her on your own devices.

---

## Step 0: Get the Code Off GitHub (One Time)

You only need to do this once. After that, Molly lives on your device.

**From a phone or tablet browser:**

1. Go to https://github.com/Molly-agi/Molly-Core
2. Tap the green **Code** button → **Download ZIP**
3. Unzip the file on your device

**From a terminal (computer, Chromebook, WSL, etc.):**

```bash
git clone https://github.com/Molly-agi/Molly-Core.git
cd Molly-Core
```

After this, you have everything. GitHub is no longer needed.

---

## Option A: Full App (Computer / Laptop / Chromebook / Raspberry Pi)

This runs the complete Molly — web UI, AI chat, voice, memory, diagnostics.

### What You Need

| Requirement | Minimum | Where to Get It |
|---|---|---|
| **Node.js** | 18.18+ | https://nodejs.org |
| **npm** | 9+ | Comes with Node.js |
| **RAM** | 4 GB | 8 GB recommended for builds |

No VS Code. No GitHub. No Codespace. Just Node.js and a terminal.

### Setup (5 Minutes)

```bash
# 1. Go into the Molly folder
cd Molly-Core

# 2. Install her dependencies
npm install

# 3. Create your config files
cp .env.example .env
cp .env.local.example .env.local

# 4. Add your Gemini API key (the only REQUIRED key)
#    Open .env.local in any text editor and set:
#    GOOGLE_GENAI_API_KEY=your-key-here
#
#    Get a free key: https://aistudio.google.com/app/apikey

# 5. Start Molly
npm run dev
```

Open **http://localhost:9002** in any browser. She's alive.

### What About Firebase?

Firebase gives Molly persistent memory — she remembers things between restarts. Without it, she still works for conversations but forgets when you stop the server.

To enable memory, add Firebase Admin credentials to `.env.local`:

```
# Full service account JSON (one line)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# OR split into separate variables
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Production Build

For a faster, optimized version:

```bash
npm run build
npm start
```

### Useful Commands

| Command | What It Does |
|---|---|
| `npm run dev` | Start development server (port 9002) |
| `npm run dev:fresh` | Clear cache and start fresh |
| `npm test` | Run tests |
| `npm run lint` | Check code quality |

---

## Option B: Edge Server (Android Phone / Tablet via Termux)

A lightweight standalone server designed for your tablets (Helio A22, Fire HD 10) and phone (Verge 2). No build step. No heavy dependencies. Runs on 256 MB of RAM.

### What You Need

1. **Termux** — Install from [F-Droid](https://f-droid.org/packages/com.termux/), NOT the Play Store (the Play Store version is outdated and broken)
2. **Termux:Boot** (optional) — Also from F-Droid, for auto-start on device boot

### Setup in Termux

```bash
# Install Node.js
pkg install nodejs-lts

# Create Molly's home
mkdir -p ~/molly/molly_data

# If you downloaded the ZIP, copy the server file:
cp /path/to/Molly-Core/scripts/server-v2.mjs ~/molly/server.mjs

# Or if you cloned the repo:
cp Molly-Core/scripts/server-v2.mjs ~/molly/server.mjs
```

If you have the full repo available, the automated setup script does everything:

```bash
bash Molly-Core/scripts/setup-molly-edge.sh
```

### Configure

```bash
cat > ~/molly/.env << 'EOF'
MOLLY_EDGE_PORT=9100
MOLLY_EDGE_HOST=0.0.0.0
GOOGLE_GENAI_API_KEY=your-api-key-here
MOLLY_NODE_NAME=my-device
MOLLY_NODE_ROLE=primary
EOF
```

Edit with `nano ~/molly/.env` to add your actual Gemini API key.

### Start

```bash
cd ~/molly
node server.mjs
```

Or if setup-molly-edge.sh created start/stop scripts:

```bash
bash ~/molly/start.sh   # Start
bash ~/molly/stop.sh    # Stop
```

Molly's edge server is now at **http://localhost:9100** with a built-in chat UI. From another device on the same WiFi, use `http://<tablet-ip>:9100`.

### What the Edge Server Gives You

- Built-in chat UI — talk to Molly directly on the tablet
- Local file storage — no Firebase, no cloud, everything on the device
- Device-to-device sync — tablets can sync with each other
- Health check at `/api/health`
- Runs on Android 8+ with 256 MB RAM

---

## What You Do NOT Need

| Thing | Needed? | Why |
|---|---|---|
| VS Code | ❌ No | Any text editor works |
| GitHub Codespaces | ❌ No | That's a cloud dev environment, not required |
| GitHub account | ❌ No | Only needed to download the code the first time |
| Visual Studio | ❌ No | This is a Node.js project, not .NET |
| Firebase | ❌ Optional | Only for persistent memory |
| Internet (after setup) | ❌ Mostly no | Only needed for Gemini API calls — the server itself runs offline |

---

## FAQ

### Can I run Molly completely offline?
The server itself runs offline. But Molly needs the Gemini API to think (generate responses), which requires internet. The UI, storage, and all local features work without internet.

### What operating systems work?
Anything with Node.js 18.18+: Windows, macOS, Linux, Android (Termux), ChromeOS (Linux container), WSL, Raspberry Pi, etc.

### I'm getting out-of-memory errors during build
```bash
npm run harden
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### What about the .devcontainer folder?
Ignore it. That's only for GitHub Codespaces / VS Code Dev Containers.

### What about the scripts like keep-alive.sh and codespace-health.sh?
Those are Codespace-specific utilities. They won't hurt anything if they run, but you don't need them outside of Codespaces.

### Can I use yarn or pnpm?
Stick with npm. The project has a `package-lock.json` and is tested with npm.
