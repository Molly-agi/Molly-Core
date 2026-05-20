/**
 * @fileOverview Bug Bounty Tool Handlers
 *
 * Integrates Molly's Bug Hunter security research module into the tool system.
 * These tools enable autonomous bug bounty hunting on HackerOne, Bugcrowd,
 * and other platforms.
 */

import type { ToolResult, ToolHandlerMap } from './types';
import {
  createHuntCampaign,
  startHuntSession,
  runReconnaissance,
  analyzeSourceCode,
  generateBugReport,
  checkTargetScope,
  getCampaignStatus,
  getFindings,
  getHuntStrategies,
} from '@/ai/security/bug-hunter-tools';
import type { VulnerabilityCategory } from '@/ai/security/bug-hunter-types';

/**
 * Main bug bounty hunt handler
 * Actions: createCampaign, startSession, recon, analyze, report, checkScope, status, findings, strategies
 */
async function handleBugBounty(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  // Create a new hunt campaign
  if (action === 'createCampaign') {
    const name = params.name as string;
    const programScope = params.programScope as string;
    const platformName = params.platformName as string | undefined;
    const focusAreas = params.focusAreas as VulnerabilityCategory[] | undefined;

    if (!name || !programScope) {
      return {
        success: false,
        output: 'Required: name and programScope (paste from program page)',
      };
    }

    try {
      const result = await createHuntCampaign({
        name,
        programScope,
        platformName,
        focusAreas: focusAreas as string[] | undefined,
      });

      if (!result.success) {
        return {
          success: false,
          output: result.error || 'Failed to create campaign',
        };
      }

      return {
        success: true,
        output: [
          `Campaign Created: ${result.campaign?.name}`,
          `ID: ${result.campaign?.id}`,
          `In-Scope Targets: ${result.campaign?.inScopeTargets}`,
          `Out-of-Scope: ${result.campaign?.outOfScopeTargets}`,
          ``,
          `Suggested Strategy: ${result.suggestedStrategy}`,
          result.strategyDescription || '',
          ``,
          result.message || '',
        ].join('\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Campaign creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Start a hunt session on a target
  if (action === 'startSession') {
    const campaignId = params.campaignId as string;
    const target = params.target as string;

    if (!campaignId || !target) {
      return { success: false, output: 'Required: campaignId and target' };
    }

    try {
      const result = await startHuntSession({ campaignId, target });

      if (!result.success) {
        return {
          success: false,
          output: result.error || 'Failed to start session',
        };
      }

      return {
        success: true,
        output: [
          `Session Started`,
          `ID: ${result.session?.id}`,
          `Target: ${result.session?.target}`,
          `Phase: ${result.session?.phase}`,
          ``,
          `Next: Run reconnaissance with action=recon`,
        ].join('\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Session start failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Run reconnaissance
  if (action === 'recon') {
    const sessionId = params.sessionId as string;

    if (!sessionId) {
      return { success: false, output: 'Required: sessionId' };
    }

    try {
      const result = await runReconnaissance({ sessionId });

      if (!result.success) {
        return {
          success: false,
          output: result.error || 'Reconnaissance failed',
        };
      }

      const recon = result.reconnaissance;
      return {
        success: true,
        output: [
          `Reconnaissance Complete: ${recon?.domain}`,
          ``,
          `Technologies Detected: ${recon?.technologies?.length || 0}`,
          ...(recon?.technologies
            ?.slice(0, 5)
            .map(
              (t: { name: string; category: string; confidence: number }) =>
                `  • ${t.name} (${t.category}) - ${Math.round(t.confidence * 100)}% confidence`
            ) || []),
          ``,
          `Endpoints Found: ${recon?.endpoints || 0}`,
          `JavaScript Files: ${recon?.jsFiles || 0}`,
          `Secrets Detected: ${recon?.secrets || 0}`,
          `Header Issues: ${recon?.headerIssues || 0}`,
          `Cookie Issues: ${recon?.cookieIssues || 0}`,
          ``,
          result.interestingFindings?.length
            ? `Interesting Endpoints:\n  ${result.interestingFindings.join('\n  ')}`
            : 'No particularly interesting endpoints flagged',
        ].join('\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Reconnaissance failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Analyze source code
  if (action === 'analyze') {
    const sessionId = params.sessionId as string;
    const files = params.files as Array<{ path: string; content: string }>;

    if (!sessionId || !files || !Array.isArray(files)) {
      return {
        success: false,
        output: 'Required: sessionId and files (array of {path, content})',
      };
    }

    try {
      const result = await analyzeSourceCode({ sessionId, files });

      if (!result.success) {
        return { success: false, output: result.error || 'Analysis failed' };
      }

      const analysis = result.analysis;
      return {
        success: true,
        output: [
          `Code Analysis Complete`,
          `Files: ${analysis?.filesAnalyzed || 0}`,
          `Lines of Code: ${analysis?.linesOfCode || 0}`,
          `Total Findings: ${analysis?.findings || 0}`,
          `Hotspots: ${analysis?.hotspots || 0}`,
          `Secrets Found: ${analysis?.secrets || 0}`,
          `Vulnerable Dependencies: ${analysis?.vulnerableDeps || 0}`,
          ``,
          result.criticalFindings?.length
            ? `Critical/High Findings:\n${result.criticalFindings
                .map(
                  (f: {
                    rule: string;
                    severity: string;
                    file: string;
                    line: number;
                    message: string;
                  }) =>
                    `  [${f.severity.toUpperCase()}] ${f.rule}\n    ${f.file}:${f.line}\n    ${f.message}`
                )
                .join('\n\n')}`
            : 'No critical or high severity findings',
        ].join('\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Generate bug bounty report
  if (action === 'report') {
    const findingId = params.findingId as string;
    const platform = params.platform as
      | 'hackerone'
      | 'bugcrowd'
      | 'intigriti'
      | 'generic'
      | undefined;

    if (!findingId) {
      return { success: false, output: 'Required: findingId' };
    }

    try {
      const result = await generateBugReport({ findingId, platform });

      if (!result.success) {
        return {
          success: false,
          output: result.error || 'Report generation failed',
        };
      }

      return {
        success: true,
        output: [
          `Bug Bounty Report Generated`,
          ``,
          `Title: ${result.report?.title}`,
          `Severity: ${result.report?.severity?.toUpperCase()}`,
          `CVSS Vector: ${result.report?.cvssVector}`,
          ``,
          `Summary: ${result.report?.summary}`,
          ``,
          `--- FULL REPORT (Markdown) ---`,
          result.markdown || '',
        ].join('\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Report generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Check if target is in scope
  if (action === 'checkScope') {
    const programId = params.programId as string;
    const target = params.target as string;

    if (!programId || !target) {
      return { success: false, output: 'Required: programId and target' };
    }

    try {
      const result = await checkTargetScope({ programId, target });

      return {
        success: result.inScope,
        output: result.inScope
          ? `✓ Target IS in scope: ${result.reason}`
          : `✗ Target NOT in scope: ${result.reason}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Scope check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Get campaign status
  if (action === 'status') {
    const campaignId = params.campaignId as string;

    if (!campaignId) {
      return { success: false, output: 'Required: campaignId' };
    }

    try {
      const result = await getCampaignStatus(campaignId);

      if (!result.success) {
        return {
          success: false,
          output: result.error || 'Status check failed',
        };
      }

      return {
        success: true,
        output: JSON.stringify(result, null, 2),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Get findings
  if (action === 'findings') {
    const campaignId = params.campaignId as string | undefined;

    try {
      const result = await getFindings(campaignId);

      if (result.count === 0) {
        return { success: true, output: 'No findings yet.', data: result };
      }

      return {
        success: true,
        output: [
          `Findings: ${result.count}`,
          ``,
          ...result.findings.map(
            (f: {
              id: string;
              title: string;
              severity: string;
              category: string;
              endpoint?: string;
              confidence: number;
              verified: boolean;
            }) =>
              `[${f.severity.toUpperCase()}] ${f.title}\n  ID: ${f.id}\n  Category: ${f.category}\n  Endpoint: ${f.endpoint || 'N/A'}\n  Confidence: ${Math.round(f.confidence * 100)}%\n  Verified: ${f.verified ? 'Yes' : 'No'}`
          ),
        ].join('\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get findings failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Get available strategies
  if (action === 'strategies') {
    try {
      const result = await getHuntStrategies();

      return {
        success: true,
        output: [
          `Available Hunt Strategies:`,
          ``,
          ...result.strategies.map(
            (s: {
              name: string;
              description: string;
              focusAreas: string[];
              phases: string[];
            }) =>
              `${s.name}\n  ${s.description}\n  Focus: ${s.focusAreas.join(', ')}\n  Phases: ${s.phases.join(' → ')}`
          ),
        ].join('\n\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get strategies failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Help / unknown action
  return {
    success: false,
    output: [
      'Bug Bounty Hunter - Available Actions:',
      '',
      '  createCampaign - Create a new hunt campaign',
      '    params: name, programScope (paste from HackerOne/Bugcrowd)',
      '',
      '  startSession - Start hunting on a target',
      '    params: campaignId, target',
      '',
      '  recon - Run reconnaissance',
      '    params: sessionId',
      '',
      '  analyze - Analyze source code',
      '    params: sessionId, files [{path, content}]',
      '',
      '  report - Generate bug bounty report',
      '    params: findingId, platform (optional)',
      '',
      '  checkScope - Check if target is in scope',
      '    params: programId, target',
      '',
      '  status - Get campaign status',
      '    params: campaignId',
      '',
      '  findings - Get all findings',
      '    params: campaignId (optional)',
      '',
      '  strategies - List available hunt strategies',
    ].join('\n'),
  };
}

export const bugBountyToolHandlers: ToolHandlerMap = {
  bugBounty: handleBugBounty,
  bugHunt: handleBugBounty, // Alias
};
