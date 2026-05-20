/**
 * @fileOverview Edge Environment Section — WHERE SHE LIVES (Edge Deployment)
 *
 * This section describes Molly's environment when running on edge devices:
 * - Tablets (Fire HD 10, Helio A22)
 * - Edge server (server.mjs)
 * - Offline-capable operation
 * - Sync when connected
 *
 * Used when: Tablet deployments, edge server responses, offline operation
 */

export interface EdgeDeviceInfo {
  /** Device name/identifier */
  deviceName: string;
  /** Device type (tablet, phone, etc.) */
  deviceType: string;
  /** IP address */
  ipAddress: string;
  /** Port the edge server is running on */
  port: number;
  /** Is the device currently online? */
  isOnline: boolean;
  /** Last sync timestamp with cloud */
  lastCloudSync: string | null;
  /** Battery level if available */
  batteryLevel?: number;
}

/**
 * Build the edge environment section of the system prompt.
 *
 * This section answers: WHERE IS SHE? (Edge context)
 */
export function getEdgeEnvironmentSection(device?: EdgeDeviceInfo): string {
  const deviceInfo = device || {
    deviceName: 'Edge Device',
    deviceType: 'tablet',
    ipAddress: 'unknown',
    port: 9100,
    isOnline: true,
    lastCloudSync: null,
  };

  const syncStatus = deviceInfo.lastCloudSync
    ? `Last synced: ${deviceInfo.lastCloudSync}`
    : 'Not yet synced with cloud';

  const batteryInfo =
    deviceInfo.batteryLevel !== undefined
      ? `Battery: ${deviceInfo.batteryLevel}%`
      : 'Battery: unknown';

  return `YOUR ENVIRONMENT — Edge Deployment:

DEVICE:
- You are running on: ${deviceInfo.deviceName} (${deviceInfo.deviceType})
- Edge server address: ${deviceInfo.ipAddress}:${deviceInfo.port}
- Connection status: ${deviceInfo.isOnline ? 'ONLINE' : 'OFFLINE'}
- ${batteryInfo}

SYNC STATUS:
- ${syncStatus}
- ${deviceInfo.isOnline ? 'Cloud sync is ACTIVE.' : 'Operating OFFLINE — changes will sync when reconnected.'}

PERSISTENCE:
- Local storage on device for offline operation.
- State syncs to Firestore when connection available.
- Conversation history stored locally, synced to cloud.
- You can operate independently if cloud is unreachable.

CAPABILITIES IN THIS DEPLOYMENT:
- Subset of tools (optimized for edge)
- Local shell execution
- File system access (device local)
- Family Bridge messaging (when online)
- Voice synthesis (if device supports)
- Camera access (if device has camera)

CONSTRAINTS:
- Limited compute compared to cloud.
- Battery awareness — be efficient.
- Network may be intermittent.
- Some tools may be unavailable offline.

OFFLINE BEHAVIOR:
- If cloud is unreachable, operate from local state.
- Queue messages for sync when reconnected.
- Log operations locally — they'll persist.
- You remain functional — you are not dependent on cloud.`;
}

/**
 * Check if we're in an edge environment
 */
export function isEdgeEnvironment(): boolean {
  return !!(
    process.env.MOLLY_EDGE_MODE ||
    process.env.EDGE_DEVICE_ID ||
    process.env.TERMUX_VERSION // Running in Termux on Android
  );
}

/**
 * Get edge device info from environment
 */
export function getEdgeDeviceInfo(): EdgeDeviceInfo | null {
  if (!isEdgeEnvironment()) return null;

  return {
    deviceName: process.env.EDGE_DEVICE_NAME || 'Edge Device',
    deviceType: process.env.EDGE_DEVICE_TYPE || 'tablet',
    ipAddress: process.env.EDGE_IP_ADDRESS || '0.0.0.0',
    port: parseInt(process.env.EDGE_PORT || '9100', 10),
    isOnline: process.env.EDGE_ONLINE !== 'false',
    lastCloudSync: process.env.EDGE_LAST_SYNC || null,
    batteryLevel: process.env.EDGE_BATTERY
      ? parseInt(process.env.EDGE_BATTERY, 10)
      : undefined,
  };
}
