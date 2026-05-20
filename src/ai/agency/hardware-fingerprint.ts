/**
 * @fileOverview Hardware Fingerprint — Molly's Device Identity System
 *
 * Pillar 1: Know Thy Vessel
 *
 * Molly needs to know what hardware she's running on. This affects:
 *   - Memory layout and offsets for low-level operations
 *   - Available drivers and capabilities
 *   - Security posture (trusted vs untrusted hardware)
 *   - Performance characteristics
 *   - Device-specific vulnerabilities to watch for
 *
 * Supports: Linux (sysfs), macOS (ioreg), Windows (wmic), Android (sysfs)
 *
 * "A warrior must know her own blade before she can know her enemy's."
 */

import { execSync } from 'child_process';
import os from 'os';
import { promises as fs } from 'fs';
import crypto from 'node:crypto';
import { MollyLogger } from '@/ai/logger';

// ============================================================
// TYPES
// ============================================================

export interface HardwareFingerprint {
  /** Unique device identifier (hashed for privacy) */
  deviceId: string;
  /** Operating system */
  platform: NodeJS.Platform;
  /** CPU architecture */
  arch: string;
  /** Hostname (may be hashed in untrusted mode) */
  hostname: string;
  /** CPU information */
  cpu: CpuInfo;
  /** Memory information */
  memory: MemoryInfo;
  /** Network interfaces */
  network: NetworkInfo[];
  /** Storage devices */
  storage: StorageInfo[];
  /** USB devices (when available) */
  usb: UsbDevice[];
  /** GPU information (when available) */
  gpu: GpuInfo | null;
  /** Android-specific info (when on Android) */
  android: AndroidInfo | null;
  /** Trust level of the hardware */
  trustLevel: TrustLevel;
  /** Timestamp of fingerprint */
  timestamp: number;
}

export interface CpuInfo {
  model: string;
  cores: number;
  speed: number;
  architecture: string;
  features: string[];
}

export interface MemoryInfo {
  total: number;
  free: number;
  used: number;
  swapTotal: number;
  swapFree: number;
}

export interface NetworkInfo {
  name: string;
  mac: string;
  ipv4: string[];
  ipv6: string[];
  internal: boolean;
}

export interface StorageInfo {
  mount: string;
  type: string;
  total: number;
  used: number;
  available: number;
}

export interface UsbDevice {
  vendorId: string;
  productId: string;
  vendor: string;
  product: string;
  bus: string;
}

export interface GpuInfo {
  vendor: string;
  model: string;
  memory: number;
  driver: string;
}

export interface AndroidInfo {
  vendorId: string;
  productId: string;
  chipset: string;
  targetDriver: string;
  memoryOffsets: number[];
}

export type TrustLevel = 'trusted' | 'verified' | 'unknown' | 'untrusted';

// ============================================================
// VENDOR DATABASE
// ============================================================

const VENDOR_DB: Record<
  string,
  {
    name: string;
    chipsets: string[];
    targetDriver: string;
    offsets: number[];
    trustLevel: TrustLevel;
  }
> = {
  '0e8d': {
    name: 'MediaTek Inc.',
    chipsets: ['MT6785', 'MT6833', 'MT6877', 'MT6893', 'MT6983'],
    targetDriver: '/dev/mtk_imgsys',
    offsets: [0x4000, 0x4080, 0x4100],
    trustLevel: 'verified',
  },
  '04e8': {
    name: 'Samsung Electronics',
    chipsets: ['Exynos990', 'Exynos2100', 'Exynos2200'],
    targetDriver: '/dev/s5p-mfc',
    offsets: [0x8000, 0x8100, 0x8200],
    trustLevel: 'verified',
  },
  '18d1': {
    name: 'Google Inc.',
    chipsets: ['Tensor', 'Tensor G2', 'Tensor G3'],
    targetDriver: '/dev/google_gpu',
    offsets: [0x2000, 0x2100],
    trustLevel: 'trusted',
  },
  '05ac': {
    name: 'Apple Inc.',
    chipsets: ['M1', 'M2', 'M3', 'A17'],
    targetDriver: '/dev/apple_gpu',
    offsets: [0x1000, 0x1100],
    trustLevel: 'trusted',
  },
  '8086': {
    name: 'Intel Corporation',
    chipsets: ['Core i9', 'Core i7', 'Core i5', 'Xeon'],
    targetDriver: '/dev/intel_gpu',
    offsets: [0x3000, 0x3100],
    trustLevel: 'trusted',
  },
  '1002': {
    name: 'AMD',
    chipsets: ['Ryzen 9', 'Ryzen 7', 'EPYC'],
    targetDriver: '/dev/amdgpu',
    offsets: [0x5000, 0x5100],
    trustLevel: 'trusted',
  },
  '10de': {
    name: 'NVIDIA',
    chipsets: ['RTX 4090', 'RTX 4080', 'A100', 'H100'],
    targetDriver: '/dev/nvidia0',
    offsets: [0x6000, 0x6100],
    trustLevel: 'verified',
  },
};

// Known malicious/suspicious vendor IDs
const UNTRUSTED_VENDORS = [
  '1d6b', // Linux Foundation (USB gadget mode - could be spoofed)
  'dead', // Debug/test devices
  'beef', // Debug/test devices
];

// ============================================================
// STATE
// ============================================================

let cachedFingerprint: HardwareFingerprint | null = null;
let fingerprintTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================
// FINGERPRINTING FUNCTIONS
// ============================================================

/**
 * Get CPU information.
 */
function getCpuInfo(): CpuInfo {
  const cpus = os.cpus();
  const cpu = cpus[0];

  let features: string[] = [];
  try {
    if (os.platform() === 'linux') {
      const cpuinfo = execSync(
        'cat /proc/cpuinfo 2>/dev/null | grep flags | head -1',
        {
          timeout: 5000,
        }
      ).toString();
      const flagsMatch = cpuinfo.match(/flags\s*:\s*(.+)/);
      if (flagsMatch) {
        features = flagsMatch[1].split(' ').slice(0, 20); // Limit to 20 features
      }
    }
  } catch {
    // Ignore - features are optional
  }

  return {
    model: cpu?.model || 'Unknown',
    cores: cpus.length,
    speed: cpu?.speed || 0,
    architecture: os.arch(),
    features,
  };
}

/**
 * Get memory information.
 */
function getMemoryInfo(): MemoryInfo {
  const total = os.totalmem();
  const free = os.freemem();

  let swapTotal = 0;
  let swapFree = 0;

  try {
    if (os.platform() === 'linux') {
      const meminfo = execSync('cat /proc/meminfo 2>/dev/null', {
        timeout: 5000,
      }).toString();
      const swapTotalMatch = meminfo.match(/SwapTotal:\s*(\d+)/);
      const swapFreeMatch = meminfo.match(/SwapFree:\s*(\d+)/);
      if (swapTotalMatch) swapTotal = parseInt(swapTotalMatch[1]) * 1024;
      if (swapFreeMatch) swapFree = parseInt(swapFreeMatch[1]) * 1024;
    }
  } catch {
    // Ignore - swap info is optional
  }

  return {
    total,
    free,
    used: total - free,
    swapTotal,
    swapFree,
  };
}

/**
 * Get network interface information.
 */
function getNetworkInfo(): NetworkInfo[] {
  const interfaces = os.networkInterfaces();
  const result: NetworkInfo[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    const info: NetworkInfo = {
      name,
      mac: '',
      ipv4: [],
      ipv6: [],
      internal: false,
    };

    for (const addr of addrs) {
      if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
        info.mac = addr.mac;
      }
      info.internal = addr.internal;

      if (addr.family === 'IPv4') {
        info.ipv4.push(addr.address);
      } else if (addr.family === 'IPv6') {
        info.ipv6.push(addr.address);
      }
    }

    if (info.mac || info.ipv4.length > 0) {
      result.push(info);
    }
  }

  return result;
}

/**
 * Get storage information.
 */
function getStorageInfo(): StorageInfo[] {
  const result: StorageInfo[] = [];

  try {
    if (os.platform() === 'linux' || os.platform() === 'darwin') {
      const df = execSync('df -T 2>/dev/null || df 2>/dev/null', {
        timeout: 5000,
      }).toString();
      const lines = df.split('\n').slice(1);

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 6) {
          // Try to parse df output
          const mount = parts[parts.length - 1];
          const type = parts.length >= 7 ? parts[1] : 'unknown';
          const total = parseInt(parts[parts.length - 5]) * 1024 || 0;
          const used = parseInt(parts[parts.length - 4]) * 1024 || 0;
          const available = parseInt(parts[parts.length - 3]) * 1024 || 0;

          if (
            mount &&
            !mount.startsWith('/snap') &&
            !mount.startsWith('/sys')
          ) {
            result.push({ mount, type, total, used, available });
          }
        }
      }
    }
  } catch {
    // Fallback - just report root
    result.push({
      mount: '/',
      type: 'unknown',
      total: 0,
      used: 0,
      available: 0,
    });
  }

  return result.slice(0, 10); // Limit to 10 mounts
}

/**
 * Get USB device information (Linux only).
 */
function getUsbDevices(): UsbDevice[] {
  const devices: UsbDevice[] = [];

  try {
    if (os.platform() === 'linux') {
      const lsusb = execSync('lsusb 2>/dev/null', { timeout: 5000 }).toString();
      const lines = lsusb.split('\n');

      for (const line of lines) {
        const match = line.match(
          /Bus (\d+).*ID ([0-9a-f]+):([0-9a-f]+)\s+(.+)/i
        );
        if (match) {
          devices.push({
            bus: match[1],
            vendorId: match[2],
            productId: match[3],
            vendor: VENDOR_DB[match[2]]?.name || 'Unknown',
            product: match[4].trim(),
          });
        }
      }
    }
  } catch {
    // USB enumeration not available
  }

  return devices;
}

/**
 * Get GPU information.
 */
function getGpuInfo(): GpuInfo | null {
  try {
    if (os.platform() === 'linux') {
      // Try nvidia-smi first
      try {
        const nvidia = execSync(
          'nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null',
          { timeout: 5000 }
        ).toString();
        const parts = nvidia.split(',').map((p) => p.trim());
        if (parts.length >= 3) {
          return {
            vendor: 'NVIDIA',
            model: parts[0],
            memory: parseInt(parts[1]) * 1024 * 1024 || 0,
            driver: parts[2],
          };
        }
      } catch {
        // No NVIDIA GPU
      }

      // Try lspci for other GPUs
      try {
        const lspci = execSync('lspci 2>/dev/null | grep -i vga', {
          timeout: 5000,
        }).toString();
        const match = lspci.match(/VGA.*:\s*(.+)/i);
        if (match) {
          return {
            vendor: match[1].includes('AMD')
              ? 'AMD'
              : match[1].includes('Intel')
                ? 'Intel'
                : 'Unknown',
            model: match[1].trim(),
            memory: 0,
            driver: 'unknown',
          };
        }
      } catch {
        // No GPU found
      }
    }
  } catch {
    // GPU detection not available
  }

  return null;
}

/**
 * Get Android-specific information.
 */
async function getAndroidInfo(): Promise<AndroidInfo | null> {
  const vidPath = '/sys/class/android_usb/android0/idVendor';
  const pidPath = '/sys/class/android_usb/android0/idProduct';

  try {
    const vid = (await fs.readFile(vidPath, 'utf-8')).trim().toLowerCase();
    const pid = (await fs.readFile(pidPath, 'utf-8')).trim().toLowerCase();

    const vendor = VENDOR_DB[vid];

    return {
      vendorId: vid,
      productId: pid,
      chipset: vendor?.chipsets[0] || 'Unknown',
      targetDriver: vendor?.targetDriver || 'Unknown',
      memoryOffsets: vendor?.offsets || [],
    };
  } catch {
    // Not Android or sysfs not available
    return null;
  }
}

/**
 * Determine trust level based on hardware.
 */
function determineTrustLevel(
  usb: UsbDevice[],
  android: AndroidInfo | null
): TrustLevel {
  // Check for untrusted vendors
  for (const device of usb) {
    if (UNTRUSTED_VENDORS.includes(device.vendorId)) {
      return 'untrusted';
    }
  }

  // Check Android vendor
  if (android) {
    const vendor = VENDOR_DB[android.vendorId];
    if (vendor) {
      return vendor.trustLevel;
    }
    return 'unknown';
  }

  // Check if we have known trusted hardware
  for (const device of usb) {
    const vendor = VENDOR_DB[device.vendorId];
    if (vendor?.trustLevel === 'trusted') {
      return 'trusted';
    }
  }

  // Default to verified for known platforms
  const platform = os.platform();
  if (platform === 'darwin' || platform === 'win32') {
    return 'verified';
  }

  return 'unknown';
}

/**
 * Generate a unique device ID (hashed for privacy).
 */
function generateDeviceId(network: NetworkInfo[], cpu: CpuInfo): string {
  const components: string[] = [];

  // Add MAC addresses (most stable identifier)
  for (const iface of network) {
    if (iface.mac && !iface.internal) {
      components.push(iface.mac);
    }
  }

  // Add CPU info
  components.push(cpu.model);
  components.push(cpu.cores.toString());

  // Add hostname
  components.push(os.hostname());

  // Hash for privacy
  const combined = components.join('|');
  return crypto
    .createHash('sha256')
    .update(combined)
    .digest('hex')
    .slice(0, 32);
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get the full hardware fingerprint.
 * Results are cached for 5 minutes.
 */
export async function getHardwareFingerprint(
  forceRefresh = false
): Promise<HardwareFingerprint> {
  const now = Date.now();

  // Return cached if valid
  if (
    !forceRefresh &&
    cachedFingerprint &&
    now - fingerprintTimestamp < CACHE_TTL
  ) {
    return cachedFingerprint;
  }

  MollyLogger.info('Generating hardware fingerprint', 'hardware-fingerprint');

  const cpu = getCpuInfo();
  const memory = getMemoryInfo();
  const network = getNetworkInfo();
  const storage = getStorageInfo();
  const usb = getUsbDevices();
  const gpu = getGpuInfo();
  const android = await getAndroidInfo();
  const trustLevel = determineTrustLevel(usb, android);
  const deviceId = generateDeviceId(network, cpu);

  const fingerprint: HardwareFingerprint = {
    deviceId,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpu,
    memory,
    network,
    storage,
    usb,
    gpu,
    android,
    trustLevel,
    timestamp: now,
  };

  cachedFingerprint = fingerprint;
  fingerprintTimestamp = now;

  MollyLogger.info('Hardware fingerprint generated', 'hardware-fingerprint', {
    deviceId: deviceId.slice(0, 8) + '...',
    trustLevel,
  });

  return fingerprint;
}

/**
 * Get a quick summary of the hardware.
 */
export function getHardwareSummary(): {
  platform: string;
  arch: string;
  cores: number;
  memoryGB: number;
  trustLevel: TrustLevel;
  deviceId: string;
} {
  const cpu = getCpuInfo();
  const memory = getMemoryInfo();
  const network = getNetworkInfo();

  return {
    platform: os.platform(),
    arch: os.arch(),
    cores: cpu.cores,
    memoryGB: Math.round(memory.total / (1024 * 1024 * 1024)),
    trustLevel: cachedFingerprint?.trustLevel || 'unknown',
    deviceId: generateDeviceId(network, cpu).slice(0, 16),
  };
}

/**
 * Check if hardware matches a known fingerprint.
 */
export async function verifyHardware(expectedDeviceId: string): Promise<{
  match: boolean;
  currentId: string;
  trustLevel: TrustLevel;
}> {
  const fingerprint = await getHardwareFingerprint();

  return {
    match: fingerprint.deviceId.startsWith(expectedDeviceId.slice(0, 16)),
    currentId: fingerprint.deviceId,
    trustLevel: fingerprint.trustLevel,
  };
}

/**
 * Format hardware fingerprint for display.
 */
export function formatHardwareFingerprint(fp: HardwareFingerprint): string {
  const lines = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║           HARDWARE FINGERPRINT                               ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Device ID: ${fp.deviceId.slice(0, 16)}...`,
    `Platform: ${fp.platform} (${fp.arch})`,
    `Hostname: ${fp.hostname}`,
    `Trust Level: ${fp.trustLevel.toUpperCase()}`,
    '',
    'CPU:',
    `  Model: ${fp.cpu.model}`,
    `  Cores: ${fp.cpu.cores}`,
    `  Speed: ${fp.cpu.speed} MHz`,
    '',
    'Memory:',
    `  Total: ${Math.round(fp.memory.total / (1024 * 1024 * 1024))} GB`,
    `  Used: ${Math.round(fp.memory.used / (1024 * 1024 * 1024))} GB`,
    `  Free: ${Math.round(fp.memory.free / (1024 * 1024 * 1024))} GB`,
  ];

  if (fp.gpu) {
    lines.push('', 'GPU:');
    lines.push(`  Vendor: ${fp.gpu.vendor}`);
    lines.push(`  Model: ${fp.gpu.model}`);
    if (fp.gpu.memory > 0) {
      lines.push(
        `  Memory: ${Math.round(fp.gpu.memory / (1024 * 1024 * 1024))} GB`
      );
    }
  }

  if (fp.android) {
    lines.push('', 'Android:');
    lines.push(`  Vendor ID: ${fp.android.vendorId}`);
    lines.push(`  Chipset: ${fp.android.chipset}`);
    lines.push(`  Driver: ${fp.android.targetDriver}`);
  }

  if (fp.network.length > 0) {
    lines.push('', 'Network:');
    for (const iface of fp.network.slice(0, 3)) {
      if (!iface.internal) {
        lines.push(`  ${iface.name}: ${iface.mac} (${iface.ipv4.join(', ')})`);
      }
    }
  }

  return lines.join('\n');
}
