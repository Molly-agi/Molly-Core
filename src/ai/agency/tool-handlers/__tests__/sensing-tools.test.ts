/**
 * @fileOverview Tests for sensing tool handlers (wifiSensing, securityPerimeter).
 */

const mockSensorStart = jest.fn().mockResolvedValue(undefined);
const mockSensorStop = jest.fn().mockResolvedValue(undefined);
const mockGetConfig = jest.fn().mockReturnValue({ mode: 'simulation' });
const mockGetStats = jest.fn().mockReturnValue({ mode: 'simulation', isRunning: false, calibrated: false, readingsCollected: 0 });
const mockGetPresenceState = jest.fn().mockReturnValue({ detected: false, confidence: 0, estimatedCount: 0, movement: false });
const mockCalibrate = jest.fn().mockResolvedValue({ baselineRssi: -60.5, baselineNoise: -90.2, rssiThreshold: 0.35 });
const mockGetConnectedDevices = jest.fn().mockReturnValue([]);
const mockGetUnknownDevices = jest.fn().mockReturnValue([]);
const mockGetBluetoothDevices = jest.fn().mockReturnValue([]);
const mockGetNearbyNetworks = jest.fn().mockReturnValue([]);
const mockGetReadings = jest.fn().mockReturnValue([]);
const mockRegisterKnownDevice = jest.fn();
const mockIsActive = jest.fn().mockReturnValue(false);

const mockSensor = {
  start: mockSensorStart, stop: mockSensorStop, getConfig: mockGetConfig,
  getStats: mockGetStats, getPresenceState: mockGetPresenceState, calibrate: mockCalibrate,
  getConnectedDevices: mockGetConnectedDevices, getUnknownDevices: mockGetUnknownDevices,
  getBluetoothDevices: mockGetBluetoothDevices, getNearbyNetworks: mockGetNearbyNetworks,
  getReadings: mockGetReadings, registerKnownDevice: mockRegisterKnownDevice, isActive: mockIsActive,
};

const mockGetWiFiSensor = jest.fn().mockReturnValue(mockSensor);
const mockResetWiFiSensor = jest.fn();
const mockCheckPresence = jest.fn().mockResolvedValue({ detected: false, confidence: 0, estimatedCount: 0, movement: false });
const mockFormatPresenceState = jest.fn().mockReturnValue('Presence: None');

jest.mock('@/ai/sensing/wifi-csi-sensing', () => ({
  getWiFiSensor: (...args: unknown[]) => mockGetWiFiSensor(...args),
  resetWiFiSensor: (...args: unknown[]) => mockResetWiFiSensor(...args),
  checkPresence: (...args: unknown[]) => mockCheckPresence(...args),
  formatPresenceState: (...args: unknown[]) => mockFormatPresenceState(...args),
}));

import { sensingToolHandlers } from '../sensing-tools';

const handleWifi = sensingToolHandlers.wifiSensing;
const handlePerimeter = sensingToolHandlers.securityPerimeter;

describe('sensing-tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWiFiSensor.mockReturnValue(mockSensor);
    mockSensorStart.mockResolvedValue(undefined);
    mockSensorStop.mockResolvedValue(undefined);
    mockGetConfig.mockReturnValue({ mode: 'simulation' });
    mockGetStats.mockReturnValue({ mode: 'simulation', isRunning: false, calibrated: false, readingsCollected: 0 });
    mockGetPresenceState.mockReturnValue({ detected: false, confidence: 0, estimatedCount: 0, movement: false });
    mockGetConnectedDevices.mockReturnValue([]);
    mockGetUnknownDevices.mockReturnValue([]);
    mockGetBluetoothDevices.mockReturnValue([]);
    mockGetNearbyNetworks.mockReturnValue([]);
    mockGetReadings.mockReturnValue([]);
    mockIsActive.mockReturnValue(false);
    mockCalibrate.mockResolvedValue({ baselineRssi: -60.5, baselineNoise: -90.2, rssiThreshold: 0.35 });
    mockCheckPresence.mockResolvedValue({ detected: false, confidence: 0, estimatedCount: 0, movement: false });
    mockFormatPresenceState.mockReturnValue('Presence: None');
  });

  describe('wifiSensing', () => {
    it('returns error for unknown action', async () => {
      const result = await handleWifi({ action: 'badAction' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown wifiSensing action');
    });
    it('start: starts sensor in simulation mode', async () => {
      const result = await handleWifi({ action: 'start' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('WiFi sensing started');
      expect(mockSensorStart).toHaveBeenCalled();
    });
    it('start: uses provided mode and sensitivity', async () => {
      const result = await handleWifi({ action: 'start', mode: 'passive', sensitivity: 0.8, sampleRate: 20 });
      expect(result.success).toBe(true);
    });
    it('start: configures router when routerIp provided', async () => {
      const result = await handleWifi({ action: 'start', routerIp: '192.168.1.1', routerUsername: 'admin', routerPassword: 'pass', routerType: 'asus' });
      expect(result.success).toBe(true);
      expect(mockGetWiFiSensor).toHaveBeenCalledWith(expect.objectContaining({ mode: 'router' }));
    });
    it('start: accepts knownDevices list', async () => {
      const result = await handleWifi({ action: 'start', knownDevices: ['AA:BB:CC:DD:EE:FF'] });
      expect(result.success).toBe(true);
    });
    it('stop: stops the sensor', async () => {
      const result = await handleWifi({ action: 'stop' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('stopped');
      expect(mockSensorStop).toHaveBeenCalled();
    });
    it('status: returns sensor statistics', async () => {
      mockGetStats.mockReturnValue({ mode: 'simulation', isRunning: true, calibrated: true, readingsCollected: 100 });
      mockGetPresenceState.mockReturnValue({ detected: true, confidence: 0.85, estimatedCount: 2, movement: true });
      const result = await handleWifi({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Mode');
    });
    it('presence: returns presence state', async () => {
      mockFormatPresenceState.mockReturnValue('Presence: 1 person detected');
      const result = await handleWifi({ action: 'presence' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('detected');
    });
    it('calibrate: runs calibration and returns results', async () => {
      const result = await handleWifi({ action: 'calibrate' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Calibration complete');
      expect(result.output).toContain('-60.5');
    });
    it('devices: returns empty message when no devices', async () => {
      const result = await handleWifi({ action: 'devices' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('No devices detected');
    });
    it('devices: returns formatted device list', async () => {
      mockGetConnectedDevices.mockReturnValue([{ mac: 'AA:BB:CC:DD:EE:FF', name: 'Eric-Phone', hostname: 'eric-phone', ip: '192.168.1.50', rssi: -55, connection: '5GHz', deviceType: 'mobile', vendor: 'Samsung', isKnown: true }]);
      const result = await handleWifi({ action: 'devices' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('AA:BB:CC:DD:EE:FF');
    });
    it('unknownDevices: returns empty message when none found', async () => {
      const result = await handleWifi({ action: 'unknownDevices' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('No unknown devices');
    });
    it('unknownDevices: returns formatted unknown devices', async () => {
      mockGetUnknownDevices.mockReturnValue([{ mac: 'FF:EE:DD:CC:BB:AA', name: null, hostname: 'unknown', ip: '192.168.1.200', rssi: -70, connection: '2.4GHz', vendor: null, firstSeen: Date.now() - 60000 }]);
      const result = await handleWifi({ action: 'unknownDevices' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('FF:EE:DD:CC:BB:AA');
    });
    it('registerDevice: returns error when mac missing', async () => {
      const result = await handleWifi({ action: 'registerDevice' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('MAC address required');
    });
    it('registerDevice: registers known device', async () => {
      const result = await handleWifi({ action: 'registerDevice', mac: 'AA:BB:CC:DD:EE:FF' });
      expect(result.success).toBe(true);
      expect(mockRegisterKnownDevice).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
    });
    it('bluetooth: returns empty message when no BT devices', async () => {
      const result = await handleWifi({ action: 'bluetooth' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('No Bluetooth devices');
    });
    it('bluetooth: returns formatted bluetooth device list', async () => {
      mockGetBluetoothDevices.mockReturnValue([{ address: '11:22:33:44:55:66', name: 'Eric-Headphones', rssi: -60, type: 'audio', lastSeen: Date.now(), isTracked: true }]);
      const result = await handleWifi({ action: 'bluetooth' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Eric-Headphones');
    });
    it('networks: returns empty message when no networks', async () => {
      const result = await handleWifi({ action: 'networks' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('No WiFi networks');
    });
    it('networks: returns sorted network list', async () => {
      mockGetNearbyNetworks.mockReturnValue([{ ssid: 'HomeWifi', bssid: 'AA:BB:CC:DD:EE:01', rssi: -50, channel: 6, frequency: 2412 }, { ssid: 'Neighbor', bssid: 'AA:BB:CC:DD:EE:02', rssi: -75, channel: 11, frequency: 2462 }]);
      const result = await handleWifi({ action: 'networks' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('HomeWifi');
    });
    it('readings: returns message when no readings yet', async () => {
      const result = await handleWifi({ action: 'readings' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('No readings yet');
    });
    it('readings: returns formatted reading list', async () => {
      mockGetReadings.mockReturnValue([{ timestamp: Date.now(), rssi: -55.2, quality: 80, source: 'simulation' }, { timestamp: Date.now(), rssi: -58.1, quality: 75, source: 'simulation' }]);
      const result = await handleWifi({ action: 'readings' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Recent Readings');
    });
    it('reset: resets the sensor', async () => {
      const result = await handleWifi({ action: 'reset' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('reset');
      expect(mockResetWiFiSensor).toHaveBeenCalled();
    });
    it('configureRouter: returns error when ip missing', async () => {
      const result = await handleWifi({ action: 'configureRouter', password: 'secret' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('IP and password required');
    });
    it('configureRouter: returns error when password missing', async () => {
      const result = await handleWifi({ action: 'configureRouter', ip: '192.168.1.1' });
      expect(result.success).toBe(false);
    });
    it('configureRouter: configures and starts router monitoring', async () => {
      const result = await handleWifi({ action: 'configureRouter', ip: '192.168.1.1', password: 'secret', username: 'admin', type: 'asus', pollInterval: 3000 });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Router monitoring configured');
    });
  });

  describe('securityPerimeter', () => {
    it('returns error for unknown action', async () => {
      const result = await handlePerimeter({ action: 'launch' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown securityPerimeter action');
    });
    it('arm: arms the perimeter (sensor already active)', async () => {
      mockIsActive.mockReturnValue(true);
      mockGetConfig.mockReturnValue({ mode: 'router' });
      const result = await handlePerimeter({ action: 'arm' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('PERIMETER ARMED');
      expect(mockSensorStart).not.toHaveBeenCalled();
    });
    it('arm: starts sensor when inactive', async () => {
      mockIsActive.mockReturnValue(false);
      const result = await handlePerimeter({ action: 'arm' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('ARMED');
      expect(mockSensorStart).toHaveBeenCalled();
    });
    it('arm: configures router mode when routerIp provided', async () => {
      mockIsActive.mockReturnValue(false);
      const result = await handlePerimeter({ action: 'arm', routerIp: '192.168.1.1', routerPassword: 'pass' });
      expect(result.success).toBe(true);
    });
    it('disarm: stops the sensor', async () => {
      const result = await handlePerimeter({ action: 'disarm' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('DISARMED');
      expect(mockSensorStop).toHaveBeenCalled();
    });
    it('status: returns clear status when no threats', async () => {
      mockIsActive.mockReturnValue(true);
      const result = await handlePerimeter({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('ARMED');
      expect(result.output).toContain('CLEAR');
    });
    it('status: shows ALERT when unknown devices present', async () => {
      mockGetUnknownDevices.mockReturnValue([{ mac: 'XX:XX:XX:XX:XX:XX' }]);
      const result = await handlePerimeter({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('ALERT');
    });
    it('status: shows ACTIVITY when presence detected but no unknown devices', async () => {
      mockGetPresenceState.mockReturnValue({ detected: true, confidence: 0.8, estimatedCount: 1, movement: true });
      const result = await handlePerimeter({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('ACTIVITY');
    });
    it('threats: returns no threats message when all clear', async () => {
      const result = await handlePerimeter({ action: 'threats' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('No threats');
    });
    it('threats: reports unknown devices', async () => {
      mockGetUnknownDevices.mockReturnValue([{ mac: 'FF:EE:DD:CC:BB:AA', vendor: 'Unknown Corp', connection: '2.4GHz', rssi: -70, firstSeen: Date.now() - 300000 }]);
      const result = await handlePerimeter({ action: 'threats' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('UNKNOWN DEVICE');
    });
    it('threats: reports detected presence', async () => {
      mockGetPresenceState.mockReturnValue({ detected: true, confidence: 0.9, estimatedCount: 2, movement: true });
      const result = await handlePerimeter({ action: 'threats' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('PRESENCE DETECTED');
    });
  });
});
