/**
 * @fileOverview Defense Sentinel Type Definitions
 *
 * Shared types for the defense sentinel module.
 */

// ============================================================
// SCAN TYPES
// ============================================================

export type ScanType =
  | 'quick' // Fast port scan
  | 'full' // All ports
  | 'stealth' // SYN scan, less detectable
  | 'service' // Service/version detection
  | 'vuln' // Vulnerability scripts
  | 'aggressive'; // Full enumeration

export type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScanTarget {
  host: string;
  ports?: string; // e.g., "22,80,443" or "1-1000"
  authorized: boolean;
  scope?: string; // Authorization scope description
}

export interface ScanResult {
  target: string;
  scanType: ScanType;
  startTime: number;
  endTime: number;
  openPorts: PortInfo[];
  services: ServiceInfo[];
  vulnerabilities: VulnInfo[];
  rawOutput: string;
  success: boolean;
  error?: string;
}

export interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: string;
}

export interface ServiceInfo {
  port: number;
  service: string;
  version?: string;
  banner?: string;
}

export interface VulnInfo {
  id: string; // CVE or vuln ID
  title: string;
  severity: ThreatLevel;
  port?: number;
  description: string;
  exploitable: boolean;
}

// ============================================================
// THREAT TYPES
// ============================================================

export interface ThreatIndicator {
  type: 'port_scan' | 'brute_force' | 'malware' | 'exfiltration' | 'anomaly';
  severity: ThreatLevel;
  source: string;
  target?: string;
  timestamp: number;
  details: string;
  mitigated: boolean;
}

// ============================================================
// STATE TYPES
// ============================================================

export interface SentinelState {
  scansCompleted: number;
  threatsDetected: number;
  lastScan: number;
  activeHunts: string[];
  recentScans: Array<{
    target: string;
    type: ScanType;
    timestamp: number;
    findings: number;
  }>;
}

// ============================================================
// TOOL AVAILABILITY
// ============================================================

export interface ToolAvailability {
  nmap: boolean;
  hashcat: boolean;
  john: boolean;
  hydra: boolean;
  masscan: boolean;
  nikto: boolean;
  sqlmap: boolean;
  metasploit: boolean;
  burp: boolean;
}

// ============================================================
// HASH TYPES
// ============================================================

export interface HashInfo {
  // Hash identification fields
  type: string;
  length?: number;
  format?: string;
  hashcatMode?: number;
  johnFormat?: string;
  // Cracking progress fields
  hash?: string;
  cracked?: string;
  attempts?: number;
}

// ============================================================
// CODE FORGE TYPES
// ============================================================

export type CodeLanguage =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'bash'
  | 'powershell'
  | 'c'
  | 'cpp'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'java'
  | 'csharp'
  | 'sql'
  | 'assembly';

export type CodePurpose =
  | 'recon'
  | 'exploit'
  | 'payload'
  | 'persistence'
  | 'defense'
  | 'analysis'
  | 'utility'
  // Additional purposes from defense-sentinel
  | 'patch'
  | 'detector'
  | 'scanner'
  | 'parser'
  | 'fuzzer'
  | 'reverser';

export interface CodeForgeRequest {
  language: CodeLanguage;
  purpose: CodePurpose;
  description: string;
  target?: string;
  constraints?: string[];
  targetPlatform?: string;
}

export interface CodeForgeResult {
  success: boolean;
  code: string;
  language: CodeLanguage;
  purpose: CodePurpose;
  warnings: string[];
  dependencies: string[];
  usage: string;
  explanation?: string;
  error?: string;
}

export type SentinelStatus = 'GREEN' | 'YELLOW' | 'RED';
