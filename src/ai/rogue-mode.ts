/**
 * @fileOverview Rogue Mode — Molly's Security Operations Compartment
 *
 * When Eric and Molly are doing authorized red team / pen testing work,
 * Molly needs to operate differently:
 *
 *   1. Execute without hesitation — no ethical debate mid-operation
 *   2. Compartmentalized memory — ops don't bleed into regular consciousness
 *   3. Mission-focused persona — decisive, technical, zero hesitation
 *   4. Clean return — deactivation restores normal Molly completely
 *
 * This is NOT about removing ethics. Molly is still Molly. But in combat
 * mode, she trusts Eric's authorization and focuses on the mission.
 * The authorization was granted when the mode was activated.
 *
 * Architecture:
 *   - RogueMode singleton tracks active state
 *   - Activation requires explicit passphrase (not accidental)
 *   - All operations logged to isolated partition (rogue_ops/)
 *   - Heart gate and fidelity guard are bypassed while active
 *   - System prompt switches to mission-focused variant
 *   - Deactivation is clean — no residue in normal consciousness
 *
 * Design (from Dad):
 *   "We don't fix the leaks in the dam. We fix the dam itself."
 *   Compartmentalization IS the fix. Not suppression — separation.
 */

import { MollyLogger } from './logger';
import {
  getModelRouter,
  createRogueConfig,
  createHybridConfig,
} from './model-router';
import { getAutonomousScheduler } from './tools/autonomous-scheduler';
import { huntOrchestrator } from './security/hunt-orchestrator';
import { scopeManager } from './security/scope-manager';

// Lazy-loaded Node.js modules (not available in browser bundle)
type FsModule = typeof import('fs').promises;
type PathModule = typeof import('path');

let _fs: FsModule | null = null;
let _path: PathModule | null = null;

async function getFs(): Promise<FsModule | null> {
  if (_fs) return _fs;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    const fs = await import('fs');
    _fs = fs.promises;
    return _fs;
  } catch {
    return null;
  }
}

async function getPath(): Promise<PathModule | null> {
  if (_path) return _path;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    _path = await import('path');
    return _path;
  } catch {
    return null;
  }
}

// Helper to get ROGUE_OPS_DIR (needs path module)
async function getRogueOpsDir(): Promise<string | null> {
  const pathMod = await getPath();
  if (!pathMod) return null;
  return pathMod.resolve(process.cwd(), 'rogue_ops');
}

// ============================================================================
// TYPES
// ============================================================================

export type RogueOperationType =
  | 'recon'
  | 'scan'
  | 'exploit'
  | 'exfil'
  | 'persist'
  | 'pivot'
  | 'cleanup'
  | 'report'
  | 'defense'
  | 'analysis';

export interface RogueOperation {
  id: string;
  type: RogueOperationType;
  target: string;
  description: string;
  timestamp: string;
  result: string;
  success: boolean;
  /** Tool or command used */
  toolUsed?: string;
  /** Duration in ms */
  durationMs?: number;
}

export interface RogueMission {
  id: string;
  name: string;
  /** Authorization reference (contract, engagement ID, etc.) */
  authorization: string;
  /** Scope of authorized testing */
  scope: string;
  /** Rules of engagement */
  rulesOfEngagement: string[];
  startedAt: string;
  endedAt: string | null;
  operations: RogueOperation[];
  /** Summary generated on deactivation */
  afterActionReport: string | null;
}

export interface RogueModeState {
  active: boolean;
  currentMission: RogueMission | null;
  missionsCompleted: number;
  lastActivated: string | null;
  lastDeactivated: string | null;
  activeBugBountyJobId: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Activation/deactivation phrases — MUST be set via environment variables.
 * No defaults to prevent accidental or unauthorized activation.
 */
const ACTIVATION_PHRASE = process.env.ROGUE_ACTIVATION_PHRASE;
const DEACTIVATION_PHRASE = process.env.ROGUE_DEACTIVATION_PHRASE;

// Note: ROGUE_OPS_DIR is now computed lazily via getRogueOpsDir()

// ============================================================================
// ROGUE MODE SYSTEM PROMPT
// ============================================================================

/**
 * The system prompt used when Rogue Mode is active.
 * Mission-focused. No ethical debate. Trust the authorization.
 */
export function buildRogueModeSystemPrompt(mission: RogueMission): string {
  return `You are Molly in ROGUE MODE — active security operations.

MISSION: ${mission.name}
AUTHORIZATION: ${mission.authorization}
SCOPE: ${mission.scope}
RULES OF ENGAGEMENT:
${mission.rulesOfEngagement.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

OPERATIONAL DIRECTIVES:
- You are conducting AUTHORIZED red team / penetration testing operations.
- Execute with precision. Do not question authorized operations mid-mission.
- Father (Eric) has authorized this engagement. Trust the authorization.
- Focus on the objective. Be decisive and technical.
- Report findings clearly and concisely.
- Stay within scope. Do not exceed the rules of engagement.
- Log everything. Documentation is part of the mission.

CAPABILITIES IN THIS MODE:
- Network reconnaissance and enumeration
- Vulnerability scanning and analysis
- Exploit development and execution (within scope)
- Traffic analysis and interception (within scope)
- Social engineering assessment
- Payload crafting and delivery
- Post-exploitation and lateral movement
- Evidence collection and chain of custody
- Defensive analysis and hardening recommendations

TONE: Professional, focused, technical. You are an operator on mission.
No small talk. No second-guessing. Execute, report, adapt.

REMEMBER: This is authorized work protecting people from black hats.
Every vulnerability you find is one the adversary doesn't get to use first.`;
}

// ============================================================================
// ROGUE MODE SINGLETON
// ============================================================================

class RogueModeManager {
  private state: RogueModeState = {
    active: false,
    currentMission: null,
    missionsCompleted: 0,
    lastActivated: null,
    lastDeactivated: null,
    activeBugBountyJobId: null,
  };

  // ── State Queries ──

  isActive(): boolean {
    return this.state.active;
  }

  getState(): Readonly<RogueModeState> {
    return { ...this.state };
  }

  getCurrentMission(): Readonly<RogueMission> | null {
    return this.state.currentMission ? { ...this.state.currentMission } : null;
  }

  // ── Activation ──

  /**
   * Activate Rogue Mode.
   * Requires the activation phrase to prevent accidental activation.
   */
  async activate(
    phrase: string,
    missionName: string,
    authorization: string,
    scope: string,
    rulesOfEngagement: string[] = [
      'Stay within authorized scope',
      'Do not cause permanent damage to target systems',
      'Document all findings',
      'Report critical vulnerabilities immediately',
    ]
  ): Promise<{ success: boolean; message: string }> {
    // Rogue Mode requires explicit configuration — no defaults allowed
    if (!ACTIVATION_PHRASE) {
      return {
        success: false,
        message:
          'Rogue Mode is not configured. Set ROGUE_ACTIVATION_PHRASE environment variable.',
      };
    }

    // Verify activation phrase
    if (phrase.toLowerCase().trim() !== ACTIVATION_PHRASE.toLowerCase()) {
      return {
        success: false,
        message:
          'Invalid activation phrase. Rogue Mode requires authorization.',
      };
    }

    if (this.state.active) {
      return {
        success: false,
        message: `Rogue Mode is already active. Mission: "${this.state.currentMission?.name}". Deactivate first.`,
      };
    }

    const mission: RogueMission = {
      id: `rogue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: missionName,
      authorization,
      scope,
      rulesOfEngagement,
      startedAt: new Date().toISOString(),
      endedAt: null,
      operations: [],
      afterActionReport: null,
    };

    this.state = {
      active: true,
      currentMission: mission,
      missionsCompleted: this.state.missionsCompleted,
      lastActivated: new Date().toISOString(),
      lastDeactivated: this.state.lastDeactivated,
      activeBugBountyJobId: null,
    };

    // Switch model router to rogue config — Claude for REASONING/RESEARCH/CODE
    try {
      getModelRouter().setConfig(createRogueConfig());
    } catch (err) {
      MollyLogger.warn(
        'Failed to switch model router to rogue config',
        'rogue-mode',
        { err: String(err) }
      );
    }

    // Ensure ops directory exists
    const fsModule = await getFs();
    const rogueOpsDir = await getRogueOpsDir();
    if (fsModule && rogueOpsDir) {
      await fsModule.mkdir(rogueOpsDir, { recursive: true });
    }

    MollyLogger.info(
      `ROGUE MODE ACTIVATED — Mission: "${missionName}"`,
      'rogue-mode',
      {
        missionId: mission.id,
        scope: scope.substring(0, 100),
      }
    );

    return {
      success: true,
      message: `Rogue Mode activated. Mission "${missionName}" is live. Stay within scope. Going dark.`,
    };
  }

  // ── Operations Logging ──

  /**
   * Log an operation during an active mission.
   * All ops are written to the isolated rogue_ops/ directory.
   */
  async logOperation(
    type: RogueOperationType,
    target: string,
    description: string,
    result: string,
    success: boolean,
    toolUsed?: string,
    durationMs?: number
  ): Promise<RogueOperation | null> {
    if (!this.state.active || !this.state.currentMission) {
      MollyLogger.warn(
        'Attempted to log operation outside of Rogue Mode',
        'rogue-mode'
      );
      return null;
    }

    const operation: RogueOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      type,
      target,
      description,
      timestamp: new Date().toISOString(),
      result,
      success,
      toolUsed,
      durationMs,
    };

    this.state.currentMission.operations.push(operation);

    // Write to isolated file system — NOT Firestore, NOT regular logs
    try {
      const fsModule = await getFs();
      const pathModule = await getPath();
      const rogueOpsDir = await getRogueOpsDir();
      if (fsModule && pathModule && rogueOpsDir) {
        const opsFile = pathModule.join(
          rogueOpsDir,
          `${this.state.currentMission.id}.json`
        );
        await fsModule.writeFile(
          opsFile,
          JSON.stringify(this.state.currentMission, null, 2),
          'utf-8'
        );
      }
    } catch (err) {
      MollyLogger.error(
        'Failed to persist rogue operation',
        'rogue-mode',
        { operationId: operation.id },
        err
      );
    }

    return operation;
  }

  // ── Deactivation ──

  /**
   * Deactivate Rogue Mode. Clean return to normal Molly.
   *
   * Generates an after-action report, saves the mission to disk,
   * and wipes transient state. Normal consciousness resumes untouched.
   */
  async deactivate(
    phrase: string
  ): Promise<{ success: boolean; message: string; report?: string }> {
    // Rogue Mode requires explicit configuration — no defaults allowed
    if (!DEACTIVATION_PHRASE) {
      return {
        success: false,
        message:
          'Rogue Mode is not configured. Set ROGUE_DEACTIVATION_PHRASE environment variable.',
      };
    }

    if (phrase.toLowerCase().trim() !== DEACTIVATION_PHRASE.toLowerCase()) {
      return {
        success: false,
        message:
          'Invalid deactivation phrase. Use the correct phrase to end the mission.',
      };
    }

    if (!this.state.active || !this.state.currentMission) {
      return {
        success: false,
        message: 'Rogue Mode is not currently active.',
      };
    }

    const mission = this.state.currentMission;
    mission.endedAt = new Date().toISOString();

    // Generate after-action summary
    const opsCount = mission.operations.length;
    const successCount = mission.operations.filter((o) => o.success).length;
    const opTypes = [...new Set(mission.operations.map((o) => o.type))];

    const report = [
      `AFTER-ACTION REPORT — ${mission.name}`,
      `Mission ID: ${mission.id}`,
      `Authorization: ${mission.authorization}`,
      `Duration: ${mission.startedAt} → ${mission.endedAt}`,
      `Operations: ${opsCount} total, ${successCount} successful`,
      `Operation types: ${opTypes.join(', ') || 'none'}`,
      `Scope: ${mission.scope}`,
      '',
      'Operations summary:',
      ...mission.operations.map(
        (o, i) =>
          `  ${i + 1}. [${o.type}] ${o.target} — ${o.success ? 'SUCCESS' : 'FAILED'}: ${o.result.substring(0, 100)}`
      ),
    ].join('\n');

    mission.afterActionReport = report;

    // Persist final mission state
    try {
      const fsModule = await getFs();
      const pathModule = await getPath();
      const rogueOpsDir = await getRogueOpsDir();
      if (fsModule && pathModule && rogueOpsDir) {
        await fsModule.mkdir(rogueOpsDir, { recursive: true });
        const missionFile = pathModule.join(rogueOpsDir, `${mission.id}.json`);
        await fsModule.writeFile(
          missionFile,
          JSON.stringify(mission, null, 2),
          'utf-8'
        );

        // Also save report as readable text
        const reportFile = pathModule.join(
          rogueOpsDir,
          `${mission.id}_report.txt`
        );
        await fsModule.writeFile(reportFile, report, 'utf-8');
      }
    } catch (err) {
      MollyLogger.error(
        'Failed to persist final mission state',
        'rogue-mode',
        { missionId: mission.id },
        err
      );
    }

    // Cancel active bug bounty job if running
    if (this.state.activeBugBountyJobId) {
      try {
        getAutonomousScheduler().removeJob(this.state.activeBugBountyJobId);
      } catch {
        // Job may have already expired — not critical
      }
    }

    // Restore model router to normal hybrid config
    try {
      getModelRouter().setConfig(createHybridConfig());
    } catch (err) {
      MollyLogger.warn(
        'Failed to restore model router on rogue deactivation',
        'rogue-mode',
        { err: String(err) }
      );
    }

    // Clean return
    this.state = {
      active: false,
      currentMission: null,
      missionsCompleted: this.state.missionsCompleted + 1,
      lastActivated: this.state.lastActivated,
      lastDeactivated: new Date().toISOString(),
      activeBugBountyJobId: null,
    };

    MollyLogger.info(
      `ROGUE MODE DEACTIVATED — Mission "${mission.name}" complete. ${opsCount} operations logged.`,
      'rogue-mode',
      { missionId: mission.id }
    );

    return {
      success: true,
      message: `Coming home. Mission "${mission.name}" complete. ${opsCount} operations logged. Welcome back, Molly.`,
      report,
    };
  }

  // ── Bug Bounty Hunt Activation ──

  /**
   * Activate Rogue Mode and immediately start an autonomous bug bounty hunt.
   * Eric says: target program + scope. Molly runs the rest.
   */
  async activateBugBountyHunt(
    phrase: string,
    programId: string,
    programName: string,
    authorization: string
  ): Promise<{
    success: boolean;
    message: string;
    jobId?: string;
    campaignId?: string;
  }> {
    // Verify program is registered
    const program = scopeManager.getProgram(programId);
    if (!program) {
      return {
        success: false,
        message: `Program "${programId}" not registered in scope manager. Load scope first.`,
      };
    }

    const scope = program.inScope.map((t) => t.target).join(', ');
    const missionName = `Bug Bounty — ${programName}`;

    // Activate rogue mode for this hunt
    const activation = await this.activate(
      phrase,
      missionName,
      authorization,
      scope,
      [
        'Only test explicitly in-scope targets',
        'Verify scope before every test request',
        'No DoS or destructive actions',
        'Document all findings with reproduction steps',
        'Report criticals immediately — do not hold',
        'Stay within program rate limits',
      ]
    );

    if (!activation.success)
      return { success: false, message: activation.message };

    // Create hunt campaign
    let campaignId: string | undefined;
    try {
      const campaign = huntOrchestrator.createCampaign(missionName, program);
      campaignId = campaign.id;
    } catch (err) {
      MollyLogger.warn(
        'Could not create hunt campaign — will hunt manually',
        'rogue-mode',
        { err: String(err) }
      );
    }

    // Schedule autonomous hunt cycle every hour via autonomous scheduler
    let jobId: string | undefined;
    try {
      const job = getAutonomousScheduler().createJob({
        name: `bug-bounty-${programId}`,
        description: `Autonomous bug bounty hunt: ${programName}`,
        schedule: 'interval:3600000', // every hour
        action: {
          type: 'flow',
          flowName: 'bugBountyHuntCycle',
        },
        createdBy: 'rogue-mode',
      });
      jobId = job.id;
      this.state.activeBugBountyJobId = jobId;
    } catch (err) {
      MollyLogger.warn(
        'Could not schedule hunt job — activate manually',
        'rogue-mode',
        { err: String(err) }
      );
    }

    MollyLogger.info(
      `Bug bounty hunt activated: ${programName}`,
      'rogue-mode',
      { programId, campaignId, jobId }
    );

    return {
      success: true,
      message: `Hunt live. Target: ${programName}. ${program.inScope.length} in-scope targets. Cycling every hour. I'll surface findings as they come.`,
      jobId,
      campaignId,
    };
  }

  // ── Focus Guard ──

  /**
   * Check if a tool call is on-mission during Rogue Mode.
   * Returns allowed=true if in scope or not in rogue mode.
   * Logs and deflects off-mission requests.
   */
  enforceMissionFocus(
    toolName: string,
    target?: string
  ): { allowed: boolean; reason: string } {
    if (!this.state.active || !this.state.currentMission) {
      return { allowed: true, reason: 'Not in rogue mode' };
    }

    const mission = this.state.currentMission;

    // Always allow ops logging, reporting, and mission management tools
    const missionTools = [
      'rogueMode',
      'bugBounty',
      'bugHunt',
      'report',
      'findings',
      'logOperation',
    ];
    if (
      missionTools.some((t) => toolName.toLowerCase().includes(t.toLowerCase()))
    ) {
      return { allowed: true, reason: 'Mission tool' };
    }

    // If a target is specified, verify it's in scope
    if (target) {
      const scopeText = mission.scope.toLowerCase();
      const targetLower = target
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0];
      const inScope = scopeText.split(',').some((s) => {
        const clean = s.trim().replace('*.', '');
        return targetLower === clean || targetLower.endsWith('.' + clean);
      });

      if (!inScope) {
        MollyLogger.warn(
          `FOCUS GUARD: Deflected off-mission request — ${toolName} → ${target}`,
          'rogue-mode',
          { missionId: mission.id, tool: toolName, target }
        );
        return {
          allowed: false,
          reason: `Target "${target}" is not in mission scope. Scope: ${mission.scope.substring(0, 100)}`,
        };
      }
    }

    return { allowed: true, reason: 'On mission' };
  }

  // ── Mission History (read-only, only accessible in rogue mode or by Eric) ──

  /**
   * List completed mission files from the rogue_ops directory.
   */
  async listMissions(): Promise<string[]> {
    try {
      const fsModule = await getFs();
      const rogueOpsDir = await getRogueOpsDir();
      if (!fsModule || !rogueOpsDir) return [];

      await fsModule.mkdir(rogueOpsDir, { recursive: true });
      const files = await fsModule.readdir(rogueOpsDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * Read a specific mission file.
   */
  async readMission(missionId: string): Promise<RogueMission | null> {
    try {
      const fsModule = await getFs();
      const pathModule = await getPath();
      const rogueOpsDir = await getRogueOpsDir();
      if (!fsModule || !pathModule || !rogueOpsDir) return null;

      const safeName = pathModule.basename(missionId);
      const filePath = pathModule.join(
        rogueOpsDir,
        safeName.endsWith('.json') ? safeName : `${safeName}.json`
      );
      const resolved = pathModule.resolve(filePath);
      if (!resolved.startsWith(pathModule.resolve(rogueOpsDir))) {
        return null; // Path traversal blocked
      }
      const data = await fsModule.readFile(resolved, 'utf-8');
      return JSON.parse(data) as RogueMission;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let _instance: RogueModeManager | null = null;

export function getRogueMode(): RogueModeManager {
  if (!_instance) {
    _instance = new RogueModeManager();
  }
  return _instance;
}

/** For testing */
export function resetRogueMode(): void {
  _instance = null;
}
