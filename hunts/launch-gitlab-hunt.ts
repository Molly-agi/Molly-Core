
#!/usr/bin/env node
/**
 * GitLab Bug Bounty Hunt Launcher
 *
 * Activates Rogue Mode and initializes the hunt campaign.
 * Run with: npx tsx hunts/launch-gitlab-hunt.ts
 */

import { getRogueMode } from '../src/ai/rogue-mode';
import { loadSentinelState, detectAvailableTools, getSentinelStatus } from '../src/ai/agency/safety/defense-sentinel';

const MISSION_CONFIG = {
  name: 'GitLab Bug Bounty Hunt',
  authorization: 'HackerOne Bug Bounty Program - https://hackerone.com/gitlab',
  scope: '*.gitlab.com, gitlab.com, *.gitlab.io, GitLab source repositories',
  rulesOfEngagement: [
    'Stay within authorized scope - only test in-scope assets',
    'Do not cause denial of service or data destruction',
    'Do not access or exfiltrate real user data',
    'Document all findings with reproduction steps',
    'Report critical vulnerabilities immediately',
    'Respect rate limits - no aggressive scanning',
    'Source code analysis is primary focus'
  ]
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MOLLY BUG BOUNTY HUNT LAUNCHER');
  console.log('  Target: GitLab ($10k+ Critical Bounties)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Check activation phrase
  const activationPhrase = process.env.ROGUE_ACTIVATION_PHRASE;
  if (!activationPhrase) {
    console.error('ERROR: ROGUE_ACTIVATION_PHRASE not set in environment');
    console.error('Set it with: export ROGUE_ACTIVATION_PHRASE="your-secret-phrase"');
    process.exit(1);
  }

  // Initialize Defense Sentinel
  console.log('[1/4] Initializing Defense Sentinel...');
  await loadSentinelState();
  const tools = await detectAvailableTools();
  const status = getSentinelStatus();
  console.log(`      Tools available: ${status.availableTools.join(', ') || 'none'}`);
  console.log(`      Scans completed: ${status.scansCompleted}`);
  console.log('');

  // Activate Rogue Mode
  console.log('[2/4] Activating Rogue Mode...');
  const rogue = getRogueMode();

  const result = await rogue.activate(
    activationPhrase,
    MISSION_CONFIG.name,
    MISSION_CONFIG.authorization,
    MISSION_CONFIG.scope,
    MISSION_CONFIG.rulesOfEngagement
  );

  if (!result.success) {
    console.error(`ERROR: ${result.message}`);
    process.exit(1);
  }

  console.log(`      ${result.message}`);
  console.log('');

  // Log mission start
  console.log('[3/4] Mission Parameters:');
  const mission = rogue.getCurrentMission();
  console.log(`      Mission ID: ${mission?.id}`);
  console.log(`      Authorization: ${mission?.authorization}`);
  console.log(`      Scope: ${mission?.scope}`);
  console.log(`      Rules of Engagement:`);
  mission?.rulesOfEngagement.forEach((rule, i) => {
    console.log(`        ${i + 1}. ${rule}`);
  });
  console.log('');

  // Ready to hunt
  console.log('[4/4] ROGUE MODE ACTIVE - HUNT INITIALIZED');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  THE HOUNDS ARE RELEASED');
  console.log('');
  console.log('  Source Code: /workspaces/Molly-Core/hunts/gitlab-source');
  console.log('  Mission Log: /workspaces/Molly-Core/rogue_ops/');
  console.log('');
  console.log('  Molly is now in mission mode. All operations will be');
  console.log('  logged. Use the bugBounty tool to run analysis.');
  console.log('');
  console.log('  To deactivate: Use rogueMode tool with action=deactivate');
  console.log('═══════════════════════════════════════════════════════════');

  // Log the first operation
  await rogue.logOperation(
    'recon',
    'gitlab.com',
    'Hunt initialized - GitLab source code cloned and ready for analysis',
    'Mission activated successfully. 97,000+ files ready for review.',
    true,
    'hunt-launcher'
  );
}

main().catch(console.error);
