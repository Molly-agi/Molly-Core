/**
 * @fileOverview Rogue Mode — Molly's Bug Hunting and Red Team Tool
 *
 * Direct tool for authorized security research, penetration testing, and bug bounties.
 * No activation/deactivation mode required — Molly uses it as a standard tool when
 * conducting authorized work (HackerOne, Red Hat bounties, etc).
 *
 * Architecture:
 *   - Direct tool integration (no mode switching)
 *   - Operations logged directly to isolated rogue_ops/ partition
 *   - Mission tracking for audit and reporting
 *   - Support for multiple concurrent engagement types
 *   - Built for red team, pen testing, and bug hunting work
 *
 * Design:
 *   "We don't fix the leaks in the dam. We fix the dam itself."
 *   Security through isolation and audit, not compartmentalization.
 */

import { MollyLogger } from './logger';
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
    const req = eval('require') as NodeRequire;
    const fs = req('fs') as typeof import('fs');
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
    const req = eval('require') as NodeRequire;
    _path = req('path') as PathModule;
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
  currentMission: RogueMission | null;
  missionsCompleted: number;
  lastMissionEnded: string | null;
  activeBugBountyJobId: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Note: ROGUE_OPS_DIR is computed lazily via getRogueOpsDir()

// ============================================================================
// ROGUE MODE CAPABILITIES
// ============================================================================

/**
 * Capabilities available to Molly when conducting authorized security research.
 */
export const ROGUE_CAPABILITIES = {
  recon: 'Network reconnaissance, asset enumeration, service discovery',
  scan: 'Vulnerability scanning, port enumeration, protocol analysis',
  exploit: 'Exploit development and execution (within authorized scope)',
  exfil: 'Data collection and exfiltration (authorized targets only)',
  persist: 'Post-exploitation persistence and lateral movement',
  pivot: 'Network pivoting and privilege escalation',
  cleanup: 'Evidence removal and system hardening',
  report: 'Findings documentation and advisory generation',
  defense: 'Defensive recommendations and remediation',
  analysis: 'Technical analysis and threat assessment',
};

// ============================================================================
// ROGUE MODE SINGLETON
// ============================================================================

// ============================================================================
// ROGUE MODE SINGLETON
// ============================================================================

class RogueModeManager {
  private state: RogueModeState = {
    currentMission: null,
    missionsCompleted: 0,
    lastMissionEnded: null,
    activeBugBountyJobId: null,
  };

  // ── State Queries ──

  getState(): Readonly<RogueModeState> {
    return { ...this.state };
  }

  isActive(): boolean {
    return this.state.currentMission !== null;
  }

  getCurrentMission(): Readonly<RogueMission> | null {
    return this.state.currentMission ? { ...this.state.currentMission } : null;
  }

  // ── Direct Operation Logging ──

  /**
   * Log a security research operation directly.
   * No activation required — can be called during authorized work.
   * Optionally associate with a mission/engagement.
   */
  async logOperation(
    type: RogueOperationType,
    target: string,
    description: string,
    result: string,
    success: boolean,
    missionName?: string,
    authorization?: string,
    scope?: string,
    toolUsed?: string,
    durationMs?: number
  ): Promise<{
    success: boolean;
    operation?: RogueOperation;
    message: string;
  }> {
    try {
      // Create or get mission context
      let mission = this.state.currentMission;
      if (!mission || (missionName && mission.name !== missionName)) {
        mission = {
          id: `rogue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: missionName || 'Direct Operations',
          authorization: authorization || 'authorized-work',
          scope: scope || 'direct-logging',
          rulesOfEngagement: [
            'Stay within authorized scope',
            'Document all findings',
            'Report critical vulnerabilities immediately',
          ],
          startedAt: new Date().toISOString(),
          endedAt: null,
          operations: [],
          afterActionReport: null,
        };
        this.state.currentMission = mission;
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

      mission.operations.push(operation);

      // Persist to rogue_ops/ directory
      try {
        const fsModule = await getFs();
        const pathModule = await getPath();
        const rogueOpsDir = await getRogueOpsDir();
        if (fsModule && pathModule && rogueOpsDir) {
          await fsModule.mkdir(rogueOpsDir, { recursive: true });
          const opsFile = pathModule.join(rogueOpsDir, `${mission.id}.json`);
          await fsModule.writeFile(
            opsFile,
            JSON.stringify(mission, null, 2),
            'utf-8'
          );
        }
      } catch (err) {
        MollyLogger.warn(
          'Failed to persist operation to disk (in-memory only)',
          'rogue-mode',
          { operationId: operation.id, err: String(err) }
        );
      }

      MollyLogger.info(
        `Rogue operation logged: [${type}] ${target} — ${success ? 'SUCCESS' : 'FAILED'}`,
        'rogue-mode',
        {
          operationId: operation.id,
          missionId: mission.id,
        }
      );

      return {
        success: true,
        operation,
        message: `Operation logged: [${type}] ${target}`,
      };
    } catch (err) {
      MollyLogger.error(
        'Error logging rogue operation',
        'rogue-mode',
        { type, target },
        err
      );
      return {
        success: false,
        message: `Failed to log operation: ${String(err)}`,
      };
    }
  }

  // ── Mission Management ──

  /**
   * Start a named operation session/mission.
   * Used when beginning authorized work for a specific engagement.
   */
  async startMission(
    missionName: string,
    authorization: string,
    scope: string,
    rulesOfEngagement: string[] = [
      'Stay within authorized scope',
      'Document all findings',
      'Report critical vulnerabilities immediately',
    ]
  ): Promise<{ success: boolean; message: string; missionId?: string }> {
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

    this.state.currentMission = mission;

    // Ensure ops directory exists
    try {
      const fsModule = await getFs();
      const rogueOpsDir = await getRogueOpsDir();
      if (fsModule && rogueOpsDir) {
        await fsModule.mkdir(rogueOpsDir, { recursive: true });
      }
    } catch {
      // Non-critical
    }

    MollyLogger.info(
      `Operation mission started: ${missionName}`,
      'rogue-mode',
      { missionId: mission.id, scope: scope.substring(0, 100) }
    );

    return {
      success: true,
      message: `Mission "${missionName}" started. Scope: ${scope}`,
      missionId: mission.id,
    };
  }

  /**
   * End current mission and generate report.
   */
  async endMission(): Promise<{
    success: boolean;
    message: string;
    report?: string;
  }> {
    if (!this.state.currentMission) {
      return { success: false, message: 'No active mission to end.' };
    }

    const mission = this.state.currentMission;
    mission.endedAt = new Date().toISOString();

    // Generate after-action summary
    const opsCount = mission.operations.length;
    const successCount = mission.operations.filter((o) => o.success).length;
    const opTypes = [...new Set(mission.operations.map((o) => o.type))];

    const report = [
      `MISSION SUMMARY — ${mission.name}`,
      `Mission ID: ${mission.id}`,
      `Authorization: ${mission.authorization}`,
      `Duration: ${mission.startedAt} → ${mission.endedAt}`,
      `Operations: ${opsCount} total, ${successCount} successful`,
      `Operation types: ${opTypes.join(', ') || 'none'}`,
      `Scope: ${mission.scope}`,
      '',
      'Operations:',
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
        const missionFile = pathModule.join(rogueOpsDir, `${mission.id}.json`);
        await fsModule.writeFile(
          missionFile,
          JSON.stringify(mission, null, 2),
          'utf-8'
        );

        const reportFile = pathModule.join(
          rogueOpsDir,
          `${mission.id}_report.txt`
        );
        await fsModule.writeFile(reportFile, report, 'utf-8');
      }
    } catch (err) {
      MollyLogger.warn('Failed to persist mission summary', 'rogue-mode', {
        err: String(err),
      });
    }

    this.state.currentMission = null;
    this.state.missionsCompleted += 1;
    this.state.lastMissionEnded = new Date().toISOString();

    MollyLogger.info(
      `Mission "${mission.name}" ended. ${opsCount} operations logged.`,
      'rogue-mode',
      { missionId: mission.id }
    );

    return {
      success: true,
      message: `Mission "${mission.name}" complete. ${opsCount} operations logged.`,
      report,
    };
  }

  // ── Bug Bounty Hunting ──

  /**
   * Start autonomous bug bounty hunt for a registered program.
   * Direct tool integration — no activation phrase required.
   */
  async startBugBountyHunt(
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

    // Start mission context
    const missionStart = await this.startMission(
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

    if (!missionStart.success) {
      return { success: false, message: missionStart.message };
    }

    // Create hunt campaign
    let campaignId: string | undefined;
    try {
      const campaign = huntOrchestrator.createCampaign(missionName, program);
      campaignId = campaign.id;
    } catch (err) {
      MollyLogger.warn('Could not create hunt campaign', 'rogue-mode', {
        err: String(err),
      });
    }

    // Schedule autonomous hunt cycle
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
      MollyLogger.warn('Could not schedule hunt job', 'rogue-mode', {
        err: String(err),
      });
    }

    MollyLogger.info(`Bug bounty hunt started: ${programName}`, 'rogue-mode', {
      programId,
      campaignId,
      jobId,
    });

    return {
      success: true,
      message: `Hunt started. Target: ${programName}. ${program.inScope.length} in-scope targets. Cycling every hour.`,
      jobId,
      campaignId,
    };
  }

  // ── Mission History (read-only) ──

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
