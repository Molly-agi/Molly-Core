/**
 * @fileOverview Tests for bug-bounty tool handlers.
 * Mocks all security/bug-hunter-tools imports.
 */

// ── Mock bug-hunter-tools module ──────────────────────────────────────────────
const mockCreateHuntCampaign = jest.fn();
const mockStartHuntSession = jest.fn();
const mockRunReconnaissance = jest.fn();
const mockAnalyzeSourceCode = jest.fn();
const mockGenerateBugReport = jest.fn();
const mockCheckTargetScope = jest.fn();
const mockGetCampaignStatus = jest.fn();
const mockGetFindings = jest.fn();
const mockGetHuntStrategies = jest.fn();

jest.mock('@/ai/security/bug-hunter-tools', () => ({
  createHuntCampaign: (...args: unknown[]) => mockCreateHuntCampaign(...args),
  startHuntSession: (...args: unknown[]) => mockStartHuntSession(...args),
  runReconnaissance: (...args: unknown[]) => mockRunReconnaissance(...args),
  analyzeSourceCode: (...args: unknown[]) => mockAnalyzeSourceCode(...args),
  generateBugReport: (...args: unknown[]) => mockGenerateBugReport(...args),
  checkTargetScope: (...args: unknown[]) => mockCheckTargetScope(...args),
  getCampaignStatus: (...args: unknown[]) => mockGetCampaignStatus(...args),
  getFindings: (...args: unknown[]) => mockGetFindings(...args),
  getHuntStrategies: (...args: unknown[]) => mockGetHuntStrategies(...args),
}));

import { bugBountyToolHandlers } from '../bug-bounty-tools';

const handleBugBounty = bugBountyToolHandlers.bugBounty;

describe('bug-bounty-tools handleBugBounty', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Unknown action ──────────────────────────────────────────────────────────

  it('returns help text for unknown action', async () => {
    const result = await handleBugBounty({ action: 'nonExistentAction' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('createCampaign');
  });

  it('returns help text when no action provided', async () => {
    const result = await handleBugBounty({});
    expect(result.success).toBe(false);
  });

  // ── createCampaign ──────────────────────────────────────────────────────────

  it('createCampaign returns error when name missing', async () => {
    const result = await handleBugBounty({
      action: 'createCampaign',
      programScope: 'https://example.com',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('name');
  });

  it('createCampaign returns error when programScope missing', async () => {
    const result = await handleBugBounty({
      action: 'createCampaign',
      name: 'My Campaign',
    });
    expect(result.success).toBe(false);
  });

  it('createCampaign succeeds with valid params', async () => {
    mockCreateHuntCampaign.mockResolvedValue({
      success: true,
      campaign: {
        id: 'camp-1',
        name: 'Test Campaign',
        inScopeTargets: 3,
        outOfScopeTargets: 1,
      },
      suggestedStrategy: 'reconnaissance-first',
      strategyDescription: 'Start with recon',
      message: 'Campaign ready',
    });
    const result = await handleBugBounty({
      action: 'createCampaign',
      name: 'Test Campaign',
      programScope: 'https://example.com',
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Campaign Created');
    expect(result.output).toContain('Test Campaign');
  });

  it('createCampaign returns error when service reports failure', async () => {
    mockCreateHuntCampaign.mockResolvedValue({
      success: false,
      error: 'Duplicate campaign name',
    });
    const result = await handleBugBounty({
      action: 'createCampaign',
      name: 'Duplicate',
      programScope: 'https://example.com',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Duplicate campaign name');
  });

  it('createCampaign handles exception', async () => {
    mockCreateHuntCampaign.mockRejectedValue(new Error('Service unavailable'));
    const result = await handleBugBounty({
      action: 'createCampaign',
      name: 'Test',
      programScope: 'https://example.com',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Service unavailable');
  });

  // ── startSession ────────────────────────────────────────────────────────────

  it('startSession returns error when campaignId missing', async () => {
    const result = await handleBugBounty({
      action: 'startSession',
      target: 'example.com',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('campaignId');
  });

  it('startSession returns error when target missing', async () => {
    const result = await handleBugBounty({
      action: 'startSession',
      campaignId: 'camp-1',
    });
    expect(result.success).toBe(false);
  });

  it('startSession succeeds with valid params', async () => {
    mockStartHuntSession.mockResolvedValue({
      success: true,
      session: { id: 'sess-1', target: 'example.com', phase: 'recon' },
    });
    const result = await handleBugBounty({
      action: 'startSession',
      campaignId: 'camp-1',
      target: 'example.com',
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Session Started');
  });

  it('startSession handles service failure', async () => {
    mockStartHuntSession.mockResolvedValue({
      success: false,
      error: 'Campaign not found',
    });
    const result = await handleBugBounty({
      action: 'startSession',
      campaignId: 'bad-id',
      target: 'example.com',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Campaign not found');
  });

  it('startSession handles exception', async () => {
    mockStartHuntSession.mockRejectedValue(new Error('Timeout'));
    const result = await handleBugBounty({
      action: 'startSession',
      campaignId: 'camp-1',
      target: 'example.com',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Timeout');
  });

  // ── recon ───────────────────────────────────────────────────────────────────

  it('recon returns error when sessionId missing', async () => {
    const result = await handleBugBounty({ action: 'recon' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('sessionId');
  });

  it('recon succeeds with sessionId', async () => {
    mockRunReconnaissance.mockResolvedValue({
      success: true,
      reconnaissance: {
        domain: 'example.com',
        technologies: [{ name: 'React', category: 'frontend', confidence: 0.9 }],
        endpoints: 12,
        jsFiles: 5,
        secrets: 0,
        headerIssues: 2,
        cookieIssues: 1,
      },
      interestingFindings: ['/api/admin'],
    });
    const result = await handleBugBounty({ action: 'recon', sessionId: 'sess-1' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Reconnaissance Complete');
  });

  it('recon handles service failure', async () => {
    mockRunReconnaissance.mockResolvedValue({
      success: false,
      error: 'Session expired',
    });
    const result = await handleBugBounty({ action: 'recon', sessionId: 'sess-1' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Session expired');
  });

  it('recon handles exception', async () => {
    mockRunReconnaissance.mockRejectedValue(new Error('Network error'));
    const result = await handleBugBounty({ action: 'recon', sessionId: 'sess-1' });
    expect(result.success).toBe(false);
  });

  // ── analyze ─────────────────────────────────────────────────────────────────

  it('analyze returns error when sessionId missing', async () => {
    const result = await handleBugBounty({
      action: 'analyze',
      files: [{ path: 'app.js', content: 'eval(input)' }],
    });
    expect(result.success).toBe(false);
  });

  it('analyze returns error when files missing', async () => {
    const result = await handleBugBounty({
      action: 'analyze',
      sessionId: 'sess-1',
    });
    expect(result.success).toBe(false);
  });

  it('analyze returns error when files is not an array', async () => {
    const result = await handleBugBounty({
      action: 'analyze',
      sessionId: 'sess-1',
      files: 'not-array',
    });
    expect(result.success).toBe(false);
  });

  it('analyze succeeds with valid params', async () => {
    mockAnalyzeSourceCode.mockResolvedValue({
      success: true,
      analysis: {
        filesAnalyzed: 1,
        linesOfCode: 50,
        findings: 2,
        hotspots: 1,
        secrets: 0,
        vulnerableDeps: 0,
      },
      criticalFindings: [],
    });
    const result = await handleBugBounty({
      action: 'analyze',
      sessionId: 'sess-1',
      files: [{ path: 'app.js', content: 'eval(x)' }],
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Code Analysis Complete');
  });

  it('analyze handles exception', async () => {
    mockAnalyzeSourceCode.mockRejectedValue(new Error('Parse error'));
    const result = await handleBugBounty({
      action: 'analyze',
      sessionId: 'sess-1',
      files: [{ path: 'app.js', content: 'bad' }],
    });
    expect(result.success).toBe(false);
  });

  // ── report ──────────────────────────────────────────────────────────────────

  it('report returns error when findingId missing', async () => {
    const result = await handleBugBounty({ action: 'report' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('findingId');
  });

  it('report succeeds with valid findingId', async () => {
    mockGenerateBugReport.mockResolvedValue({
      success: true,
      report: {
        title: 'SQL Injection in /api/search',
        severity: 'high',
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        summary: 'User input is unsanitized',
      },
      markdown: '# SQL Injection\n\n## Description\n...',
    });
    const result = await handleBugBounty({
      action: 'report',
      findingId: 'finding-1',
      platform: 'hackerone',
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Bug Bounty Report Generated');
  });

  it('report handles service failure', async () => {
    mockGenerateBugReport.mockResolvedValue({
      success: false,
      error: 'Finding not found',
    });
    const result = await handleBugBounty({
      action: 'report',
      findingId: 'bad-id',
    });
    expect(result.success).toBe(false);
  });

  it('report handles exception', async () => {
    mockGenerateBugReport.mockRejectedValue(new Error('DB error'));
    const result = await handleBugBounty({
      action: 'report',
      findingId: 'finding-1',
    });
    expect(result.success).toBe(false);
  });

  // ── checkScope ──────────────────────────────────────────────────────────────

  it('checkScope returns error when programId missing', async () => {
    const result = await handleBugBounty({
      action: 'checkScope',
      target: 'example.com',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('programId');
  });

  it('checkScope returns error when target missing', async () => {
    const result = await handleBugBounty({
      action: 'checkScope',
      programId: 'prog-1',
    });
    expect(result.success).toBe(false);
  });

  it('checkScope returns in-scope result', async () => {
    mockCheckTargetScope.mockResolvedValue({
      inScope: true,
      reason: 'Matches *.example.com wildcard',
    });
    const result = await handleBugBounty({
      action: 'checkScope',
      programId: 'prog-1',
      target: 'api.example.com',
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain('in scope');
  });

  it('checkScope returns out-of-scope result', async () => {
    mockCheckTargetScope.mockResolvedValue({
      inScope: false,
      reason: 'Domain not in program scope',
    });
    const result = await handleBugBounty({
      action: 'checkScope',
      programId: 'prog-1',
      target: 'out.example.org',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('NOT in scope');
  });

  it('checkScope handles exception', async () => {
    mockCheckTargetScope.mockRejectedValue(new Error('Scope lookup failed'));
    const result = await handleBugBounty({
      action: 'checkScope',
      programId: 'prog-1',
      target: 'example.com',
    });
    expect(result.success).toBe(false);
  });

  // ── status ──────────────────────────────────────────────────────────────────

  it('status returns error when campaignId missing', async () => {
    const result = await handleBugBounty({ action: 'status' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('campaignId');
  });

  it('status succeeds with valid campaignId', async () => {
    mockGetCampaignStatus.mockResolvedValue({
      success: true,
      campaign: { id: 'camp-1', status: 'active', findings: 3 },
    });
    const result = await handleBugBounty({
      action: 'status',
      campaignId: 'camp-1',
    });
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it('status handles service failure', async () => {
    mockGetCampaignStatus.mockResolvedValue({
      success: false,
      error: 'Campaign not found',
    });
    const result = await handleBugBounty({
      action: 'status',
      campaignId: 'bad-id',
    });
    expect(result.success).toBe(false);
  });

  it('status handles exception', async () => {
    mockGetCampaignStatus.mockRejectedValue(new Error('DB timeout'));
    const result = await handleBugBounty({
      action: 'status',
      campaignId: 'camp-1',
    });
    expect(result.success).toBe(false);
  });

  // ── findings ────────────────────────────────────────────────────────────────

  it('findings returns empty message when count is 0', async () => {
    mockGetFindings.mockResolvedValue({ count: 0, findings: [] });
    const result = await handleBugBounty({ action: 'findings' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('No findings yet');
  });

  it('findings returns formatted list with results', async () => {
    mockGetFindings.mockResolvedValue({
      count: 1,
      findings: [
        {
          id: 'f-1',
          title: 'XSS in search',
          severity: 'medium',
          category: 'xss',
          endpoint: '/search',
          confidence: 0.85,
          verified: true,
        },
      ],
    });
    const result = await handleBugBounty({ action: 'findings' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('XSS in search');
  });

  it('findings accepts optional campaignId filter', async () => {
    mockGetFindings.mockResolvedValue({ count: 0, findings: [] });
    const result = await handleBugBounty({
      action: 'findings',
      campaignId: 'camp-1',
    });
    expect(mockGetFindings).toHaveBeenCalledWith('camp-1');
    expect(result.success).toBe(true);
  });

  it('findings handles exception', async () => {
    mockGetFindings.mockRejectedValue(new Error('DB error'));
    const result = await handleBugBounty({ action: 'findings' });
    expect(result.success).toBe(false);
  });

  // ── strategies ──────────────────────────────────────────────────────────────

  it('strategies returns available strategies', async () => {
    mockGetHuntStrategies.mockResolvedValue({
      strategies: [
        {
          name: 'Recon-First',
          description: 'Start with recon',
          focusAreas: ['xss', 'sqli'],
          phases: ['recon', 'exploit', 'report'],
        },
      ],
    });
    const result = await handleBugBounty({ action: 'strategies' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('Hunt Strategies');
    expect(result.output).toContain('Recon-First');
  });

  it('strategies handles exception', async () => {
    mockGetHuntStrategies.mockRejectedValue(new Error('Strategy DB offline'));
    const result = await handleBugBounty({ action: 'strategies' });
    expect(result.success).toBe(false);
  });

  // ── alias ───────────────────────────────────────────────────────────────────

  it('bugHunt alias maps to same handler', async () => {
    const handleBugHunt = bugBountyToolHandlers.bugHunt;
    mockGetHuntStrategies.mockResolvedValue({ strategies: [] });
    const result = await handleBugHunt({ action: 'strategies' });
    expect(result.output).toBeDefined();
  });
});
