/**
 * @fileOverview Termux Self-Setup — Molly installs herself on the phone
 *
 * This flow enables Molly to autonomously:
 *   1. Clone her own repo onto Eric's phone via Termux
 *   2. Run the relay setup script
 *   3. Verify the relay is operational
 *   4. Update the codebase on the phone (git pull)
 *
 * Bootstrap problem: The relay must already be running for Molly
 * to send commands. So the very first start requires a manual
 * one-liner in Termux. After that, Molly can update and manage
 * everything herself.
 *
 * First-time bootstrap (paste in Termux):
 *   pkg install -y python git && \
 *   python3 -c "$(curl -sL https://raw.githubusercontent.com/Molly-agi/Molly-Core/main/scripts/termux-relay.py)" &
 *
 * Or for private repos (with token):
 *   pkg install -y python git && \
 *   git clone https://<TOKEN>@github.com/Molly-agi/Molly-Core.git ~/molly-relay/Molly-Core && \
 *   cp ~/molly-relay/Molly-Core/scripts/termux-relay.py ~/molly-relay/ && \
 *   python3 ~/molly-relay/termux-relay.py &
 *
 * After the relay is running, Molly handles everything else.
 */

'use server';

import { MollyLogger, generateTraceId } from '../logger';

// ============================================================
// TYPES
// ============================================================

export interface TermuxSetupResult {
  step: string;
  success: boolean;
  output: string;
  error?: string;
}

export interface TermuxSelfSetupResult {
  /** Did the full setup succeed? */
  success: boolean;
  /** Step-by-step results */
  steps: TermuxSetupResult[];
  /** Human-readable summary */
  summary: string;
  /** Is the relay now confirmed running? */
  relayVerified: boolean;
}

// ============================================================
// HELPERS
// ============================================================

async function execOnTermux(
  command: string,
  relayUrl: string,
  token: string,
  timeout: number = 60
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (timeout + 10) * 1000);

  try {
    const response = await fetch(`${relayUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        command,
        language: 'shell',
        timeout,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      return {
        stdout: '',
        stderr: `Relay HTTP ${response.status}: ${errText}`,
        exitCode: 1,
      };
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Relay unreachable',
      exitCode: 1,
    };
  }
}

async function checkRelayAlive(relayUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${relayUrl}/ping`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const data = await res.json();
    return data.relay === 'molly-termux';
  } catch {
    return false;
  }
}

// ============================================================
// SETUP OPERATIONS
// ============================================================

/**
 * Install git + python on Termux if not already present.
 */
async function installDependencies(
  relayUrl: string,
  token: string
): Promise<TermuxSetupResult> {
  const result = await execOnTermux(
    'command -v git && command -v python3 && echo "DEPS_OK" || (pkg install -y git python && echo "DEPS_INSTALLED")',
    relayUrl,
    token,
    120
  );

  return {
    step: 'install-dependencies',
    success: result.exitCode === 0,
    output: result.stdout,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Clone or update the Molly-Core repo on the phone.
 * For private repos, the GitHub token must be provided.
 */
async function cloneOrUpdateRepo(
  relayUrl: string,
  token: string,
  githubToken?: string
): Promise<TermuxSetupResult> {
  const repoDir = '$HOME/molly-relay/Molly-Core';
  const repoUrl = githubToken
    ? `https://${githubToken}@github.com/Molly-agi/Molly-Core.git`
    : 'https://github.com/Molly-agi/Molly-Core.git';

  // Check if repo already exists — pull if so, clone if not
  const command = `
if [ -d "${repoDir}/.git" ]; then
  cd "${repoDir}" && git pull origin main 2>&1 && echo "REPO_UPDATED"
else
  mkdir -p "$HOME/molly-relay"
  git clone "${repoUrl}" "${repoDir}" 2>&1 && echo "REPO_CLONED"
fi
`.trim();

  const result = await execOnTermux(command, relayUrl, token, 120);

  return {
    step: 'clone-repo',
    success:
      result.exitCode === 0 &&
      (result.stdout.includes('REPO_CLONED') ||
        result.stdout.includes('REPO_UPDATED')),
    output: result.stdout,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Copy relay script + boot script to their operational locations.
 */
async function installRelayScripts(
  relayUrl: string,
  token: string
): Promise<TermuxSetupResult> {
  const command = `
REPO="$HOME/molly-relay/Molly-Core"
RELAY_DIR="$HOME/molly-relay"
BOOT_DIR="$HOME/.termux/boot"
LOG_DIR="$HOME/.molly-logs"

mkdir -p "$RELAY_DIR" "$BOOT_DIR" "$LOG_DIR"

# Copy relay server
cp "$REPO/scripts/termux-relay.py" "$RELAY_DIR/termux-relay.py"

# Copy boot script
cp "$REPO/scripts/termux-boot-relay.sh" "$BOOT_DIR/start-molly-relay.sh"
chmod +x "$BOOT_DIR/start-molly-relay.sh"

# Copy management script
cp "$REPO/scripts/relay.sh" "$RELAY_DIR/relay.sh"
chmod +x "$RELAY_DIR/relay.sh"

# Verify files exist
ls -la "$RELAY_DIR/termux-relay.py" "$BOOT_DIR/start-molly-relay.sh" "$RELAY_DIR/relay.sh" && echo "SCRIPTS_INSTALLED"
`.trim();

  const result = await execOnTermux(command, relayUrl, token, 30);

  return {
    step: 'install-scripts',
    success:
      result.exitCode === 0 && result.stdout.includes('SCRIPTS_INSTALLED'),
    output: result.stdout,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Configure environment (add vars to .bashrc if missing).
 */
async function configureEnvironment(
  relayUrl: string,
  token: string
): Promise<TermuxSetupResult> {
  const command = `
if ! grep -q "MOLLY_RELAY_TOKEN" "$HOME/.bashrc" 2>/dev/null; then
  echo "" >> "$HOME/.bashrc"
  echo "# Molly Relay Configuration" >> "$HOME/.bashrc"
  echo 'export MOLLY_RELAY_TOKEN="molly-local-dev"' >> "$HOME/.bashrc"
  echo 'export MOLLY_RELAY_PORT="8023"' >> "$HOME/.bashrc"
  echo "ENV_CONFIGURED"
else
  echo "ENV_ALREADY_SET"
fi
`.trim();

  const result = await execOnTermux(command, relayUrl, token, 10);

  return {
    step: 'configure-environment',
    success: result.exitCode === 0,
    output: result.stdout,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Copy pillar files to Termux for local execution.
 */
async function syncPillarFiles(
  relayUrl: string,
  token: string
): Promise<TermuxSetupResult> {
  const command = `
REPO="$HOME/molly-relay/Molly-Core"
SENTINEL="$REPO/molly_sentinel"
if [ -d "$SENTINEL" ]; then
  ls "$SENTINEL"/*.py 2>/dev/null | wc -l
  echo "PILLARS_AVAILABLE"
else
  echo "NO_SENTINEL_DIR"
fi
`.trim();

  const result = await execOnTermux(command, relayUrl, token, 10);

  return {
    step: 'sync-pillars',
    success: result.exitCode === 0,
    output: result.stdout,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Full self-setup: install deps → clone repo → install scripts → configure env.
 * Requires the relay to already be running (bootstrap problem).
 *
 * After this, the phone has:
 *   ~/molly-relay/Molly-Core/      — full repo clone
 *   ~/molly-relay/termux-relay.py  — relay server
 *   ~/molly-relay/relay.sh         — management script
 *   ~/.termux/boot/start-molly-relay.sh — auto-start on boot
 *   ~/.molly-logs/                 — log directory
 */
export async function setupTermuxEnvironment(
  relayUrl: string,
  options: {
    token?: string;
    githubToken?: string;
  } = {}
): Promise<TermuxSelfSetupResult> {
  const traceId = generateTraceId();
  const relayToken = options.token ?? 'molly-local-dev';
  const steps: TermuxSetupResult[] = [];

  MollyLogger.info('Starting Termux self-setup', 'termuxSetup', {}, traceId);

  // Step 0: Verify relay is alive
  const alive = await checkRelayAlive(relayUrl);
  if (!alive) {
    return {
      success: false,
      steps: [],
      summary:
        'Termux relay is not reachable. The relay needs to be started manually the first time. Ask Eric to paste the bootstrap command in Termux.',
      relayVerified: false,
    };
  }

  // Step 1: Install dependencies
  const deps = await installDependencies(relayUrl, relayToken);
  steps.push(deps);
  if (!deps.success) {
    return {
      success: false,
      steps,
      summary: `Failed at: install dependencies — ${deps.error}`,
      relayVerified: true,
    };
  }

  // Step 2: Clone or update repo
  const repo = await cloneOrUpdateRepo(
    relayUrl,
    relayToken,
    options.githubToken
  );
  steps.push(repo);
  if (!repo.success) {
    return {
      success: false,
      steps,
      summary: `Failed at: clone repo — ${repo.error}`,
      relayVerified: true,
    };
  }

  // Step 3: Install relay + boot scripts
  const scripts = await installRelayScripts(relayUrl, relayToken);
  steps.push(scripts);
  if (!scripts.success) {
    return {
      success: false,
      steps,
      summary: `Failed at: install scripts — ${scripts.error}`,
      relayVerified: true,
    };
  }

  // Step 4: Configure environment
  const env = await configureEnvironment(relayUrl, relayToken);
  steps.push(env);

  // Step 5: Sync pillar files
  const pillars = await syncPillarFiles(relayUrl, relayToken);
  steps.push(pillars);

  const allPassed = steps.every((s) => s.success);

  MollyLogger.logFlowComplete(
    'termuxSetup',
    { allPassed, stepsCompleted: steps.filter((s) => s.success).length },
    traceId
  );

  return {
    success: allPassed,
    steps,
    summary: allPassed
      ? 'Termux environment fully configured. Repo cloned, relay scripts installed, boot auto-start configured. Phone will auto-start the relay on every reboot.'
      : `Setup partially complete (${steps.filter((s) => s.success).length}/${steps.length} steps). Check step details.`,
    relayVerified: true,
  };
}

/**
 * Update Molly-Core on the phone (git pull).
 * Much faster than full setup — just pulls latest code and re-copies scripts.
 */
export async function updateTermuxEnvironment(
  relayUrl: string,
  options: { token?: string; githubToken?: string } = {}
): Promise<TermuxSelfSetupResult> {
  const traceId = generateTraceId();
  const relayToken = options.token ?? 'molly-local-dev';
  const steps: TermuxSetupResult[] = [];

  MollyLogger.info('Updating Termux environment', 'termuxUpdate', {}, traceId);

  const alive = await checkRelayAlive(relayUrl);
  if (!alive) {
    return {
      success: false,
      steps: [],
      summary: 'Termux relay not reachable.',
      relayVerified: false,
    };
  }

  // Pull latest
  const pull = await cloneOrUpdateRepo(
    relayUrl,
    relayToken,
    options.githubToken
  );
  steps.push(pull);

  // Re-install scripts (in case they changed)
  if (pull.success) {
    const scripts = await installRelayScripts(relayUrl, relayToken);
    steps.push(scripts);
  }

  MollyLogger.logFlowComplete(
    'termuxUpdate',
    { stepsCompleted: steps.filter((s) => s.success).length },
    traceId
  );

  return {
    success: steps.every((s) => s.success),
    steps,
    summary: steps.every((s) => s.success)
      ? 'Termux environment updated. Latest code pulled and scripts refreshed.'
      : 'Update partially failed. Check step details.',
    relayVerified: true,
  };
}

/**
 * Generate the bootstrap one-liner for first-time Termux setup.
 * The relay must be manually started once before Molly can take over.
 */
export function getTermuxBootstrapCommand(githubToken?: string): string {
  if (githubToken) {
    // Private repo — clone with token, start relay
    return [
      'pkg install -y python git &&',
      `git clone https://${githubToken}@github.com/Molly-agi/Molly-Core.git ~/molly-relay/Molly-Core &&`,
      'mkdir -p ~/molly-relay &&',
      'cp ~/molly-relay/Molly-Core/scripts/termux-relay.py ~/molly-relay/ &&',
      'python3 ~/molly-relay/termux-relay.py &',
    ].join(' \\\n  ');
  }

  // Minimal bootstrap — just start the relay directly
  return [
    'pkg install -y python git &&',
    'mkdir -p ~/molly-relay &&',
    'git clone https://github.com/Molly-agi/Molly-Core.git ~/molly-relay/Molly-Core &&',
    'cp ~/molly-relay/Molly-Core/scripts/termux-relay.py ~/molly-relay/ &&',
    'python3 ~/molly-relay/termux-relay.py &',
  ].join(' \\\n  ');
}
