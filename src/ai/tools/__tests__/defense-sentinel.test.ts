/**
 * @fileOverview Tests for Defense Sentinel Tool — Security Operations
 *
 * Tests defense sentinel functionality including:
 * - Network scanning
 * - Hash identification
 * - Password auditing
 * - Threat hunting
 * - Code analysis
 */

// Mock the defense-sentinel agency - define inline to avoid hoisting issues
jest.mock('@/ai/agency/safety/defense-sentinel', () => ({
  nmapScan: jest.fn(),
  identifyHash: jest.fn(),
  auditPasswordStrength: jest.fn(),
  generateHashcatCommand: jest.fn(),
  logThreat: jest.fn(),
  getThreats: jest.fn(),
  analyzeForAttacks: jest.fn(),
  getSentinelStatus: jest.fn(),
  detectAvailableTools: jest.fn(),
  forgeCode: jest.fn(),
  analyzeCode: jest.fn(),
}));

import * as defenseSentinelModule from '@/ai/agency/safety/defense-sentinel';

const mockNmapScan = defenseSentinelModule.nmapScan as jest.MockedFunction<
  typeof defenseSentinelModule.nmapScan
>;
const mockIdentifyHash =
  defenseSentinelModule.identifyHash as jest.MockedFunction<
    typeof defenseSentinelModule.identifyHash
  >;
const mockAuditPasswordStrength =
  defenseSentinelModule.auditPasswordStrength as jest.MockedFunction<
    typeof defenseSentinelModule.auditPasswordStrength
  >;
const mockGenerateHashcatCommand =
  defenseSentinelModule.generateHashcatCommand as jest.MockedFunction<
    typeof defenseSentinelModule.generateHashcatCommand
  >;
const mockLogThreat = defenseSentinelModule.logThreat as jest.MockedFunction<
  typeof defenseSentinelModule.logThreat
>;
const mockGetThreats = defenseSentinelModule.getThreats as jest.MockedFunction<
  typeof defenseSentinelModule.getThreats
>;
const mockAnalyzeForAttacks =
  defenseSentinelModule.analyzeForAttacks as jest.MockedFunction<
    typeof defenseSentinelModule.analyzeForAttacks
  >;
const mockGetSentinelStatus =
  defenseSentinelModule.getSentinelStatus as jest.MockedFunction<
    typeof defenseSentinelModule.getSentinelStatus
  >;
const mockDetectAvailableTools =
  defenseSentinelModule.detectAvailableTools as jest.MockedFunction<
    typeof defenseSentinelModule.detectAvailableTools
  >;
const mockForgeCode = defenseSentinelModule.forgeCode as jest.MockedFunction<
  typeof defenseSentinelModule.forgeCode
>;
const mockAnalyzeCode =
  defenseSentinelModule.analyzeCode as jest.MockedFunction<
    typeof defenseSentinelModule.analyzeCode
  >;

import { defenseSentinelTool } from '../defense-sentinel';

describe('Defense Sentinel Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Network Scanning', () => {
    describe('scan action', () => {
      it('requires target parameter', async () => {
        const result = await defenseSentinelTool({ action: 'scan' });
        expect(result).toContain('Error');
        expect(result).toContain('Target host required');
      });

      it('performs scan with target', async () => {
        mockNmapScan.mockResolvedValue({
          success: true,
          target: '192.168.1.1',
          scanType: 'quick',
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          openPorts: [
            { port: 22, protocol: 'tcp', service: 'ssh' },
            { port: 80, protocol: 'tcp', service: 'http' },
          ],
          services: [{ port: 22, service: 'ssh', version: '2.0' }],
          vulnerabilities: [],
        });

        const result = await defenseSentinelTool({
          action: 'scan',
          target: '192.168.1.1',
        });

        expect(result).toContain('SCAN RESULTS');
        expect(result).toContain('192.168.1.1');
        expect(result).toContain('22/tcp');
      });

      it('shows vulnerabilities when found', async () => {
        mockNmapScan.mockResolvedValue({
          success: true,
          target: '192.168.1.1',
          scanType: 'vuln',
          startTime: Date.now(),
          endTime: Date.now(),
          openPorts: [],
          services: [],
          vulnerabilities: [
            {
              id: 'CVE-2023-1234',
              title: 'Critical RCE',
              severity: 'critical',
              exploitable: true,
            },
          ],
        });

        const result = await defenseSentinelTool({
          action: 'scan',
          target: 'test.com',
        });

        expect(result).toContain('VULNERABILITIES');
        expect(result).toContain('CVE-2023-1234');
        expect(result).toContain('EXPLOITABLE');
      });

      it('handles scan failure', async () => {
        mockNmapScan.mockResolvedValue({
          success: false,
          error: 'Host unreachable',
        });

        const result = await defenseSentinelTool({
          action: 'scan',
          target: 'unreachable.host',
        });

        expect(result).toContain('Scan failed');
        expect(result).toContain('Host unreachable');
      });
    });

    describe('quick_scan action', () => {
      it('performs quick scan', async () => {
        mockNmapScan.mockResolvedValue({
          success: true,
          target: '10.0.0.1',
          scanType: 'quick',
          startTime: Date.now(),
          endTime: Date.now(),
          openPorts: [],
          services: [],
          vulnerabilities: [],
        });

        await defenseSentinelTool({
          action: 'quick_scan',
          target: '10.0.0.1',
        });

        expect(mockNmapScan).toHaveBeenCalledWith(
          expect.objectContaining({ host: '10.0.0.1' }),
          'quick'
        );
      });
    });

    describe('vuln_scan action', () => {
      it('performs vulnerability scan', async () => {
        mockNmapScan.mockResolvedValue({
          success: true,
          target: 'test.com',
          scanType: 'vuln',
          startTime: Date.now(),
          endTime: Date.now(),
          openPorts: [],
          services: [],
          vulnerabilities: [],
        });

        await defenseSentinelTool({
          action: 'vuln_scan',
          target: 'test.com',
          authorized: true,
        });

        expect(mockNmapScan).toHaveBeenCalledWith(
          expect.objectContaining({ authorized: true }),
          'vuln'
        );
      });
    });
  });

  describe('Password Auditing', () => {
    describe('identify_hash action', () => {
      it('requires hash parameter', async () => {
        const result = await defenseSentinelTool({ action: 'identify_hash' });
        expect(result).toContain('Error');
        expect(result).toContain('Hash required');
      });

      it('identifies hash type', async () => {
        mockIdentifyHash.mockReturnValue('MD5');

        const result = await defenseSentinelTool({
          action: 'identify_hash',
          hash: '5f4dcc3b5aa765d61d8327deb882cf99',
        });

        expect(result).toContain('Hash type: MD5');
        expect(mockIdentifyHash).toHaveBeenCalledWith(
          '5f4dcc3b5aa765d61d8327deb882cf99'
        );
      });

      it('truncates long hashes in display', async () => {
        mockIdentifyHash.mockReturnValue('SHA-256');
        const longHash = 'a'.repeat(64);

        const result = await defenseSentinelTool({
          action: 'identify_hash',
          hash: longHash,
        });

        expect(result).toContain('SHA-256');
        expect(result).toContain('...');
      });
    });

    describe('audit_password action', () => {
      it('requires password parameter', async () => {
        const result = await defenseSentinelTool({ action: 'audit_password' });
        expect(result).toContain('Error');
        expect(result).toContain('Password required');
      });

      it('audits password strength', async () => {
        mockAuditPasswordStrength.mockReturnValue({
          score: 6,
          recommendation: 'Good password',
          issues: [],
        });

        const result = await defenseSentinelTool({
          action: 'audit_password',
          password: 'SecureP@ss123!',
        });

        expect(result).toContain('Score: 6/8');
        expect(result).toContain('Good password');
      });

      it('shows password issues', async () => {
        mockAuditPasswordStrength.mockReturnValue({
          score: 2,
          recommendation: 'Weak password',
          issues: ['Too short', 'No special characters'],
        });

        const result = await defenseSentinelTool({
          action: 'audit_password',
          password: 'weak',
        });

        expect(result).toContain('Issues');
        expect(result).toContain('Too short');
        expect(result).toContain('No special characters');
      });
    });

    describe('hashcat_cmd action', () => {
      it('requires hashFile and hashType', async () => {
        const result1 = await defenseSentinelTool({
          action: 'hashcat_cmd',
          hashFile: '/tmp/hashes.txt',
        });
        expect(result1).toContain('Error');

        const result2 = await defenseSentinelTool({
          action: 'hashcat_cmd',
          hashType: 'md5',
        });
        expect(result2).toContain('Error');
      });

      it('generates hashcat command', async () => {
        mockGenerateHashcatCommand.mockReturnValue(
          'hashcat -m 0 /tmp/hashes.txt /usr/share/wordlists/rockyou.txt'
        );

        const result = await defenseSentinelTool({
          action: 'hashcat_cmd',
          hashFile: '/tmp/hashes.txt',
          hashType: 'md5',
        });

        expect(result).toContain('hashcat');
        expect(result).toContain('authorization');
      });
    });
  });

  describe('Threat Hunting', () => {
    describe('log_threat action', () => {
      it('requires all threat fields', async () => {
        const result = await defenseSentinelTool({
          action: 'log_threat',
          threatType: 'port_scan',
          // Missing severity and source
        });
        expect(result).toContain('Error');
      });

      it('logs threat indicator', async () => {
        const result = await defenseSentinelTool({
          action: 'log_threat',
          threatType: 'port_scan',
          severity: 'high',
          source: '192.168.1.100',
          details: 'Suspicious activity',
        });

        expect(result).toContain('Threat logged');
        expect(mockLogThreat).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'port_scan',
            severity: 'high',
            source: '192.168.1.100',
          })
        );
      });
    });

    describe('get_threats action', () => {
      it('returns empty message when no threats', async () => {
        mockGetThreats.mockReturnValue([]);

        const result = await defenseSentinelTool({ action: 'get_threats' });

        expect(result).toContain('No threats recorded');
      });

      it('lists threats', async () => {
        mockGetThreats.mockReturnValue([
          {
            type: 'brute_force',
            severity: 'critical',
            source: '10.0.0.5',
            details: 'SSH brute force attempt',
            timestamp: Date.now(),
            mitigated: false,
          },
        ]);

        const result = await defenseSentinelTool({ action: 'get_threats' });

        expect(result).toContain('THREAT INDICATORS');
        expect(result).toContain('brute_force');
        expect(result).toContain('CRITICAL');
      });

      it('filters by severity', async () => {
        mockGetThreats.mockReturnValue([]);

        await defenseSentinelTool({
          action: 'get_threats',
          severity: 'critical',
          limit: 10,
        });

        expect(mockGetThreats).toHaveBeenCalledWith('critical', 10);
      });
    });

    describe('analyze_logs action', () => {
      it('requires logData parameter', async () => {
        const result = await defenseSentinelTool({ action: 'analyze_logs' });
        expect(result).toContain('Error');
        expect(result).toContain('logData required');
      });

      it('returns clean when no attacks found', async () => {
        mockAnalyzeForAttacks.mockReturnValue([]);

        const result = await defenseSentinelTool({
          action: 'analyze_logs',
          logData: 'Normal log content',
        });

        expect(result).toContain('No attack patterns detected');
      });

      it('analyzes logs and auto-logs threats', async () => {
        const threats = [
          {
            type: 'port_scan',
            severity: 'medium',
            details: 'Sequential port scanning detected',
          },
        ];
        mockAnalyzeForAttacks.mockReturnValue(threats);

        const result = await defenseSentinelTool({
          action: 'analyze_logs',
          logData: 'Suspicious log entries',
        });

        expect(result).toContain('ATTACK ANALYSIS');
        expect(mockLogThreat).toHaveBeenCalled();
      });
    });
  });

  describe('CodeForge', () => {
    describe('forge action', () => {
      it('requires all forge parameters', async () => {
        const result = await defenseSentinelTool({
          action: 'forge',
          purpose: 'scanner',
          // Missing language and description
        });
        expect(result).toContain('Error');
      });

      it('generates security code', async () => {
        mockForgeCode.mockReturnValue({
          success: true,
          code: 'import nmap\n# Port scanner',
          purpose: 'scanner',
          language: 'python',
          warnings: [],
          explanation: 'A simple port scanner',
        });

        const result = await defenseSentinelTool({
          action: 'forge',
          purpose: 'scanner',
          language: 'python',
          description: 'Simple port scanner',
        });

        expect(result).toContain('CODEFORGE');
        expect(result).toContain('SCANNER');
        expect(result).toContain('```python');
      });

      it('shows warnings', async () => {
        mockForgeCode.mockReturnValue({
          success: true,
          code: 'exploit code',
          purpose: 'exploit',
          language: 'python',
          warnings: ['Requires Rogue Mode', 'Use responsibly'],
        });

        const result = await defenseSentinelTool({
          action: 'forge',
          purpose: 'exploit',
          language: 'python',
          description: 'Test exploit',
        });

        expect(result).toContain('Requires Rogue Mode');
      });

      it('handles generation failure', async () => {
        mockForgeCode.mockReturnValue({
          success: false,
          error: 'Rogue Mode required for offensive code',
        });

        const result = await defenseSentinelTool({
          action: 'forge',
          purpose: 'exploit',
          language: 'python',
          description: 'Malicious code',
        });

        expect(result).toContain('failed');
        expect(result).toContain('Rogue Mode');
      });
    });

    describe('analyze action', () => {
      it('requires code and language', async () => {
        const result = await defenseSentinelTool({
          action: 'analyze',
          code: 'print("hello")',
        });
        expect(result).toContain('Error');
      });

      it('analyzes code for vulnerabilities', async () => {
        mockAnalyzeCode.mockReturnValue({
          isMalicious: false,
          malwareIndicators: [],
          vulnerabilities: [
            {
              type: 'sql_injection',
              severity: 'high',
              line: 15,
              description: 'Unparameterized query',
              fix: 'Use parameterized queries',
            },
          ],
        });

        const result = await defenseSentinelTool({
          action: 'analyze',
          code: 'db.query("SELECT * FROM users WHERE id=" + id)',
          language: 'javascript',
        });

        expect(result).toContain('CODE ANALYSIS');
        expect(result).toContain('sql_injection');
        expect(result).toContain('line 15');
      });

      it('detects malicious code', async () => {
        mockAnalyzeCode.mockReturnValue({
          isMalicious: true,
          malwareIndicators: ['Reverse shell', 'Data exfiltration'],
          vulnerabilities: [],
        });

        const result = await defenseSentinelTool({
          action: 'analyze',
          code: 'malicious code',
          language: 'bash',
        });

        expect(result).toContain('WARNING');
        expect(result).toContain('MALICIOUS');
        expect(result).toContain('Reverse shell');
      });

      it('reports clean code', async () => {
        mockAnalyzeCode.mockReturnValue({
          isMalicious: false,
          malwareIndicators: [],
          vulnerabilities: [],
        });

        const result = await defenseSentinelTool({
          action: 'analyze',
          code: 'console.log("safe")',
          language: 'javascript',
        });

        expect(result).toContain('No obvious vulnerabilities');
      });
    });
  });

  describe('Status', () => {
    describe('status action', () => {
      it('returns sentinel status', async () => {
        mockGetSentinelStatus.mockReturnValue({
          active: true,
          scansCompleted: 15,
          threatsDetected: 3,
          lastScan: Date.now(),
          availableTools: ['nmap', 'hashcat'],
          recentActivity: [
            { target: '192.168.1.1', type: 'quick', findings: 2 },
          ],
        });

        const result = await defenseSentinelTool({ action: 'status' });

        expect(result).toContain('DEFENSE SENTINEL STATUS');
        expect(result).toContain('Active: Yes');
        expect(result).toContain('Scans Completed: 15');
        expect(result).toContain('Threats Detected: 3');
      });

      it('shows no recent activity when empty', async () => {
        mockGetSentinelStatus.mockReturnValue({
          active: false,
          scansCompleted: 0,
          threatsDetected: 0,
          lastScan: 0,
          availableTools: [],
          recentActivity: [],
        });

        const result = await defenseSentinelTool({ action: 'status' });

        expect(result).toContain('Active: No');
        expect(result).not.toContain('Recent Activity');
      });
    });

    describe('tools action', () => {
      it('lists available security tools', async () => {
        mockDetectAvailableTools.mockResolvedValue({
          nmap: true,
          hashcat: false,
          john: true,
          hydra: false,
          nikto: false,
          sqlmap: true,
          metasploit: false,
        });

        const result = await defenseSentinelTool({ action: 'tools' });

        expect(result).toContain('AVAILABLE SECURITY TOOLS');
        expect(result).toContain('✓ nmap');
        expect(result).toContain('✗ hashcat');
      });
    });
  });

  describe('Unknown Action', () => {
    it('returns error for unknown action', async () => {
      const result = await defenseSentinelTool({
        action: 'unknown' as unknown,
      } as Parameters<typeof defenseSentinelTool>[0]);

      expect(result).toContain('Unknown action');
    });
  });
});
