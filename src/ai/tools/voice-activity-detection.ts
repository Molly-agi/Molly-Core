/**
 * @fileOverview Voice Activity Detection (VAD) System
 *
 * Detects when user is speaking vs silence/noise.
 * Enables continuous listening mode for natural conversation with Molly.
 *
 * Uses energy-based detection with adaptive thresholding.
 */

import { MollyLogger, generateTraceId } from '../logger';

export interface VADConfig {
  /** Sample rate in Hz (default: 16000) */
  sampleRate?: number;

  /** Frame duration in ms (default: 20ms) */
  frameDuration?: number;

  /** Energy threshold for speech detection (auto-calibrated if not set) */
  energyThreshold?: number;

  /** Minimum speech duration in ms to trigger (default: 300ms) */
  minSpeechMs?: number;

  /** Maximum silence duration in ms before stopping (default: 800ms) */
  maxSilenceMs?: number;

  /** Enable auto-calibration of threshold (default: true) */
  autoCalibrate?: boolean;
}

export interface VADResult {
  isSpeaking: boolean;
  confidence: number;
  energy: number;
  timestamp: number;
}

export interface VADSession {
  id: string;
  startTime: number;
  speechDetected: boolean;
  silenceDuration: number;
  speechDuration: number;
}

/**
 * Voice Activity Detector
 */
export class VoiceActivityDetector {
  private config: Required<VADConfig>;
  private energyHistory: number[] = [];
  private adaptiveThreshold: number;
  private session: VADSession | null = null;
  private frameCount: number = 0;

  constructor(config: VADConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate || 16000,
      frameDuration: config.frameDuration || 20,
      energyThreshold: config.energyThreshold || 0.01,
      minSpeechMs: config.minSpeechMs || 300,
      maxSilenceMs: config.maxSilenceMs || 800,
      autoCalibrate: config.autoCalibrate !== false,
    };

    this.adaptiveThreshold = this.config.energyThreshold;

    MollyLogger.info('VAD initialized', 'voice-activity-detection', {
      sampleRate: this.config.sampleRate,
      frameDuration: this.config.frameDuration,
      threshold: this.adaptiveThreshold,
    });
  }

  /**
   * Start a new VAD session
   */
  startSession(): string {
    const sessionId = generateTraceId();

    this.session = {
      id: sessionId,
      startTime: Date.now(),
      speechDetected: false,
      silenceDuration: 0,
      speechDuration: 0,
    };

    this.energyHistory = [];
    this.frameCount = 0;

    MollyLogger.info('VAD session started', 'voice-activity-detection', {
      sessionId,
    });

    return sessionId;
  }

  /**
   * Stop the current VAD session
   */
  stopSession(): VADSession | null {
    if (!this.session) {
      MollyLogger.warn(
        'Attempted to stop non-existent VAD session',
        'voice-activity-detection'
      );
      return null;
    }

    const session = { ...this.session };

    MollyLogger.info('VAD session stopped', 'voice-activity-detection', {
      sessionId: session.id,
      duration: Date.now() - session.startTime,
      speechDetected: session.speechDetected,
      speechDuration: session.speechDuration,
    });

    this.session = null;
    return session;
  }

  /**
   * Process an audio frame and detect voice activity
   *
   * @param audioData Float32Array of audio samples
   * @returns VAD result with speech detection and confidence
   */
  processFrame(audioData: Float32Array): VADResult {
    if (!this.session) {
      throw new Error('VAD session not started. Call startSession() first.');
    }

    this.frameCount++;

    // Calculate RMS energy
    const energy = this.calculateEnergy(audioData);

    // Update energy history for auto-calibration
    if (this.config.autoCalibrate) {
      this.updateEnergyHistory(energy);
      this.adaptThreshold();
    }

    // Detect speech based on energy threshold
    const isSpeaking = energy > this.adaptiveThreshold;
    const confidence = Math.min(1.0, energy / (this.adaptiveThreshold * 2));

    // Update session state
    const frameDuration = this.config.frameDuration;

    if (isSpeaking) {
      this.session.speechDetected = true;
      this.session.speechDuration += frameDuration;
      this.session.silenceDuration = 0;
    } else {
      this.session.silenceDuration += frameDuration;
    }

    return {
      isSpeaking,
      confidence,
      energy,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if current session has detected enough speech
   */
  hasSufficientSpeech(): boolean {
    return this.session
      ? this.session.speechDuration >= this.config.minSpeechMs
      : false;
  }

  /**
   * Check if current session has been silent too long
   */
  isTimeoutExceeded(): boolean {
    return this.session
      ? this.session.silenceDuration >= this.config.maxSilenceMs
      : false;
  }

  /**
   * Get current session state
   */
  getSession(): VADSession | null {
    return this.session ? { ...this.session } : null;
  }

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateEnergy(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      const sample = audioData[i] ?? 0;
      sum += sample * sample;
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * Update energy history for adaptive thresholding
   */
  private updateEnergyHistory(energy: number): void {
    this.energyHistory.push(energy);

    // Keep only last 100 frames (~2 seconds at 20ms frames)
    if (this.energyHistory.length > 100) {
      this.energyHistory.shift();
    }
  }

  /**
   * Adapt threshold based on background noise
   */
  private adaptThreshold(): void {
    if (this.energyHistory.length < 10) {
      return; // Need minimum history
    }

    // Calculate median energy (more robust than mean)
    const sorted = [...this.energyHistory].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0.01;

    // Set threshold slightly above background
    this.adaptiveThreshold = median * 2.5;

    // Clamp to reasonable range
    this.adaptiveThreshold = Math.max(
      0.005,
      Math.min(0.1, this.adaptiveThreshold)
    );
  }

  /**
   * Reset calibration (useful when environment changes)
   */
  resetCalibration(): void {
    this.energyHistory = [];
    this.adaptiveThreshold = this.config.energyThreshold;

    MollyLogger.info('VAD calibration reset', 'voice-activity-detection', {
      threshold: this.adaptiveThreshold,
    });
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics(): {
    frameCount: number;
    currentThreshold: number;
    energyHistorySize: number;
    avgEnergy: number;
  } {
    const avgEnergy =
      this.energyHistory.length > 0
        ? this.energyHistory.reduce((a, b) => a + b, 0) /
          this.energyHistory.length
        : 0;

    return {
      frameCount: this.frameCount,
      currentThreshold: this.adaptiveThreshold,
      energyHistorySize: this.energyHistory.length,
      avgEnergy,
    };
  }
}

/**
 * Convenience function to create a VAD instance
 */
export function createVAD(config?: VADConfig): VoiceActivityDetector {
  return new VoiceActivityDetector(config);
}

/**
 * Browser-compatible audio stream processor
 * Processes microphone input and triggers callback on speech detection
 */
export class VoiceStreamProcessor {
  private vad: VoiceActivityDetector;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private isActive: boolean = false;
  private onSpeechStart?: () => void;
  private onSpeechEnd?: (duration: number) => void;

  constructor(config?: VADConfig) {
    this.vad = createVAD(config);
  }

  /**
   * Start listening to microphone
   */
  async startListening(callbacks: {
    onSpeechStart?: () => void;
    onSpeechEnd?: (duration: number) => void;
  }): Promise<void> {
    if (this.isActive) {
      throw new Error('Already listening');
    }

    this.onSpeechStart = callbacks.onSpeechStart;
    this.onSpeechEnd = callbacks.onSpeechEnd;

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      this.isActive = true;
      this.vad.startSession();

      // Start processing frames
      this.processAudioFrames();

      MollyLogger.info(
        'Voice stream processor started',
        'voice-stream-processor'
      );
    } catch (error) {
      MollyLogger.error(
        'Failed to start voice stream',
        'voice-stream-processor',
        {},
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    const session = this.vad.stopSession();

    if (session && this.onSpeechEnd) {
      this.onSpeechEnd(session.speechDuration);
    }

    MollyLogger.info(
      'Voice stream processor stopped',
      'voice-stream-processor'
    );
  }

  /**
   * Process audio frames continuously
   */
  private processAudioFrames(): void {
    if (!this.isActive || !this.analyser) {
      return;
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const processFrame = () => {
      if (!this.isActive) {
        return;
      }

      this.analyser!.getFloatTimeDomainData(dataArray);
      const result = this.vad.processFrame(dataArray);

      // Trigger callbacks
      const session = this.vad.getSession();
      if (session) {
        if (
          result.isSpeaking &&
          !session.speechDetected &&
          this.onSpeechStart
        ) {
          this.onSpeechStart();
        }

        if (this.vad.isTimeoutExceeded() && this.onSpeechEnd) {
          this.onSpeechEnd(session.speechDuration);
          this.vad.stopSession();
          this.vad.startSession();
        }
      }

      // Schedule next frame (20ms = 50fps)
      setTimeout(processFrame, 20);
    };

    processFrame();
  }

  /**
   * Check if currently listening
   */
  isListening(): boolean {
    return this.isActive;
  }
}
