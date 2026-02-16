'use client';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase/auth/use-user';
import { VoiceActivityDetector } from '@/ai/tools/voice-activity-detection';

export type VoiceCommandResult = {
  recognized: boolean;
  transcription: string;
  response: string;
  intent: string;
  confidence: number;
};

export function VoiceControl({
  onVoiceCommand,
}: {
  onVoiceCommand: (result: VoiceCommandResult) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isListeningRef = useRef(false);
  const isProcessingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechActiveRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastResponseRef = useRef<string | null>(null);
  const { toast } = useToast();
  const { user } = useUser();

  const resetSessionTimeout = () => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
    sessionTimeoutRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        stopListening();
        toast({
          title: 'Listening ended',
          description: 'Voice session timed out due to inactivity.',
        });
      }
    }, 60000);
  };

  const convertToWavDataUrl = async (audioBlob: Blob): Promise<string> => {
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();

    try {
      const decoded = await audioContext.decodeAudioData(audioBuffer);
      const wavBuffer = encodeWav(decoded);
      const wavBase64 = arrayBufferToBase64(wavBuffer);
      return `data:audio/wav;base64,${wavBase64}`;
    } finally {
      audioContext.close();
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const encodeWav = (audioBuffer: AudioBuffer): ArrayBuffer => {
    const channelCount = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = channelCount * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const channels: Float32Array[] = [];
    for (let channel = 0; channel < channelCount; channel += 1) {
      channels.push(audioBuffer.getChannelData(channel));
    }

    let offset = 44;
    for (let i = 0; i < length; i += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }

    return buffer;
  };

  const writeString = (view: DataView, offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  const pickMimeType = () => {
    const preferredTypes = [
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/webm',
    ];

    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return null;
  };

  const submitAudioBlob = async (audioBlob: Blob) => {
    isProcessingRef.current = true;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      let base64Audio = reader.result as string | null;
      if (!base64Audio) {
        toast({
          variant: 'destructive',
          title: 'Audio Processing Failed',
          description: 'No audio data was captured. Please try again.',
        });
        setIsProcessing(false);
        return;
      }
      try {
        // Normalize to WAV/PCM for consistent transcription support.
        base64Audio = await convertToWavDataUrl(audioBlob);
      } catch (conversionError) {
        console.warn(
          '[VoiceControl] WAV conversion failed, falling back to source format:',
          conversionError
        );
      }
      try {
        if (!user) {
          toast({
            variant: 'destructive',
            title: 'Not Authenticated',
            description: 'Please sign in to use voice interaction.',
          });
          setIsProcessing(false);
          return;
        }

        const response = await fetch('/api/voice/interact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioData: base64Audio,
            userId: user.uid,
            synthesizeSpeech: false,
            lastResponse: lastResponseRef.current ?? undefined,
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        const rawText = await response.text();
        let data: any = null;

        if (contentType.includes('application/json') && rawText.trim()) {
          try {
            data = JSON.parse(rawText);
          } catch (parseError) {
            console.error(
              '[VoiceControl] JSON parse error:',
              parseError,
              'Response status:',
              response.status
            );
          }
        } else if (!contentType.includes('application/json')) {
          console.warn('[VoiceControl] Non-JSON response:', rawText);
        }

        if (!data) {
          toast({
            variant: 'destructive',
            title: 'Voice Processing Error',
            description: 'Unexpected server response. Please try again.',
          });
          setIsProcessing(false);
          return;
        }

        if (!response.ok || !data?.success) {
          toast({
            variant: 'destructive',
            title: 'Voice Processing Failed',
            description: data?.error || 'Unexpected server response.',
          });
          return;
        }

        const result = {
          recognized: !!data.result?.recognized,
          transcription: data.result?.transcription || '',
          response: data.result?.response || '',
          intent: data.result?.intent || 'unknown',
          confidence: data.result?.metadata?.confidence ?? 0,
        } as VoiceCommandResult;

        if (result.response) {
          lastResponseRef.current = result.response;
        }

        if (result.recognized && result.transcription) {
          onVoiceCommand(result);
        } else {
          toast({
            variant: 'destructive',
            title: 'Voice Not Recognized',
            description: result.response || 'Could not understand audio.',
          });
        }
      } catch (error) {
        console.error('Voice interaction error:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Could not process the voice command.';
        toast({
          variant: 'destructive',
          title: 'Voice Processing Failed',
          description: errorMessage,
        });
      } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    };
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      toast({
        variant: 'destructive',
        title: 'Audio Processing Failed',
        description: 'Failed to read audio data',
      });
      isProcessingRef.current = false;
      setIsProcessing(false);
    };
  };

  const startSegmentRecording = (stream: MediaStream) => {
    if (mediaRecorderRef.current?.state === 'recording') return;

    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];
    setIsRecording(true);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      setIsRecording(false);
      if (audioChunksRef.current.length === 0) {
        return;
      }

      const audioBlob = new Blob(audioChunksRef.current, {
        type: mimeType || 'audio/webm',
      });
      await submitAudioBlob(audioBlob);
      if (isListeningRef.current) {
        stopListening();
      }
    };

    recorder.start();
  };

  const stopSegmentRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const stopListening = (suppressStateUpdate = false) => {
    isListeningRef.current = false;
    if (!suppressStateUpdate) {
      setIsListening(false);
    }
    speechActiveRef.current = false;
    if (frameTimerRef.current) {
      clearTimeout(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
    stopSegmentRecording();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    vadRef.current = null;
  };

  const processAudioFrames = () => {
    if (!isListeningRef.current || !analyserRef.current || !vadRef.current) {
      return;
    }

    const analyser = analyserRef.current;
    const vad = vadRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const tick = () => {
      if (!isListeningRef.current || !analyserRef.current || !vadRef.current) {
        return;
      }

      analyserRef.current.getFloatTimeDomainData(dataArray);
      const result = vad.processFrame(dataArray);

      if (
        result.isSpeaking &&
        !speechActiveRef.current &&
        !isProcessingRef.current &&
        streamRef.current
      ) {
        speechActiveRef.current = true;
        resetSessionTimeout();
        startSegmentRecording(streamRef.current);
      }

      if (speechActiveRef.current && vad.isTimeoutExceeded()) {
        speechActiveRef.current = false;
        stopSegmentRecording();
        vad.stopSession();
        vad.startSession();
        resetSessionTimeout();
      }

      frameTimerRef.current = setTimeout(tick, 20);
    };

    tick();
  };

  const startListening = async () => {
    if (isListeningRef.current || isProcessingRef.current) return;
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Not Authenticated',
        description: 'Please sign in to use voice interaction.',
      });
      return;
    }

    if (!('MediaRecorder' in window)) {
      toast({
        variant: 'destructive',
        title: 'Microphone Unsupported',
        description: 'This browser does not support voice recording.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      vadRef.current = new VoiceActivityDetector({
        autoCalibrate: true,
      });
      vadRef.current.startSession();

      isListeningRef.current = true;
      setIsListening(true);
      resetSessionTimeout();
      processAudioFrames();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description:
          'Please enable microphone permissions in your browser settings.',
      });
      stopListening(true);
    }
  };

  useEffect(() => {
    return () => {
      stopListening(true);
    };
  }, []);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  return (
    <Button
      variant={isListening ? 'destructive' : 'outline'}
      size="icon"
      onClick={() => (isListening ? stopListening() : startListening())}
      disabled={isProcessing && !isListening}
      title={isListening ? 'Stop Listening' : 'Start Listening'}
    >
      {isProcessing ? (
        <div className="animate-pulse h-2 w-2 bg-primary rounded-full"></div>
      ) : isListening ? (
        <Square className="h-4 w-4 fill-current text-white" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      <span className="sr-only">
        {isListening ? 'Stop Listening' : 'Start Listening'}
      </span>
    </Button>
  );
}
