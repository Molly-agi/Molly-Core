/**
 * @fileOverview Defense Sentinel Tool Interface
 *
 * Provides Molly with security capabilities:
 * - Network reconnaissance (nmap)
 * - Password auditing (hashcat)
 * - Threat hunting
 * - Vulnerability analysis
 * - CodeForge — write offensive/defensive code on the fly
 *
 * The best defense is an extremely aggressive offense.
 * She speaks every computer language. Works both ways.
 */

import { z } from 'zod';
import {
  nmapScan,
  identifyHash,
  auditPasswordStrength,
  generateHashcatCommand,
  logThreat,
  getThreats,
  analyzeForAttacks,
  getSentinelStatus,
  detectAvailableTools,
  forgeCode,
  analyzeCode,
} from '@/ai/agency/defense-sentinel';
import type {
  ScanType,
  ThreatLevel,
  CodeLanguage,
  CodePurpose,
} from '@/ai/agency/sentinel/types';

// ============================================================
// SCHEMA
// ============================================================

const DefenseSentinelSchema = z.object({
  action: z.enum([
    // Reconnaissance
    'scan', // Network scan with nmap
    'quick_scan', // Fast port scan
    'vuln_scan', // Vulnerability scan

    // Password auditing
    'identify_hash', // Identify hash type
    'audit_password', // Check password strength
    'hashcat_cmd', // Generate hashcat command

    // Threat hunting
    'log_threat', // Log a threat indicator
    'get_threats', // Get recent threats
    'analyze_logs', // Analyze logs for attacks

    // CodeForge — write security code
    'forge', // Generate security code (offensive requires Rogue Mode)
    'analyze', // Analyze code for vulnerabilities/malware

    // Status
    'status', // Get sentinel status
    'tools', // List available tools
  ]),

  // Scan parameters
  target: z.string().optional(),
  ports: z.string().optional(),
  scanType: z
    .enum(['quick', 'full', 'stealth', 'service', 'vuln', 'aggressive'])
    .optional(),
  authorized: z.boolean().optional(),
  scope: z.string().optional(),

  // Hash/password parameters
  hash: z.string().optional(),
  password: z.string().optional(),
  hashFile: z.string().optional(),
  hashType: z.string().optional(),
  wordlist: z.string().optional(),

  // Threat parameters
  threatType: z
    .enum(['port_scan', 'brute_force', 'malware', 'exfiltration', 'anomaly'])
    .optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
  source: z.string().optional(),
  details: z.string().optional(),
  logData: z.string().optional(),

  // CodeForge parameters
  code: z.string().optional(), // Code to analyze
  language: z
    .enum([
      'python',
      'javascript',
      'typescript',
      'bash',
      'powershell',
      'c',
      'cpp',
      'rust',
      'go',
      'ruby',
      'php',
      'java',
      'sql',
      'assembly',
    ])
    .optional(),
  purpose: z
    .enum([
      'exploit',
      'payload',
      'patch',
      'detector',
      'scanner',
      'parser',
      'fuzzer',
      'reverser',
    ])
    .optional(),
  description: z.string().optional(), // What the code should do

  // Query parameters
  limit: z.number().optional(),
});

type DefenseSentinelInput = z.infer<typeof DefenseSentinelSchema>;

// ============================================================
// TOOL IMPLEMENTATION
// ============================================================

export async function defenseSentinelTool(
  input: DefenseSentinelInput
): Promise<string> {
  const { action } = input;

  switch (action) {
    // ── RECONNAISSANCE ──
    case 'scan':
    case 'quick_scan':
    case 'vuln_scan': {
      if (!input.target) {
        return 'Error: Target host required. Provide target parameter.';
      }

      const scanType: ScanType =
        action === 'vuln_scan'
          ? 'vuln'
          : action === 'quick_scan'
            ? 'quick'
            : (input.scanType as ScanType) || 'quick';

      const result = await nmapScan(
        {
          host: input.target,
          ports: input.ports,
          authorized: input.authorized ?? false,
          scope: input.scope,
        },
        scanType
      );

      if (!result.success) {
        return `Scan failed: ${result.error}`;
      }

      const lines: string[] = [];
      lines.push(`=== SCAN RESULTS: ${result.target} ===`);
      lines.push(`Type: ${result.scanType}`);
      lines.push(
        `Duration: ${((result.endTime - result.startTime) / 1000).toFixed(1)}s`
      );
      lines.push('');

      if (result.openPorts.length > 0) {
        lines.push('OPEN PORTS:');
        for (const port of result.openPorts) {
          lines.push(
            `  ${port.port}/${port.protocol} - ${port.service || 'unknown'}`
          );
        }
        lines.push('');
      }

      if (result.services.length > 0) {
        lines.push('SERVICES:');
        for (const svc of result.services) {
          lines.push(
            `  ${svc.port}: ${svc.service}${svc.version ? ` v${svc.version}` : ''}`
          );
        }
        lines.push('');
      }

      if (result.vulnerabilities.length > 0) {
        lines.push('VULNERABILITIES:');
        for (const vuln of result.vulnerabilities) {
          lines.push(`  [${vuln.severity.toUpperCase()}] ${vuln.id}`);
          lines.push(`    ${vuln.title}`);
          if (vuln.exploitable) {
            lines.push(`    ⚠️  EXPLOITABLE`);
          }
        }
      } else if (action === 'vuln_scan') {
        lines.push('No vulnerabilities detected in scan.');
      }

      return lines.join('\n');
    }

    // ── PASSWORD AUDITING ──
    case 'identify_hash': {
      if (!input.hash) {
        return 'Error: Hash required. Provide hash parameter.';
      }

      const hashType = identifyHash(input.hash);
      return `Hash type: ${hashType}\nHash: ${input.hash.substring(0, 32)}${input.hash.length > 32 ? '...' : ''}`;
    }

    case 'audit_password': {
      if (!input.password) {
        return 'Error: Password required. Provide password parameter.';
      }

      const audit = auditPasswordStrength(input.password);
      const lines: string[] = [];
      lines.push(`Password Audit Score: ${audit.score}/8`);
      lines.push(`Assessment: ${audit.recommendation}`);

      if (audit.issues.length > 0) {
        lines.push('');
        lines.push('Issues:');
        for (const issue of audit.issues) {
          lines.push(`  - ${issue}`);
        }
      }

      return lines.join('\n');
    }

    case 'hashcat_cmd': {
      if (!input.hashFile || !input.hashType) {
        return 'Error: hashFile and hashType required.';
      }

      const cmd = generateHashcatCommand(
        input.hashFile,
        input.hashType,
        input.wordlist
      );

      return `Hashcat command:\n\n${cmd}\n\nNote: Ensure you have authorization before cracking hashes.`;
    }

    // ── THREAT HUNTING ──
    case 'log_threat': {
      if (!input.threatType || !input.severity || !input.source) {
        return 'Error: threatType, severity, and source required.';
      }

      logThreat({
        type: input.threatType,
        severity: input.severity as ThreatLevel,
        source: input.source,
        details: input.details || 'No details provided',
        mitigated: false,
      });

      return `Threat logged: ${input.threatType} (${input.severity}) from ${input.source}`;
    }

    case 'get_threats': {
      const threats = getThreats(
        input.severity as ThreatLevel | undefined,
        input.limit || 20
      );

      if (threats.length === 0) {
        return 'No threats recorded.';
      }

      const lines: string[] = [];
      lines.push(`=== THREAT INDICATORS (${threats.length}) ===`);
      lines.push('');

      for (const threat of threats) {
        const time = new Date(threat.timestamp).toISOString();
        lines.push(
          `[${threat.severity.toUpperCase()}] ${threat.type} — ${time}`
        );
        lines.push(`  Source: ${threat.source}`);
        lines.push(`  ${threat.details}`);
        lines.push(`  Mitigated: ${threat.mitigated ? 'Yes' : 'No'}`);
        lines.push('');
      }

      return lines.join('\n');
    }

    case 'analyze_logs': {
      if (!input.logData) {
        return 'Error: logData required. Provide log content to analyze.';
      }

      const threats = analyzeForAttacks(input.logData);

      if (threats.length === 0) {
        return 'No attack patterns detected in provided logs.';
      }

      const lines: string[] = [];
      lines.push(`=== ATTACK ANALYSIS: ${threats.length} indicator(s) ===`);
      lines.push('');

      for (const threat of threats) {
        lines.push(`[${threat.severity.toUpperCase()}] ${threat.type}`);
        lines.push(`  ${threat.details}`);

        // Auto-log detected threats
        logThreat(threat);
      }

      return lines.join('\n');
    }

    // ── CODEFORGE ──
    case 'forge': {
      if (!input.purpose || !input.language || !input.description) {
        return 'Error: purpose, language, and description required for code generation.';
      }

      const result = forgeCode({
        purpose: input.purpose as CodePurpose,
        language: input.language as CodeLanguage,
        description: input.description,
      });

      if (!result.success) {
        return `Code generation failed: ${result.error}`;
      }

      const lines: string[] = [];
      lines.push(`=== CODEFORGE: ${result.purpose.toUpperCase()} ===`);
      lines.push(`Language: ${result.language}`);

      if (result.warnings.length > 0) {
        lines.push('');
        for (const warn of result.warnings) {
          lines.push(`⚠️  ${warn}`);
        }
      }

      if (result.explanation) {
        lines.push('');
        lines.push(result.explanation);
      }

      lines.push('');
      lines.push('```' + result.language);
      lines.push(result.code || '// No code generated');
      lines.push('```');

      return lines.join('\n');
    }

    case 'analyze': {
      if (!input.code || !input.language) {
        return 'Error: code and language required for analysis.';
      }

      const analysis = analyzeCode(input.code, input.language as CodeLanguage);

      const lines: string[] = [];
      lines.push('=== CODE ANALYSIS ===');
      lines.push('');

      if (analysis.isMalicious) {
        lines.push('⚠️  WARNING: CODE APPEARS MALICIOUS');
        lines.push('');
        lines.push('Malware indicators detected:');
        for (const indicator of analysis.malwareIndicators) {
          lines.push(`  🔴 ${indicator}`);
        }
        lines.push('');
      }

      if (analysis.vulnerabilities.length > 0) {
        lines.push(`Vulnerabilities found: ${analysis.vulnerabilities.length}`);
        lines.push('');

        for (const vuln of analysis.vulnerabilities) {
          lines.push(
            `[${vuln.severity.toUpperCase()}] ${vuln.type}${vuln.line ? ` (line ${vuln.line})` : ''}`
          );
          lines.push(`  ${vuln.description}`);
          if (vuln.fix) {
            lines.push(`  Fix: ${vuln.fix}`);
          }
          lines.push('');
        }
      } else {
        lines.push('No obvious vulnerabilities detected.');
        lines.push(
          '(Note: This is static analysis only. Manual review recommended.)'
        );
      }

      return lines.join('\n');
    }

    // ── STATUS ──
    case 'status': {
      const status = getSentinelStatus();

      const lines: string[] = [];
      lines.push('=== DEFENSE SENTINEL STATUS ===');
      lines.push('');
      lines.push(`Active: ${status.active ? 'Yes' : 'No'}`);
      lines.push(`Scans Completed: ${status.scansCompleted}`);
      lines.push(`Threats Detected: ${status.threatsDetected}`);

      if (status.lastScan > 0) {
        lines.push(`Last Scan: ${new Date(status.lastScan).toISOString()}`);
      }

      lines.push('');
      lines.push(
        `Available Tools: ${status.availableTools.join(', ') || 'None detected'}`
      );

      if (status.recentActivity.length > 0) {
        lines.push('');
        lines.push('Recent Activity:');
        for (const scan of status.recentActivity.slice(-5)) {
          lines.push(
            `  - ${scan.target} (${scan.type}): ${scan.findings} findings`
          );
        }
      }

      return lines.join('\n');
    }

    case 'tools': {
      const tools = await detectAvailableTools();

      const lines: string[] = [];
      lines.push('=== AVAILABLE SECURITY TOOLS ===');
      lines.push('');

      const toolList = [
        ['nmap', tools.nmap, 'Network scanner'],
        ['hashcat', tools.hashcat, 'Password cracker (GPU)'],
        ['john', tools.john, 'John the Ripper'],
        ['hydra', tools.hydra, 'Login brute-forcer'],
        ['nikto', tools.nikto, 'Web scanner'],
        ['sqlmap', tools.sqlmap, 'SQL injection'],
        ['metasploit', tools.metasploit, 'Exploitation framework'],
      ];

      for (const [name, available, desc] of toolList) {
        const status = available ? '✓' : '✗';
        lines.push(`${status} ${name}: ${desc}`);
      }

      lines.push('');
      lines.push('Install missing tools with: apt-get install <tool>');

      return lines.join('\n');
    }

    default:
      return `Unknown action: ${action}. Available: scan, quick_scan, vuln_scan, identify_hash, audit_password, hashcat_cmd, log_threat, get_threats, analyze_logs, status, tools`;
  }
}

// ============================================================
// EXPORT SCHEMA
// ============================================================

export { DefenseSentinelSchema };
