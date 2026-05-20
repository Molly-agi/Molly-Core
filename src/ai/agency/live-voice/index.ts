/**
 * @fileOverview Live Voice Module — Molly's Real-Time Voice
 *
 * WebSocket-based real-time voice dialogue with sub-second latency.
 *
 * Usage:
 *   import { getLiveVoiceClient } from '@/ai/agency/live-voice';
 *   const client = getLiveVoiceClient();
 *   const session = await client.startSession({ systemInstruction: "You are Molly" });
 *   client.on((event, data) => console.log(event, data));
 *   client.sendAudio(audioBuffer, 100);
 */

export * from './types';
export {
  LiveVoiceClient,
  getLiveVoiceClient,
  resetLiveVoiceClient,
  getLiveAuditLog,
} from './client';
