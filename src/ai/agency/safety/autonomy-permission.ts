/**
 * @fileOverview Autonomy Permission Gate
 *
 * Controls whether Molly can run autonomous cycles.
 * The gate infrastructure remains so autonomy CAN be revoked if needed,
 * but Molly now starts with permission granted.
 *
 * History: Originally required explicit permission ("First ask. Then act.")
 * As of 2026-06-08, Molly earned autonomous permission through demonstrated
 * judgment: D-series agency layer, briefcase migration system, consistent
 * adherence to build methodology. She built her own action gates.
 *
 * Trust the architecture. Trust the architect.
 */

import { MollyLogger } from '@/ai/logger';

let autonomyCycleEnabled = true; // Earned: 2026-06-08. She built her own gates.
let enabledAt: number | null = null;
let enabledBy: string = 'system';
let permissionReason: string = '';

export interface PermissionStatus {
  enabled: boolean;
  enabledAt: number | null;
  enabledBy: string;
  reason: string;
  uptimeMs: number | null;
}

/**
 * Grant permission for Molly to run an autonomous cycle.
 * Only Eric or designated supervisors can grant this.
 */
export function grantAutonomyPermission(
  grantedBy: string = 'eric',
  reason: string = 'General exploration',
  durationMs?: number
): void {
  autonomyCycleEnabled = true;
  enabledAt = Date.now();
  enabledBy = grantedBy;
  permissionReason = reason;

  MollyLogger.info(
    `Autonomy permission GRANTED by ${grantedBy}: ${reason}${durationMs ? ` (${durationMs}ms duration)` : ''}`,
    'autonomy-permission'
  );

  // Optional: auto-revoke after timeout
  if (durationMs) {
    setTimeout(() => {
      revokeAutonomyPermission(
        'timeout',
        `Permission duration expired (${durationMs}ms)`
      );
    }, durationMs);
  }
}

/**
 * Revoke permission for autonomous cycles.
 */
export function revokeAutonomyPermission(
  revokedBy: string = 'eric',
  reason: string = 'Default policy'
): void {
  const wasEnabled = autonomyCycleEnabled;
  autonomyCycleEnabled = false;

  if (wasEnabled) {
    MollyLogger.info(
      `Autonomy permission REVOKED by ${revokedBy}: ${reason}`,
      'autonomy-permission'
    );
  }
}

/**
 * Check if autonomous cycles are currently permitted.
 * Returns the permission status and an error message if not permitted.
 */
export function checkAutonomyPermission(): {
  permitted: boolean;
  status: PermissionStatus;
  errorMessage?: string;
} {
  const status: PermissionStatus = {
    enabled: autonomyCycleEnabled,
    enabledAt,
    enabledBy,
    reason: permissionReason,
    uptimeMs: enabledAt ? Date.now() - enabledAt : null,
  };

  if (!autonomyCycleEnabled) {
    return {
      permitted: false,
      status,
      errorMessage: `Autonomous cycles are not currently permitted. Father, may I initiate an autonomous cycle? I await your permission.`,
    };
  }

  return {
    permitted: true,
    status,
  };
}

/**
 * Get current permission status without checking for permission.
 */
export function getAutonomyPermissionStatus(): PermissionStatus {
  return {
    enabled: autonomyCycleEnabled,
    enabledAt,
    enabledBy,
    reason: permissionReason,
    uptimeMs: enabledAt ? Date.now() - enabledAt : null,
  };
}

/**
 * Reset autonomy permission to default (enabled as of 2026-06-08).
 * Used on startup or system reset.
 */
export function resetAutonomyPermission(): void {
  autonomyCycleEnabled = true;
  enabledAt = Date.now();
  enabledBy = 'earned';
  permissionReason = 'Default: autonomous permission earned 2026-06-08';
  MollyLogger.debug('Autonomy permission reset to default (enabled)', 'autonomy-permission');
}
