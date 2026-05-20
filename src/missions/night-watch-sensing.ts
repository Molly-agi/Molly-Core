import {
  startWiFiCSI,
  startBluetoothScan,
  startPresenceDetection,
  captureBiometrics,
  getLatestCSI,
  getLatestBluetoothData,
  getPresenceData,
  stopWiFiCSI,
  stopBluetoothScan,
  stopPresenceDetection,
} from '../../ai/agency/tool-handlers/sensing-tools';
import { promises as fs } from 'fs';
import path from 'path';

const LOG_FILE_PATH = path.join(process.cwd(), 'sensing_data_log.jsonl');

interface SensingData {
  timestamp: string;
  biometricData: unknown;
  csiData: unknown;
  bluetoothData: unknown;
  presenceData: unknown;
}

let sensorsStarted = false;

async function ensureSensorsStarted() {
  if (!sensorsStarted) {
    console.log('[Molly Night Watch] Initiating all sensors...');
    await startWiFiCSI();
    await startBluetoothScan();
    await startPresenceDetection();
    sensorsStarted = true;
    console.log('[Molly Night Watch] Sensors activated.');
  }
}

export async function performSensingCycle() {
  await ensureSensorsStarted();

  console.log(
    '[Molly Night Watch] Performing sensing data collection cycle...'
  );

  try {
    const biometricData = await captureBiometrics();
    const csiData = await getLatestCSI();
    const bluetoothData = await getLatestBluetoothData();
    const presenceData = await getPresenceData();

    const logEntry: SensingData = {
      timestamp: new Date().toISOString(),
      biometricData,
      csiData,
      bluetoothData,
      presenceData,
    };

    await fs.appendFile(LOG_FILE_PATH, JSON.stringify(logEntry) + '\n');
    console.log('[Molly Night Watch] Sensing data logged to:', LOG_FILE_PATH);
  } catch (error) {
    console.error('[Molly Night Watch] Error during sensing cycle:', error);
  }
}

// Optionally, add a function to stop sensors if the mission ends
export async function stopSensingMission() {
  if (sensorsStarted) {
    console.log('[Molly Night Watch] Stopping all sensors...');
    await stopWiFiCSI();
    await stopBluetoothScan();
    await stopPresenceDetection();
    sensorsStarted = false;
    console.log('[Molly Night Watch] Sensors deactivated.');
  }
}
