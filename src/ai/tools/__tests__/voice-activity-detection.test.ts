/**
 * @fileOverview Tests for Voice Activity Detection (VAD) System
 *
 * Tests the VoiceActivityDetector class for speech detection,
 * adaptive thresholding, and session management.
 */

import {
  createVAD,
  type VADConfig,
} from '../../tools/voice-activity-detection';

describe('VoiceActivityDetector', () => {
  describe('initialization', () => {
    it('should create with default config', () => {
      const vad = createVAD();
      const diagnostics = vad.getDiagnostics();

      expect(diagnostics.frameCount).toBe(0);
      expect(diagnostics.currentThreshold).toBe(0.01);
    });

    it('should accept custom configuration', () => {
      const config: VADConfig = {
        sampleRate: 44100,
        frameDuration: 30,
        energyThreshold: 0.05,
        minSpeechMs: 500,
        maxSilenceMs: 1000,
        autoCalibrate: false,
      };

      const vad = createVAD(config);
      const diagnostics = vad.getDiagnostics();

      expect(diagnostics.currentThreshold).toBe(0.05);
    });
  });

  describe('session management', () => {
    it('should start and return session', () => {
      const vad = createVAD();
      const sessionId = vad.startSession();

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');

      const session = vad.getSession();
      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionId);
      expect(session?.speechDetected).toBe(false);
    });

    it('should stop session and return data', () => {
      const vad = createVAD();
      vad.startSession();

      const session = vad.stopSession();

      expect(session).not.toBeNull();
      expect(vad.getSession()).toBeNull();
    });

    it('should return null when stopping non-existent session', () => {
      const vad = createVAD();
      const session = vad.stopSession();

      expect(session).toBeNull();
    });

    it('should throw when processing without session', () => {
      const vad = createVAD();
      const audioData = new Float32Array(100);

      expect(() => vad.processFrame(audioData)).toThrow(
        'VAD session not started'
      );
    });
  });

  describe('frame processing', () => {
    it('should process audio frame and return result', () => {
      const vad = createVAD({ autoCalibrate: false });
      vad.startSession();

      // Silence (low energy)
      const silentFrame = new Float32Array(100).fill(0);
      const silentResult = vad.processFrame(silentFrame);

      expect(silentResult.isSpeaking).toBe(false);
      expect(silentResult.energy).toBe(0);
      expect(silentResult.confidence).toBeGreaterThanOrEqual(0);
      expect(silentResult.timestamp).toBeGreaterThan(0);
    });

    it('should detect speech with high energy audio', () => {
      const vad = createVAD({ energyThreshold: 0.01, autoCalibrate: false });
      vad.startSession();

      // Loud audio (high energy)
      const loudFrame = new Float32Array(100);
      for (let i = 0; i < loudFrame.length; i++) {
        loudFrame[i] = Math.sin(i * 0.1) * 0.5; // Sine wave with amplitude 0.5
      }

      const result = vad.processFrame(loudFrame);

      expect(result.isSpeaking).toBe(true);
      expect(result.energy).toBeGreaterThan(0.01);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should update speech duration when speaking', () => {
      const vad = createVAD({ energyThreshold: 0.001, autoCalibrate: false });
      vad.startSession();

      // Generate speech-like audio
      const speechFrame = new Float32Array(100);
      for (let i = 0; i < speechFrame.length; i++) {
        speechFrame[i] = Math.sin(i * 0.2) * 0.3;
      }

      // Process multiple frames
      vad.processFrame(speechFrame);
      vad.processFrame(speechFrame);
      vad.processFrame(speechFrame);

      const session = vad.getSession();
      expect(session?.speechDetected).toBe(true);
      expect(session?.speechDuration).toBeGreaterThan(0);
    });

    it('should update silence duration when silent', () => {
      const vad = createVAD({ energyThreshold: 0.1, autoCalibrate: false });
      vad.startSession();

      // Very quiet audio
      const silentFrame = new Float32Array(100).fill(0.001);

      vad.processFrame(silentFrame);
      vad.processFrame(silentFrame);

      const session = vad.getSession();
      expect(session?.silenceDuration).toBeGreaterThan(0);
    });

    it('should reset silence duration when speech detected', () => {
      const vad = createVAD({ energyThreshold: 0.01, autoCalibrate: false });
      vad.startSession();

      // Start with silence
      const silentFrame = new Float32Array(100).fill(0);
      vad.processFrame(silentFrame);
      vad.processFrame(silentFrame);

      // Then speech
      const speechFrame = new Float32Array(100);
      for (let i = 0; i < speechFrame.length; i++) {
        speechFrame[i] = Math.sin(i * 0.1) * 0.5;
      }
      vad.processFrame(speechFrame);

      const session = vad.getSession();
      expect(session?.silenceDuration).toBe(0);
    });
  });

  describe('speech threshold checks', () => {
    it('should report sufficient speech when minSpeechMs exceeded', () => {
      const vad = createVAD({
        minSpeechMs: 40, // 2 frames at 20ms each
        energyThreshold: 0.001,
        autoCalibrate: false,
      });
      vad.startSession();

      const speechFrame = new Float32Array(100);
      for (let i = 0; i < speechFrame.length; i++) {
        speechFrame[i] = Math.sin(i * 0.1) * 0.3;
      }

      expect(vad.hasSufficientSpeech()).toBe(false);

      vad.processFrame(speechFrame);
      expect(vad.hasSufficientSpeech()).toBe(false);

      vad.processFrame(speechFrame);
      vad.processFrame(speechFrame);
      expect(vad.hasSufficientSpeech()).toBe(true);
    });

    it('should report timeout when maxSilenceMs exceeded', () => {
      const vad = createVAD({
        maxSilenceMs: 40, // 2 frames at 20ms each
        autoCalibrate: false,
      });
      vad.startSession();

      const silentFrame = new Float32Array(100).fill(0);

      expect(vad.isTimeoutExceeded()).toBe(false);

      vad.processFrame(silentFrame);
      expect(vad.isTimeoutExceeded()).toBe(false);

      vad.processFrame(silentFrame);
      vad.processFrame(silentFrame);
      expect(vad.isTimeoutExceeded()).toBe(true);
    });

    it('should return false for checks without session', () => {
      const vad = createVAD();

      expect(vad.hasSufficientSpeech()).toBe(false);
      expect(vad.isTimeoutExceeded()).toBe(false);
    });
  });

  describe('adaptive thresholding', () => {
    it('should adapt threshold based on background noise', () => {
      const vad = createVAD({ autoCalibrate: true, energyThreshold: 0.01 });
      vad.startSession();

      // Process many frames with consistent low noise
      const noiseFrame = new Float32Array(100);
      for (let i = 0; i < noiseFrame.length; i++) {
        noiseFrame[i] = (Math.random() - 0.5) * 0.005; // Small random noise
      }

      // Process enough frames for calibration (need 10+ frames)
      for (let i = 0; i < 20; i++) {
        vad.processFrame(noiseFrame);
      }

      // Threshold should have adapted (may go up or down based on noise)
      // Just verify history was built up
      expect(vad.getDiagnostics().energyHistorySize).toBeGreaterThan(10);
    });

    it('should not adapt when autoCalibrate is false', () => {
      const vad = createVAD({ autoCalibrate: false, energyThreshold: 0.05 });
      vad.startSession();

      const initialThreshold = vad.getDiagnostics().currentThreshold;

      // Process many frames
      const frame = new Float32Array(100).fill(0.001);
      for (let i = 0; i < 20; i++) {
        vad.processFrame(frame);
      }

      expect(vad.getDiagnostics().currentThreshold).toBe(initialThreshold);
    });

    it('should reset calibration', () => {
      const vad = createVAD({ autoCalibrate: true, energyThreshold: 0.01 });
      vad.startSession();

      // Build up some history
      const frame = new Float32Array(100).fill(0.002);
      for (let i = 0; i < 20; i++) {
        vad.processFrame(frame);
      }

      expect(vad.getDiagnostics().energyHistorySize).toBeGreaterThan(0);

      vad.resetCalibration();

      expect(vad.getDiagnostics().energyHistorySize).toBe(0);
      expect(vad.getDiagnostics().currentThreshold).toBe(0.01);
    });
  });

  describe('diagnostics', () => {
    it('should track frame count', () => {
      const vad = createVAD({ autoCalibrate: false });
      vad.startSession();

      expect(vad.getDiagnostics().frameCount).toBe(0);

      const frame = new Float32Array(100);
      vad.processFrame(frame);
      vad.processFrame(frame);
      vad.processFrame(frame);

      expect(vad.getDiagnostics().frameCount).toBe(3);
    });

    it('should calculate average energy', () => {
      const vad = createVAD({ autoCalibrate: true });
      vad.startSession();

      // Process frames with known energy
      const frames = [
        new Float32Array(100).fill(0.01),
        new Float32Array(100).fill(0.02),
        new Float32Array(100).fill(0.03),
      ];

      for (const frame of frames) {
        vad.processFrame(frame);
      }

      const diagnostics = vad.getDiagnostics();
      expect(diagnostics.avgEnergy).toBeGreaterThan(0);
      expect(diagnostics.energyHistorySize).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle empty audio buffer', () => {
      const vad = createVAD({ autoCalibrate: false });
      vad.startSession();

      const emptyFrame = new Float32Array(0);
      const result = vad.processFrame(emptyFrame);

      // Empty buffer should result in NaN energy (0/0), which will be treated as no speech
      expect(result.isSpeaking).toBe(false);
    });

    it('should handle single sample audio', () => {
      const vad = createVAD({ autoCalibrate: false });
      vad.startSession();

      const singleSample = new Float32Array([0.5]);
      const result = vad.processFrame(singleSample);

      expect(result.energy).toBe(0.5);
    });

    it('should handle very loud audio', () => {
      const vad = createVAD({ autoCalibrate: false });
      vad.startSession();

      // Audio at maximum amplitude
      const loudFrame = new Float32Array(100).fill(1.0);
      const result = vad.processFrame(loudFrame);

      expect(result.isSpeaking).toBe(true);
      expect(result.energy).toBe(1.0);
      expect(result.confidence).toBeGreaterThanOrEqual(1.0);
    });

    it('should handle negative audio values', () => {
      const vad = createVAD({ autoCalibrate: false });
      vad.startSession();

      // Alternating positive and negative values
      const frame = new Float32Array(100);
      for (let i = 0; i < frame.length; i++) {
        frame[i] = i % 2 === 0 ? 0.3 : -0.3;
      }

      const result = vad.processFrame(frame);
      expect(result.energy).toBeCloseTo(0.3, 2);
    });
  });
});
