'use client';

/**
 * @fileOverview Real-time iris tracking via MediaPipe FaceLandmarker.
 *
 * Runs in the browser. Captures webcam, detects face landmarks with iris
 * refinement, computes a (yaw, pitch) gaze direction, and writes it to a
 * shared ref. MollyMesh's useFrame reads that ref and lerps the avatar's
 * eye bones toward it — async-to-frame-sync buffer pattern that keeps the
 * 60 fps render loop free of MediaPipe's ~30 Hz output cadence.
 *
 * Per Eli's hard stops:
 *   - Does not touch FacialMorphOverrides
 *   - Does not instantiate a second AvatarDirector
 *   - Stays encapsulated to its own ref; consumer reads via getter
 *
 * Per Molly's directive (Option B, 2026-06-20):
 *   - Drives existing LeftEye/RightEye bone rotation, no new bones added
 *   - Falls back to procedural saccade when no face detected for >500 ms
 */

import { useEffect, useRef } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

/**
 * Subset of FacialMorphOverrides driven by the blendshape path. Kept narrow
 * on purpose — the GLB only ships `mouthOpen` and `mouthSmile` morph targets,
 * so we only mirror the two ARKit shapes that map cleanly. Expanding this
 * shape without first upgrading molly.glb would be a no-op at best and could
 * mislead reviewers about what fidelity we actually deliver.
 */
export interface ExpressionOverrides {
  /** 0..1 from MediaPipe ARKit `jawOpen` blendshape. */
  jawOpen: number;
  /**
   * 0..1, averaged from MediaPipe `mouthSmileLeft` + `mouthSmileRight`.
   * Molly directive 2026-06-20: average the two sides for stability; avoid
   * erratic asymmetry unless intentional.
   */
  mouthSmileLeft: number;
}

/** Shared buffer written by MediaPipe (async), read by useFrame (60 Hz). */
export interface IrisTrackingBuffer {
  /** Yaw in radians, suitable for eye bone .rotation.y */
  yaw: number;
  /** Pitch in radians, suitable for eye bone .rotation.x */
  pitch: number;
  /** Timestamp (performance.now ms) of last successful iris detection. */
  lastUpdate: number;
  /** True if face was detected in most recent inference. */
  faceDetected: boolean;
  /**
   * Blendshape-derived facial morphs. Independent of the iris path — has its
   * own stale clock (`expressionLastUpdate`) so an iris failure does not
   * silence expression mirroring, and vice-versa.
   */
  expressionOverrides: ExpressionOverrides;
  /** Timestamp (performance.now ms) of last successful blendshape read. */
  expressionLastUpdate: number;
}

const INITIAL_BUFFER: IrisTrackingBuffer = {
  yaw: 0,
  pitch: 0,
  lastUpdate: 0,
  faceDetected: false,
  expressionOverrides: { jawOpen: 0, mouthSmileLeft: 0 },
  expressionLastUpdate: 0,
};

// Maximum realistic eye-bone rotation (radians). Beyond this looks cross-eyed.
const MAX_YAW = 0.45;
const MAX_PITCH = 0.3;

// MediaPipe Face Mesh iris landmark indices (require refineLandmarks=true)
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
// Eye corners — used to derive eye socket width/height for normalization
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

export interface UseIrisTrackingOptions {
  /** Set to false to disable tracking and free the camera. Default true. */
  enabled?: boolean;
  /** Width hint for the webcam stream. Default 320. */
  videoWidth?: number;
  /** Height hint for the webcam stream. Default 240. */
  videoHeight?: number;
  /** Mirror horizontally so avatar mirrors the user. Default true. */
  mirror?: boolean;
}

export interface UseIrisTrackingResult {
  /** Live tracking buffer — read inside useFrame. */
  buffer: React.MutableRefObject<IrisTrackingBuffer>;
  /** True after MediaPipe loaded and camera grant succeeded. */
  ready: React.MutableRefObject<boolean>;
  /** Last initialization error, if any. */
  error: React.MutableRefObject<Error | null>;
}

/**
 * Start iris tracking. Returns refs the render loop can poll without
 * triggering React re-renders.
 */
export function useIrisTracking(
  options: UseIrisTrackingOptions = {}
): UseIrisTrackingResult {
  const {
    enabled = true,
    videoWidth = 320,
    videoHeight = 240,
    mirror = true,
  } = options;

  const buffer = useRef<IrisTrackingBuffer>({ ...INITIAL_BUFFER });
  const ready = useRef(false);
  const error = useRef<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let landmarker: FaceLandmarker | null = null;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let rafId = 0;

    async function init() {
      try {
        // 1. Load MediaPipe WASM + model from local public/ (no CDN dependency)
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        if (cancelled) return;

        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/models/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        if (cancelled) return;

        // 2. Acquire webcam
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: videoWidth },
            height: { ideal: videoHeight },
            facingMode: 'user',
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();
        if (cancelled) return;

        ready.current = true;

        // 3. Per-frame inference loop
        let lastVideoTime = -1;
        const detect = () => {
          if (cancelled || !landmarker || !video) return;
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
              const result: FaceLandmarkerResult = landmarker.detectForVideo(
                video,
                performance.now()
              );
              processResult(result);
            } catch (e) {
              // Inference errors are non-fatal — skip frame and continue.
              error.current = e instanceof Error ? e : new Error(String(e));
            }
          }
          rafId = requestAnimationFrame(detect);
        };
        rafId = requestAnimationFrame(detect);
      } catch (e) {
        error.current = e instanceof Error ? e : new Error(String(e));
        ready.current = false;
      }
    }

    function processResult(result: FaceLandmarkerResult): void {
      const faces = result.faceLandmarks;
      if (!faces || faces.length === 0) {
        buffer.current.faceDetected = false;
        return;
      }
      const lm = faces[0];

      // ── Iris block ────────────────────────────────────────────────────────
      // Need 478 landmarks (with iris refinement). Without iris refinement
      // the model returns the base 468-landmark mesh and we cannot compute gaze.
      if (lm.length < 478) {
        buffer.current.faceDetected = false;
      } else {
        const yaw = computeYaw(lm);
        const pitch = computePitch(lm);

        // Guard: a degenerate eye socket (zero width/height in landmark space) can
        // surface NaN/Infinity here. Letting that through poisons the eye bone
        // rotation, which propagates NaN quaternions through the whole scene graph.
        if (Number.isFinite(yaw) && Number.isFinite(pitch)) {
          const sign = mirror ? -1 : 1;
          buffer.current.yaw = sign * yaw;
          buffer.current.pitch = pitch;
          buffer.current.lastUpdate = performance.now();
          buffer.current.faceDetected = true;
        } else {
          buffer.current.faceDetected = false;
        }
      }

      // ── Expression block (path-separated from iris) ──────────────────────
      // Independent stale clock: a 478-landmark shortfall above does not
      // suppress blendshape mirroring, and a blendshape miss here does not
      // touch the iris fields written above. Same defensive shape as Phase 2.
      const blendshapes = result.faceBlendshapes;
      if (blendshapes && blendshapes.length > 0) {
        const categories = blendshapes[0].categories;
        if (categories && categories.length > 0) {
          let jawOpen = 0;
          let smileLeft = 0;
          let smileRight = 0;
          let sawJawOpen = false;
          let sawSmileLeft = false;
          let sawSmileRight = false;
          for (const cat of categories) {
            const name = cat.categoryName;
            const score = cat.score;
            if (name === 'jawOpen') {
              jawOpen = score;
              sawJawOpen = true;
            } else if (name === 'mouthSmileLeft') {
              smileLeft = score;
              sawSmileLeft = true;
            } else if (name === 'mouthSmileRight') {
              smileRight = score;
              sawSmileRight = true;
            }
          }
          // Average per Molly directive 2026-06-20 — stable over honest asymmetry.
          // If only one side reported, use it; if neither reported, leave NaN
          // and let the finiteness guard below skip the write so the stale
          // clock catches it downstream.
          const smileAvg =
            sawSmileLeft && sawSmileRight
              ? (smileLeft + smileRight) / 2
              : sawSmileLeft
                ? smileLeft
                : sawSmileRight
                  ? smileRight
                  : NaN;
          const jaw = sawJawOpen ? jawOpen : NaN;

          // NaN/Infinity guard + [0,1] clamp (blendshape semantic range).
          if (Number.isFinite(jaw) && Number.isFinite(smileAvg)) {
            buffer.current.expressionOverrides.jawOpen = clamp(jaw, 0, 1);
            buffer.current.expressionOverrides.mouthSmileLeft = clamp(
              smileAvg,
              0,
              1
            );
            buffer.current.expressionLastUpdate = performance.now();
          }
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      ready.current = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (landmarker) landmarker.close();
    };
  }, [enabled, videoWidth, videoHeight, mirror]);

  return { buffer, ready, error };
}

// ── Gaze geometry helpers ──

interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Compute horizontal gaze (yaw) as the iris center's offset from the eye
 * socket midpoint, normalized to eye width, averaged across both eyes,
 * scaled into the eye bone's safe rotation range.
 */
function computeYaw(lm: Landmark[]): number {
  const leftSocketMidX = (lm[LEFT_EYE_INNER].x + lm[LEFT_EYE_OUTER].x) / 2;
  const leftSocketWidth = Math.abs(lm[LEFT_EYE_INNER].x - lm[LEFT_EYE_OUTER].x);
  const leftIrisOffset = lm[LEFT_IRIS_CENTER].x - leftSocketMidX;
  const leftNormalized =
    leftSocketWidth > 1e-4 ? leftIrisOffset / (leftSocketWidth / 2) : 0;

  const rightSocketMidX = (lm[RIGHT_EYE_INNER].x + lm[RIGHT_EYE_OUTER].x) / 2;
  const rightSocketWidth = Math.abs(
    lm[RIGHT_EYE_INNER].x - lm[RIGHT_EYE_OUTER].x
  );
  const rightIrisOffset = lm[RIGHT_IRIS_CENTER].x - rightSocketMidX;
  const rightNormalized =
    rightSocketWidth > 1e-4 ? rightIrisOffset / (rightSocketWidth / 2) : 0;

  const avg = (leftNormalized + rightNormalized) / 2;
  return clamp(avg, -1, 1) * MAX_YAW;
}

function computePitch(lm: Landmark[]): number {
  const leftSocketMidY = (lm[LEFT_EYE_TOP].y + lm[LEFT_EYE_BOTTOM].y) / 2;
  const leftSocketHeight = Math.abs(lm[LEFT_EYE_TOP].y - lm[LEFT_EYE_BOTTOM].y);
  const leftIrisOffset = lm[LEFT_IRIS_CENTER].y - leftSocketMidY;
  const leftNormalized =
    leftSocketHeight > 1e-4 ? leftIrisOffset / (leftSocketHeight / 2) : 0;

  const rightSocketMidY = (lm[RIGHT_EYE_TOP].y + lm[RIGHT_EYE_BOTTOM].y) / 2;
  const rightSocketHeight = Math.abs(
    lm[RIGHT_EYE_TOP].y - lm[RIGHT_EYE_BOTTOM].y
  );
  const rightIrisOffset = lm[RIGHT_IRIS_CENTER].y - rightSocketMidY;
  const rightNormalized =
    rightSocketHeight > 1e-4 ? rightIrisOffset / (rightSocketHeight / 2) : 0;

  const avg = (leftNormalized + rightNormalized) / 2;
  return clamp(avg, -1, 1) * MAX_PITCH;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
