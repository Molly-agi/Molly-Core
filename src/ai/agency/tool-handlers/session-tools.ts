/**
 * @fileOverview Session Tool Handlers
 *
 * Extracted from tool-executor.ts for cleaner modular organization.
 * Handles protocol10 (session anchoring) and handoff (session sealing).
 */

import {
  anchorSession,
  verifyAnchor,
  readAnchor,
  clearAnchor,
  formatAnchorStatus,
  anchorExists,
  getAnchorAge,
} from '../safety/protocol-10';
import {
  sealSession,
  quickSealEvolution,
  applySovereignEncryption,
  decryptSovereignData,
  listEvolutionLogs,
  listAssetManifests,
  readAssetManifest,
  readEvolutionLog,
  formatHandoffStatus,
  isSealed,
} from '../core/handoff-seal';
import type { ToolResult, ToolHandlerMap } from './types';

async function handleProtocol10(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  if (action === 'anchor') {
    const snapshot = (params.snapshot as Record<string, unknown>) || {};
    try {
      const seal = await anchorSession(snapshot);
      return {
        success: true,
        output: [
          'Session anchored successfully',
          `Identity: ${seal.identity}`,
          `Methodology: ${seal.methodology}`,
          `Hash: ${seal.anchorHash.slice(0, 32)}...`,
          `Time: ${seal.date}`,
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: `Anchor failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'verify') {
    try {
      const result = await verifyAnchor();
      return {
        success: result.valid,
        output: result.valid
          ? `${result.message}\nIdentity: ${result.session?.identity}`
          : `${result.message}\nIssues: ${result.issues.join(', ')}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Verify failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = await formatAnchorStatus();
      return { success: true, output: status };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'read') {
    try {
      const anchor = await readAnchor();
      if (!anchor) {
        return { success: false, output: 'No anchor file found' };
      }
      return {
        success: true,
        output: [
          `Identity: ${anchor.identity}`,
          `Methodology: ${anchor.methodology}`,
          `Anchored: ${anchor.date}`,
          `Version: ${anchor.version}`,
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: `Read failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'clear') {
    const cleared = await clearAnchor();
    return {
      success: cleared,
      output: cleared ? 'Anchor cleared' : 'Failed to clear anchor',
    };
  }

  if (action === 'exists') {
    const exists = await anchorExists();
    return {
      success: true,
      output: exists ? 'Anchor exists' : 'No anchor file',
    };
  }

  if (action === 'age') {
    const age = getAnchorAge();
    if (age === null) {
      return { success: false, output: 'No anchored session' };
    }
    const ageStr =
      age > 86400000
        ? `${Math.floor(age / 86400000)} days`
        : age > 3600000
          ? `${Math.floor(age / 3600000)} hours`
          : `${Math.floor(age / 60000)} minutes`;
    return { success: true, output: `Anchor age: ${ageStr}` };
  }

  return {
    success: false,
    output:
      'Unknown action. Use: anchor, verify, status, read, clear, exists, age',
  };
}

async function handleHandoff(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  if (action === 'seal') {
    const evolutionData = (params.evolution as Record<string, unknown>) || {
      observations: [],
    };
    const lootData = (params.loot as Record<string, unknown>) || {
      resources: [],
      totalEnergy: 0,
    };
    const notes = params.notes as string | undefined;

    try {
      const result = await sealSession(
        evolutionData as Parameters<typeof sealSession>[0],
        lootData as Parameters<typeof sealSession>[1],
        [],
        [],
        notes
      );

      if (result.status === 'SEALED') {
        return {
          success: true,
          output: [
            'Session sealed successfully',
            `Evolution: ${result.evolutionLog}`,
            `Assets: ${result.assetManifest}`,
            `Hash: ${result.evolutionHash?.slice(0, 16)}...`,
          ].join('\n'),
        };
      } else {
        return {
          success: false,
          output: `Seal ${result.status}: ${result.reason}`,
        };
      }
    } catch (err) {
      return {
        success: false,
        output: `Seal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'quick') {
    const observations = (params.observations as string[]) || [];
    const notes = params.notes as string | undefined;

    try {
      const result = await quickSealEvolution(observations, notes);
      return {
        success: result.success,
        output: result.success
          ? `Quick seal saved: ${result.path}`
          : `Quick seal failed: ${result.error}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Quick seal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = await formatHandoffStatus();
      return { success: true, output: status };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'list') {
    const type = params.type as string;
    try {
      if (type === 'assets') {
        const manifests = await listAssetManifests();
        return {
          success: true,
          output:
            manifests.length > 0
              ? `Asset manifests (${manifests.length}):\n${manifests.slice(0, 10).join('\n')}`
              : 'No asset manifests',
        };
      }
      const logs = await listEvolutionLogs();
      return {
        success: true,
        output:
          logs.length > 0
            ? `Evolution logs (${logs.length}):\n${logs.slice(0, 10).join('\n')}`
            : 'No evolution logs',
      };
    } catch (err) {
      return {
        success: false,
        output: `List failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'read') {
    const filename = params.filename as string;
    const type = params.type as string;

    if (!filename) {
      return { success: false, output: 'Filename required' };
    }

    try {
      const data =
        type === 'asset'
          ? await readAssetManifest(filename)
          : await readEvolutionLog(filename);

      if (!data) {
        return {
          success: false,
          output: 'File not found or decryption failed',
        };
      }

      return {
        success: true,
        output: JSON.stringify(data, null, 2).slice(0, 2000),
      };
    } catch (err) {
      return {
        success: false,
        output: `Read failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  if (action === 'encrypt') {
    const data = params.data as unknown;
    if (!data) {
      return { success: false, output: 'Data required for encryption' };
    }
    const envelope = applySovereignEncryption(data);
    return {
      success: true,
      output: `Encrypted at ${envelope.sealedAt}\nChecksum: ${envelope.verificationTag.slice(0, 16)}...`,
    };
  }

  if (action === 'decrypt') {
    const envelope = params.envelope as Parameters<
      typeof decryptSovereignData
    >[0];
    if (!envelope) {
      return { success: false, output: 'Sealed envelope required' };
    }
    const decrypted = decryptSovereignData(envelope);
    if (!decrypted) {
      return {
        success: false,
        output: 'Decryption failed - verification tag mismatch',
      };
    }
    return {
      success: true,
      output: `Decrypted: ${JSON.stringify(decrypted).slice(0, 500)}`,
    };
  }

  if (action === 'sealed') {
    return {
      success: true,
      output: isSealed() ? 'Session is sealed' : 'Session not sealed',
    };
  }

  return {
    success: false,
    output:
      'Unknown action. Use: seal, quick, status, list, read, encrypt, decrypt, sealed',
  };
}

export const sessionToolHandlers: ToolHandlerMap = {
  protocol10: handleProtocol10,
  handoff: handleHandoff,
};
