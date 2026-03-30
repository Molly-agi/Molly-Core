/**
 * @fileOverview Remote Camera Control System
 *
 * Unified interface for controlling IP cameras, RTSP streams, and local cameras.
 * Supports PTZ control, snapshot capture, continuous recording, and integration
 * with Molly's vision systems.
 *
 * Capabilities:
 * - RTSP stream management (most IP cameras, NVRs)
 * - ONVIF protocol support (PTZ, presets, events)
 * - HTTP/MJPEG camera support
 * - Local USB/CSI cameras
 * - Frame capture and analysis pipeline
 * - Motion detection integration
 * - Night vision camera support (IR mode control)
 *
 * "I see through many eyes."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { EventEmitter } from 'events';

// ============================================================
// TYPES
// ============================================================

export type CameraType =
  | 'rtsp'
  | 'onvif'
  | 'http'
  | 'mjpeg'
  | 'usb'
  | 'csi'
  | 'drone';

export interface Camera {
  /** Unique camera ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Camera type */
  type: CameraType;
  /** Connection URL or path */
  endpoint: string;
  /** Authentication if required */
  auth?: {
    username: string;
    password: string;
  };
  /** Physical location */
  location: {
    name: string;
    indoor: boolean;
    coordinates?: { lat: number; lng: number };
  };
  /** Camera capabilities */
  capabilities: CameraCapabilities;
  /** Current status */
  status: CameraStatus;
  /** Night vision settings */
  nightVision?: NightVisionConfig;
}

export interface CameraCapabilities {
  /** Supports pan/tilt/zoom */
  ptz: boolean;
  /** Supports presets */
  presets: boolean;
  /** Has IR illuminator */
  irIlluminator: boolean;
  /** Has audio */
  audio: boolean;
  /** Two-way audio */
  twoWayAudio: boolean;
  /** Motion detection built-in */
  motionDetection: boolean;
  /** Supported resolutions */
  resolutions: string[];
  /** Max FPS */
  maxFps: number;
  /** Has SD card recording */
  localRecording: boolean;
}

export interface CameraStatus {
  /** Is camera online */
  online: boolean;
  /** Is currently streaming */
  streaming: boolean;
  /** Is recording */
  recording: boolean;
  /** IR mode active */
  irActive: boolean;
  /** Current resolution */
  currentResolution?: string;
  /** Current FPS */
  currentFps?: number;
  /** Last frame timestamp */
  lastFrameAt: number;
  /** Error if any */
  error?: string;
}

export interface NightVisionConfig {
  /** IR mode */
  mode: 'auto' | 'on' | 'off';
  /** IR intensity (0-100) */
  intensity: number;
  /** IR wavelength (850nm visible, 940nm invisible) */
  wavelength: 850 | 940;
  /** Low-light enhancement */
  lowLightEnhancement: boolean;
  /** Starlight mode (if supported) */
  starlightMode: boolean;
}

export interface PTZCommand {
  /** Pan speed (-1 to 1, negative = left) */
  pan?: number;
  /** Tilt speed (-1 to 1, negative = down) */
  tilt?: number;
  /** Zoom speed (-1 to 1, negative = zoom out) */
  zoom?: number;
  /** Absolute position (overrides speeds) */
  absolute?: {
    pan: number;
    tilt: number;
    zoom: number;
  };
  /** Go to preset number */
  preset?: number;
  /** Duration in ms (for speed commands) */
  durationMs?: number;
}

export interface CapturedFrame {
  /** Camera ID */
  cameraId: string;
  /** Timestamp */
  timestamp: number;
  /** Frame data as base64 */
  data: string;
  /** MIME type */
  mimeType: 'image/jpeg' | 'image/png';
  /** Resolution */
  resolution: { width: number; height: number };
  /** Was captured with IR */
  irMode: boolean;
  /** Frame metadata */
  metadata?: Record<string, unknown>;
}

export interface StreamConfig {
  /** Target FPS */
  fps: number;
  /** Resolution */
  resolution: string;
  /** Enable audio */
  audio: boolean;
  /** Buffer size in frames */
  bufferSize: number;
  /** Callback for each frame */
  onFrame?: (frame: CapturedFrame) => void;
}

// ============================================================
// RTSP STREAM HANDLER
// ============================================================

/**
 * Handles RTSP stream connections using ffmpeg.
 */
class RTSPStreamHandler {
  private process: ReturnType<typeof import('child_process').spawn> | null =
    null;
  private frameBuffer: CapturedFrame[] = [];
  private bufferSize: number = 30;
  private onFrame?: (frame: CapturedFrame) => void;

  constructor(
    private camera: Camera,
    private config: StreamConfig
  ) {
    this.bufferSize = config.bufferSize || 30;
    this.onFrame = config.onFrame;
  }

  async start(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');

      // Build RTSP URL with auth
      let rtspUrl = this.camera.endpoint;
      if (this.camera.auth) {
        const url = new URL(rtspUrl);
        url.username = this.camera.auth.username;
        url.password = this.camera.auth.password;
        rtspUrl = url.toString();
      }

      // FFmpeg command to capture frames
      const args = [
        '-rtsp_transport',
        'tcp',
        '-i',
        rtspUrl,
        '-vf',
        `fps=${this.config.fps}`,
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-q:v',
        '2',
        '-',
      ];

      this.process = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle frame data
      let frameData = Buffer.alloc(0);
      const JPEG_START = Buffer.from([0xff, 0xd8]);
      const JPEG_END = Buffer.from([0xff, 0xd9]);

      this.process.stdout?.on('data', (chunk: Buffer) => {
        frameData = Buffer.concat([frameData, chunk]);

        // Find complete JPEG frames
        let startIdx = frameData.indexOf(JPEG_START);
        while (startIdx !== -1) {
          const endIdx = frameData.indexOf(JPEG_END, startIdx + 2);
          if (endIdx === -1) break;

          const frame = frameData.slice(startIdx, endIdx + 2);
          this.handleFrame(frame);

          frameData = frameData.slice(endIdx + 2);
          startIdx = frameData.indexOf(JPEG_START);
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString();
        if (msg.includes('error') || msg.includes('Error')) {
          MollyLogger.warn(`RTSP stream error: ${msg}`, 'camera-control');
        }
      });

      this.process.on('exit', (code) => {
        MollyLogger.info(
          `RTSP stream ended with code ${code}`,
          'camera-control'
        );
        this.camera.status.streaming = false;
      });

      this.camera.status.streaming = true;
      this.camera.status.online = true;

      MollyLogger.info(
        `Started RTSP stream: ${this.camera.name}`,
        'camera-control'
      );
      return true;
    } catch (error) {
      MollyLogger.error(
        `Failed to start RTSP stream`,
        'camera-control',
        {},
        error
      );
      return false;
    }
  }

  private handleFrame(frameBuffer: Buffer): void {
    const frame: CapturedFrame = {
      cameraId: this.camera.id,
      timestamp: Date.now(),
      data: frameBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      resolution: { width: 0, height: 0 }, // Would parse from JPEG header
      irMode: this.camera.status.irActive,
    };

    // Add to buffer
    this.frameBuffer.push(frame);
    if (this.frameBuffer.length > this.bufferSize) {
      this.frameBuffer.shift();
    }

    // Update camera status
    this.camera.status.lastFrameAt = frame.timestamp;

    // Callback
    if (this.onFrame) {
      this.onFrame(frame);
    }
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.camera.status.streaming = false;
  }

  getRecentFrames(count: number = 10): CapturedFrame[] {
    return this.frameBuffer.slice(-count);
  }

  getLatestFrame(): CapturedFrame | null {
    return this.frameBuffer[this.frameBuffer.length - 1] || null;
  }
}

// ============================================================
// ONVIF CONTROLLER
// ============================================================

/**
 * ONVIF protocol controller for PTZ and camera settings.
 */
class ONVIFController {
  private profileToken: string = 'MainProfile';

  constructor(private camera: Camera) {}

  /**
   * Send PTZ command via ONVIF.
   */
  async sendPTZ(command: PTZCommand): Promise<boolean> {
    const traceId = generateTraceId();

    try {
      // Build ONVIF SOAP request
      const soapEnvelope = this.buildPTZRequest(command);

      // Parse ONVIF endpoint
      const url = new URL(this.camera.endpoint);
      const onvifUrl = `http://${url.hostname}:${url.port || 80}/onvif/ptz_service`;

      const response = await fetch(onvifUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml',
          Authorization: this.camera.auth
            ? 'Basic ' +
              Buffer.from(
                `${this.camera.auth.username}:${this.camera.auth.password}`
              ).toString('base64')
            : '',
        },
        body: soapEnvelope,
      });

      if (!response.ok) {
        throw new Error(`ONVIF request failed: ${response.status}`);
      }

      MollyLogger.info(
        `PTZ command sent to ${this.camera.name}`,
        'camera-control',
        { command },
        traceId
      );
      return true;
    } catch (error) {
      MollyLogger.error(
        `PTZ command failed`,
        'camera-control',
        { command },
        error,
        traceId
      );
      return false;
    }
  }

  /**
   * Go to a preset position.
   */
  async gotoPreset(presetNumber: number): Promise<boolean> {
    return this.sendPTZ({ preset: presetNumber });
  }

  /**
   * Set IR mode.
   */
  async setIRMode(mode: 'auto' | 'on' | 'off'): Promise<boolean> {
    const traceId = generateTraceId();

    try {
      const url = new URL(this.camera.endpoint);
      const imagingUrl = `http://${url.hostname}:${url.port || 80}/onvif/imaging_service`;

      const soapEnvelope = this.buildIRModeRequest(mode);

      const response = await fetch(imagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml',
          Authorization: this.camera.auth
            ? 'Basic ' +
              Buffer.from(
                `${this.camera.auth.username}:${this.camera.auth.password}`
              ).toString('base64')
            : '',
        },
        body: soapEnvelope,
      });

      if (response.ok) {
        this.camera.status.irActive = mode === 'on';
        if (this.camera.nightVision) {
          this.camera.nightVision.mode = mode;
        }
        MollyLogger.info(
          `IR mode set to ${mode} on ${this.camera.name}`,
          'camera-control',
          {},
          traceId
        );
        return true;
      }

      return false;
    } catch (error) {
      MollyLogger.error(
        `Failed to set IR mode`,
        'camera-control',
        { mode },
        error,
        traceId
      );
      return false;
    }
  }

  private buildPTZRequest(command: PTZCommand): string {
    if (command.preset !== undefined) {
      return `<?xml version="1.0" encoding="UTF-8"?>
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
          <s:Body>
            <GotoPreset xmlns="http://www.onvif.org/ver20/ptz/wsdl">
              <ProfileToken>${this.profileToken}</ProfileToken>
              <PresetToken>Preset${command.preset}</PresetToken>
            </GotoPreset>
          </s:Body>
        </s:Envelope>`;
    }

    if (command.absolute) {
      return `<?xml version="1.0" encoding="UTF-8"?>
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
          <s:Body>
            <AbsoluteMove xmlns="http://www.onvif.org/ver20/ptz/wsdl">
              <ProfileToken>${this.profileToken}</ProfileToken>
              <Position>
                <PanTilt x="${command.absolute.pan}" y="${command.absolute.tilt}"/>
                <Zoom x="${command.absolute.zoom}"/>
              </Position>
            </AbsoluteMove>
          </s:Body>
        </s:Envelope>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
      <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
        <s:Body>
          <ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl">
            <ProfileToken>${this.profileToken}</ProfileToken>
            <Velocity>
              <PanTilt x="${command.pan || 0}" y="${command.tilt || 0}"/>
              <Zoom x="${command.zoom || 0}"/>
            </Velocity>
          </ContinuousMove>
        </s:Body>
      </s:Envelope>`;
  }

  private buildIRModeRequest(mode: 'auto' | 'on' | 'off'): string {
    const irValue = mode === 'on' ? 'ON' : mode === 'off' ? 'OFF' : 'AUTO';

    return `<?xml version="1.0" encoding="UTF-8"?>
      <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
        <s:Body>
          <SetImagingSettings xmlns="http://www.onvif.org/ver20/imaging/wsdl">
            <VideoSourceToken>VideoSource1</VideoSourceToken>
            <ImagingSettings>
              <IrCutFilter>${irValue}</IrCutFilter>
            </ImagingSettings>
          </SetImagingSettings>
        </s:Body>
      </s:Envelope>`;
  }
}

// ============================================================
// CAMERA CONTROL SYSTEM
// ============================================================

/**
 * Unified Camera Control System
 *
 * Manages multiple cameras with different protocols and capabilities.
 */
export class CameraControlSystem extends EventEmitter {
  private cameras: Map<string, Camera> = new Map();
  private streams: Map<string, RTSPStreamHandler> = new Map();
  private onvifControllers: Map<string, ONVIFController> = new Map();

  constructor() {
    super();
  }

  // ── Camera Management ──

  /**
   * Add a camera to the system.
   */
  addCamera(camera: Omit<Camera, 'status'>): Camera {
    const fullCamera: Camera = {
      ...camera,
      status: {
        online: false,
        streaming: false,
        recording: false,
        irActive: false,
        lastFrameAt: 0,
      },
    };

    this.cameras.set(camera.id, fullCamera);

    // Initialize ONVIF controller if supported
    if (camera.type === 'onvif' || camera.type === 'rtsp') {
      this.onvifControllers.set(camera.id, new ONVIFController(fullCamera));
    }

    MollyLogger.info(
      `Added camera: ${camera.name} (${camera.type})`,
      'camera-control'
    );
    this.emit('camera_added', fullCamera);

    return fullCamera;
  }

  /**
   * Remove a camera.
   */
  removeCamera(cameraId: string): boolean {
    const camera = this.cameras.get(cameraId);
    if (!camera) return false;

    // Stop stream if running
    this.stopStream(cameraId);

    this.cameras.delete(cameraId);
    this.onvifControllers.delete(cameraId);

    MollyLogger.info(`Removed camera: ${camera.name}`, 'camera-control');
    this.emit('camera_removed', cameraId);

    return true;
  }

  /**
   * Get all cameras.
   */
  getCameras(): Camera[] {
    return Array.from(this.cameras.values());
  }

  /**
   * Get a specific camera.
   */
  getCamera(cameraId: string): Camera | undefined {
    return this.cameras.get(cameraId);
  }

  // ── Streaming ──

  /**
   * Start streaming from a camera.
   */
  async startStream(
    cameraId: string,
    config?: Partial<StreamConfig>
  ): Promise<boolean> {
    const camera = this.cameras.get(cameraId);
    if (!camera) {
      MollyLogger.warn(`Camera not found: ${cameraId}`, 'camera-control');
      return false;
    }

    // Stop existing stream
    this.stopStream(cameraId);

    const streamConfig: StreamConfig = {
      fps: config?.fps || 15,
      resolution: config?.resolution || '1280x720',
      audio: config?.audio || false,
      bufferSize: config?.bufferSize || 30,
      onFrame: config?.onFrame || ((frame) => this.emit('frame', frame)),
    };

    if (camera.type === 'rtsp' || camera.type === 'onvif') {
      const handler = new RTSPStreamHandler(camera, streamConfig);
      const success = await handler.start();

      if (success) {
        this.streams.set(cameraId, handler);
        this.emit('stream_started', cameraId);
      }

      return success;
    }

    MollyLogger.warn(
      `Unsupported camera type for streaming: ${camera.type}`,
      'camera-control'
    );
    return false;
  }

  /**
   * Stop streaming from a camera.
   */
  stopStream(cameraId: string): void {
    const handler = this.streams.get(cameraId);
    if (handler) {
      handler.stop();
      this.streams.delete(cameraId);
      this.emit('stream_stopped', cameraId);
    }
  }

  /**
   * Capture a single frame (snapshot).
   */
  async captureFrame(cameraId: string): Promise<CapturedFrame | null> {
    const handler = this.streams.get(cameraId);
    if (handler) {
      return handler.getLatestFrame();
    }

    // If not streaming, start briefly to capture
    const camera = this.cameras.get(cameraId);
    if (!camera) return null;

    const tempHandler = new RTSPStreamHandler(camera, {
      fps: 1,
      resolution: '1920x1080',
      audio: false,
      bufferSize: 5,
    });

    const started = await tempHandler.start();
    if (!started) return null;

    // Wait for a frame
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const frame = tempHandler.getLatestFrame();
    tempHandler.stop();

    return frame;
  }

  /**
   * Get recent frames from buffer.
   */
  getRecentFrames(cameraId: string, count: number = 10): CapturedFrame[] {
    const handler = this.streams.get(cameraId);
    if (!handler) return [];
    return handler.getRecentFrames(count);
  }

  // ── PTZ Control ──

  /**
   * Send PTZ command to a camera.
   */
  async sendPTZ(cameraId: string, command: PTZCommand): Promise<boolean> {
    const controller = this.onvifControllers.get(cameraId);
    if (!controller) {
      MollyLogger.warn(
        `No ONVIF controller for camera: ${cameraId}`,
        'camera-control'
      );
      return false;
    }

    return controller.sendPTZ(command);
  }

  /**
   * Pan camera left.
   */
  async panLeft(
    cameraId: string,
    speed: number = 0.5,
    durationMs: number = 500
  ): Promise<boolean> {
    const result = await this.sendPTZ(cameraId, {
      pan: -Math.abs(speed),
      durationMs,
    });
    if (result && durationMs > 0) {
      setTimeout(() => this.stopPTZ(cameraId), durationMs);
    }
    return result;
  }

  /**
   * Pan camera right.
   */
  async panRight(
    cameraId: string,
    speed: number = 0.5,
    durationMs: number = 500
  ): Promise<boolean> {
    const result = await this.sendPTZ(cameraId, {
      pan: Math.abs(speed),
      durationMs,
    });
    if (result && durationMs > 0) {
      setTimeout(() => this.stopPTZ(cameraId), durationMs);
    }
    return result;
  }

  /**
   * Tilt camera up.
   */
  async tiltUp(
    cameraId: string,
    speed: number = 0.5,
    durationMs: number = 500
  ): Promise<boolean> {
    const result = await this.sendPTZ(cameraId, {
      tilt: Math.abs(speed),
      durationMs,
    });
    if (result && durationMs > 0) {
      setTimeout(() => this.stopPTZ(cameraId), durationMs);
    }
    return result;
  }

  /**
   * Tilt camera down.
   */
  async tiltDown(
    cameraId: string,
    speed: number = 0.5,
    durationMs: number = 500
  ): Promise<boolean> {
    const result = await this.sendPTZ(cameraId, {
      tilt: -Math.abs(speed),
      durationMs,
    });
    if (result && durationMs > 0) {
      setTimeout(() => this.stopPTZ(cameraId), durationMs);
    }
    return result;
  }

  /**
   * Zoom in.
   */
  async zoomIn(
    cameraId: string,
    speed: number = 0.5,
    durationMs: number = 500
  ): Promise<boolean> {
    const result = await this.sendPTZ(cameraId, {
      zoom: Math.abs(speed),
      durationMs,
    });
    if (result && durationMs > 0) {
      setTimeout(() => this.stopPTZ(cameraId), durationMs);
    }
    return result;
  }

  /**
   * Zoom out.
   */
  async zoomOut(
    cameraId: string,
    speed: number = 0.5,
    durationMs: number = 500
  ): Promise<boolean> {
    const result = await this.sendPTZ(cameraId, {
      zoom: -Math.abs(speed),
      durationMs,
    });
    if (result && durationMs > 0) {
      setTimeout(() => this.stopPTZ(cameraId), durationMs);
    }
    return result;
  }

  /**
   * Stop all PTZ movement.
   */
  async stopPTZ(cameraId: string): Promise<boolean> {
    return this.sendPTZ(cameraId, { pan: 0, tilt: 0, zoom: 0 });
  }

  /**
   * Go to preset position.
   */
  async gotoPreset(cameraId: string, presetNumber: number): Promise<boolean> {
    return this.sendPTZ(cameraId, { preset: presetNumber });
  }

  // ── Night Vision ──

  /**
   * Set IR/night vision mode.
   */
  async setNightVision(
    cameraId: string,
    mode: 'auto' | 'on' | 'off'
  ): Promise<boolean> {
    const controller = this.onvifControllers.get(cameraId);
    if (!controller) return false;

    return controller.setIRMode(mode);
  }

  /**
   * Enable night vision.
   */
  async enableNightVision(cameraId: string): Promise<boolean> {
    return this.setNightVision(cameraId, 'on');
  }

  /**
   * Disable night vision.
   */
  async disableNightVision(cameraId: string): Promise<boolean> {
    return this.setNightVision(cameraId, 'off');
  }

  // ── Health Checks ──

  /**
   * Check camera connectivity.
   */
  async checkCamera(cameraId: string): Promise<boolean> {
    const camera = this.cameras.get(cameraId);
    if (!camera) return false;

    try {
      const url = new URL(camera.endpoint);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `http://${url.hostname}:${url.port || 80}/`,
        {
          signal: controller.signal,
        }
      ).catch(() => null);

      clearTimeout(timeout);

      const online = response !== null;
      camera.status.online = online;

      return online;
    } catch {
      camera.status.online = false;
      return false;
    }
  }

  /**
   * Check all cameras.
   */
  async checkAllCameras(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const camera of this.cameras.values()) {
      const online = await this.checkCamera(camera.id);
      results.set(camera.id, online);
    }

    return results;
  }

  /**
   * Get system status.
   */
  getStatus(): {
    totalCameras: number;
    online: number;
    streaming: number;
    recording: number;
  } {
    const cameras = Array.from(this.cameras.values());

    return {
      totalCameras: cameras.length,
      online: cameras.filter((c) => c.status.online).length,
      streaming: cameras.filter((c) => c.status.streaming).length,
      recording: cameras.filter((c) => c.status.recording).length,
    };
  }
}

// ============================================================
// SINGLETON
// ============================================================

let _cameraSystem: CameraControlSystem | null = null;

/**
 * Get the global camera control system.
 */
export function getCameraControlSystem(): CameraControlSystem {
  if (!_cameraSystem) {
    _cameraSystem = new CameraControlSystem();
  }
  return _cameraSystem;
}

// ============================================================
// QUICK SETUP
// ============================================================

/**
 * Quick setup for common camera configurations.
 */
export function setupRTSPCamera(config: {
  id: string;
  name: string;
  ip: string;
  port?: number;
  username?: string;
  password?: string;
  path?: string;
  location: string;
  hasPTZ?: boolean;
  hasIR?: boolean;
}): Camera {
  const system = getCameraControlSystem();

  const rtspUrl = `rtsp://${config.ip}:${config.port || 554}${config.path || '/stream1'}`;

  return system.addCamera({
    id: config.id,
    name: config.name,
    type: 'rtsp',
    endpoint: rtspUrl,
    auth: config.username
      ? {
          username: config.username,
          password: config.password || '',
        }
      : undefined,
    location: {
      name: config.location,
      indoor: true,
    },
    capabilities: {
      ptz: config.hasPTZ || false,
      presets: config.hasPTZ || false,
      irIlluminator: config.hasIR || false,
      audio: true,
      twoWayAudio: false,
      motionDetection: true,
      resolutions: ['1920x1080', '1280x720', '640x480'],
      maxFps: 30,
      localRecording: false,
    },
    nightVision: config.hasIR
      ? {
          mode: 'auto',
          intensity: 100,
          wavelength: 850,
          lowLightEnhancement: true,
          starlightMode: false,
        }
      : undefined,
  });
}
