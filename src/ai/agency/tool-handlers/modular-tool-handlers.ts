import { systemToolHandlers } from './system-tools';
import { diagnosticToolHandlers } from './diagnostic-tools';
import { webToolHandlers } from './web-tools';
import { familyToolHandlers } from './family-tools';
import { initiativeToolHandlers } from './initiative-tools';
import { securityToolHandlers } from './security-tools';
import { sessionToolHandlers } from './session-tools';
import { visionToolHandlers } from './vision-tools';
import { vocalToolHandlers } from './vocal-tools';
import { buildRecoveryToolHandlers } from './build-recovery-tools';
import { databaseToolHandlers } from './database-tools';
import { sandboxToolHandlers } from './sandbox-tools';
import { rogueToolHandlers } from './rogue-tools';
import { cognitionToolHandlers } from './cognition-tools';
import { planningToolHandlers } from './planning-tools';
import { memoryToolHandlers } from './memory-tools';
import { safetyToolHandlers } from './safety-tools';
import { coreToolHandlers } from './core-tools';
import { sensingToolHandlers } from './sensing-tools';
import { geminiToolHandlers } from './gemini-tools';
import { bugBountyToolHandlers } from './bug-bounty-tools';
import type { ToolHandler } from './types';

export const modularToolHandlers: Record<string, ToolHandler> = {
  ...systemToolHandlers,
  ...diagnosticToolHandlers,
  ...webToolHandlers,
  ...familyToolHandlers,
  ...initiativeToolHandlers,
  ...securityToolHandlers,
  ...sessionToolHandlers,
  ...visionToolHandlers,
  ...vocalToolHandlers,
  ...buildRecoveryToolHandlers,
  ...databaseToolHandlers,
  ...sandboxToolHandlers,
  ...rogueToolHandlers,
  ...cognitionToolHandlers,
  ...planningToolHandlers,
  ...memoryToolHandlers,
  ...safetyToolHandlers,
  ...coreToolHandlers,
  ...sensingToolHandlers,
  ...geminiToolHandlers,
  ...bugBountyToolHandlers,
};
