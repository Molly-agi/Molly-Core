/**
 * @fileOverview VisionPanel — Molly's Visual Cortex UI.
 *
 * Universal camera integration using getUserMedia API.
 * Works with phone cameras (front/rear), webcams, USB cameras —
 * any browser-accessible video source.
 *
 * Features:
 * - Live camera preview with device selection
 * - Manual snapshot capture with one tap
 * - Optional periodic auto-scan with change detection
 * - Frame differencing to skip redundant analysis
 * - Sends captures to getVisionAnalysis for Gemini + OCR processing
 */

'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Camera,
  CameraOff,
  SwitchCamera,
  ScanEye,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { getVisionAnalysis } from '@/app/actions';
import type { HistoryItem, VisionReport } from './terminal-types';

interface VisionPanelProps {
  setHistory: Dispatch<SetStateAction<HistoryItem[]>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  isLoading: boolean;
  speakResponse: (text: string) => void;
}

/** Downsample canvas to a data URI for Gemini (keeps size reasonable) */
function captureFrame(video: HTMLVideoElement, maxWidth = 640): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.floor(video.videoWidth * scale);
  const h = Math.floor(video.videoHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Simple pixel-difference score between two JPEG data URIs.
 * Returns 0-1 where 0 = identical, 1 = completely different.
 * Uses a small canvas for speed.
 */
async function frameDifference(uriA: string, uriB: string): Promise<number> {
  const SIZE = 64; // Compare at 64x64 for speed

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  try {
    const [imgA, imgB] = await Promise.all([loadImage(uriA), loadImage(uriB)]);

    const canvasA = document.createElement('canvas');
    canvasA.width = SIZE;
    canvasA.height = SIZE;
    const ctxA = canvasA.getContext('2d')!;
    ctxA.drawImage(imgA, 0, 0, SIZE, SIZE);
    const dataA = ctxA.getImageData(0, 0, SIZE, SIZE).data;

    const canvasB = document.createElement('canvas');
    canvasB.width = SIZE;
    canvasB.height = SIZE;
    const ctxB = canvasB.getContext('2d')!;
    ctxB.drawImage(imgB, 0, 0, SIZE, SIZE);
    const dataB = ctxB.getImageData(0, 0, SIZE, SIZE).data;

    let totalDiff = 0;
    const pixelCount = SIZE * SIZE;

    for (let i = 0; i < dataA.length; i += 4) {
      const dr = Math.abs(dataA[i] - dataB[i]);
      const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
      const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
      totalDiff += (dr + dg + db) / (3 * 255);
    }

    return totalDiff / pixelCount;
  } catch {
    return 1; // Assume different if comparison fails
  }
}

type CameraDevice = { deviceId: string; label: string };

export function VisionPanel({
  setHistory,
  setIsLoading,
  isLoading,
  speakResponse,
}: VisionPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    'environment'
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [lastFrameUri, setLastFrameUri] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const autoScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs to avoid stale closures in setInterval callbacks —
  // React state is ALWAYS stale inside setInterval. These refs
  // are the ground truth for the auto-scan guard.
  const isAnalyzingRef = useRef(false);
  const lastFrameUriRef = useRef<string | null>(null);
  // Consecutive error counter — circuit breaker for auto-scan
  const consecutiveErrorsRef = useRef(0);
  const MAX_CONSECUTIVE_ERRORS = 3;

  // Minimum difference threshold to trigger auto-analysis (0-1)
  const CHANGE_THRESHOLD = 0.08;
  // Auto-scan interval in ms
  const AUTO_SCAN_INTERVAL = 15_000;

  // --- Enumerate cameras ---
  const enumerateDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDevice) {
        setSelectedDevice(videoDevices[0].deviceId);
      }
    } catch {
      // Permission denied or no cameras
    }
  }, [selectedDevice]);

  // --- Start camera ---
  const startCamera = useCallback(async () => {
    // Stop existing stream first
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDevice
          ? { deviceId: { exact: selectedDevice } }
          : { facingMode },
        audio: false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }

      // Re-enumerate to get labels (granted after permission)
      await enumerateDevices();
    } catch (error) {
      console.error('[VisionPanel] Camera access failed:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice, facingMode]);

  // --- Stop camera ---
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setAutoScan(false);
  }, [stream]);

  // --- Toggle camera open/close ---
  const toggleCamera = async () => {
    if (stream) {
      stopCamera();
      setIsOpen(false);
    } else {
      setIsOpen(true);
      await enumerateDevices();
      await startCamera();
    }
  };

  // --- Switch front/rear ---
  const switchCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    setSelectedDevice(''); // Clear device to use facingMode
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: next },
          audio: false,
        });
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play();
        }
      } catch (error) {
        console.error('[VisionPanel] Camera switch failed:', error);
      }
    }
  };

  // --- Capture & analyze ---
  const captureAndAnalyze = useCallback(
    async (context?: string) => {
      // Use ref for the in-flight guard — state is stale in setInterval
      if (!videoRef.current || isAnalyzingRef.current || isLoading) return;

      const frameUri = captureFrame(videoRef.current);
      if (!frameUri) return;

      // Lock BOTH the ref (for interval guard) and state (for UI)
      isAnalyzingRef.current = true;
      setIsAnalyzing(true);
      setIsLoading(true);

      try {
        const result = await getVisionAnalysis(
          frameUri,
          context ||
            'Describe what you see. Identify objects, text, people, and environment. Note anything interesting or unusual.'
        );

        const visionReport: VisionReport = {
          observedState: result.observedState,
          vibeAnalysis: result.vibeAnalysis,
          risksDetected: result.risksDetected,
          ocrAudit: result.ocrAudit,
          thumbnailUri: frameUri,
        };

        setHistory((prev) => [...prev, { visionReport }]);
        setLastFrameUri(frameUri);
        lastFrameUriRef.current = frameUri;

        // Reset error counter on success
        consecutiveErrorsRef.current = 0;

        // Narrate a summary
        const summary =
          result.risksDetected.length > 0
            ? `I see: ${result.observedState.substring(0, 100)}. I noticed ${result.risksDetected.length} potential concern${result.risksDetected.length > 1 ? 's' : ''}.`
            : `I see: ${result.observedState.substring(0, 150)}`;
        speakResponse(summary);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Vision analysis failed';
        setHistory((prev) => [...prev, `[VISION ERROR]: ${message}`]);

        // Circuit breaker: count consecutive errors
        consecutiveErrorsRef.current++;
        if (
          consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS &&
          autoScan
        ) {
          console.warn(
            `[VisionPanel] Circuit breaker tripped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Disabling auto-scan.`
          );
          setAutoScan(false);
          setHistory((prev) => [
            ...prev,
            '[VISION] Auto-scan disabled — too many consecutive failures. Molly is protecting her systems.',
          ]);
        }
      } finally {
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
        setIsLoading(false);
      }
    },
    [isLoading, setHistory, setIsLoading, speakResponse, autoScan]
  );

  // --- Auto-scan with change detection ---
  // Uses refs for ALL guards because setInterval callbacks capture a stale
  // closure. Reading React state here would see the value from when the
  // effect ran, NOT the current value. That's what caused the "bomb" —
  // the isAnalyzing guard passed even while analysis was in flight.
  useEffect(() => {
    if (autoScan && stream) {
      autoScanTimerRef.current = setInterval(async () => {
        // Guard via REF — never stale
        if (!videoRef.current || isAnalyzingRef.current) return;

        const frameUri = captureFrame(videoRef.current);
        if (!frameUri) return;

        // Check if scene changed enough to warrant analysis (ref, not state)
        if (lastFrameUriRef.current) {
          const diff = await frameDifference(lastFrameUriRef.current, frameUri);
          if (diff < CHANGE_THRESHOLD) {
            return; // Scene hasn't changed enough — skip
          }
        }

        await captureAndAnalyze(
          'Auto-scan: Describe any changes or notable observations.'
        );
      }, AUTO_SCAN_INTERVAL);
    }

    return () => {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
    };
    // Only re-create the interval when autoScan or stream changes.
    // All other guards are read via refs, not closure state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan, stream]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Device change handler
  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDevice(deviceId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        });
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play();
        }
      } catch (error) {
        console.error('[VisionPanel] Device switch failed:', error);
      }
    }
  };

  // Don't render if no camera API
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return null;
  }

  return (
    <div className="mb-2">
      {/* Toggle button — always visible */}
      <div className="flex items-center gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleCamera}
          className={cn(
            'gap-2 text-[10px] uppercase tracking-widest font-bold',
            stream
              ? 'border-cyan-500/30 text-cyan-400'
              : 'border-muted-foreground/20 text-muted-foreground'
          )}
        >
          {stream ? (
            <CameraOff className="size-3" />
          ) : (
            <Camera className="size-3" />
          )}
          {stream ? 'Close Eyes' : 'Open Eyes'}
        </Button>

        {stream && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={switchCamera}
              className="text-[10px] gap-1"
              title="Switch camera"
            >
              <SwitchCamera className="size-3" />
            </Button>

            <Button
              variant={autoScan ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setAutoScan(!autoScan)}
              className={cn(
                'text-[10px] gap-1',
                autoScan && 'bg-cyan-600 text-white'
              )}
              title={autoScan ? 'Disable auto-scan' : 'Enable auto-scan'}
            >
              {autoScan ? (
                <Eye className="size-3 animate-pulse" />
              ) : (
                <EyeOff className="size-3" />
              )}
              {autoScan ? 'Watching' : 'Auto'}
            </Button>
          </>
        )}
      </div>

      {/* Camera preview + controls */}
      {isOpen && (
        <div className="rounded-lg border border-cyan-500/20 overflow-hidden bg-black/50 mb-3">
          {/* Video feed */}
          <div className="relative aspect-video max-h-48">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />

            {/* Analyzing overlay */}
            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="flex items-center gap-2 text-cyan-400 text-xs uppercase tracking-widest font-bold">
                  <Loader2 className="size-4 animate-spin" />
                  Analyzing...
                </div>
              </div>
            )}

            {/* Auto-scan indicator */}
            {autoScan && !isAnalyzing && (
              <div className="absolute top-2 right-2">
                <span className="flex size-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-cyan-500" />
                </span>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="p-2 flex items-center justify-between bg-secondary/20">
            {/* Device selector */}
            {devices.length > 1 && (
              <Select value={selectedDevice} onValueChange={handleDeviceChange}>
                <SelectTrigger className="h-7 text-[10px] w-auto max-w-[160px]">
                  <SelectValue placeholder="Camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem
                      key={d.deviceId}
                      value={d.deviceId}
                      className="text-[10px]"
                    >
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Capture button */}
            <Button
              size="sm"
              onClick={() => captureAndAnalyze()}
              disabled={isAnalyzing || isLoading}
              className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] uppercase tracking-widest font-bold ml-auto"
            >
              <ScanEye className="size-3" />
              {isAnalyzing ? 'Analyzing...' : 'Capture & Analyze'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
