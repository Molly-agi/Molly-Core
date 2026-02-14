'use client';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase/auth/use-user';

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
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();
  const { user } = useUser();

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

  const handleStartRecording = async () => {
    if (isRecording || isProcessing) return;
    try {
      const mimeType = pickMimeType();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      audioChunksRef.current = [];
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        if (audioChunksRef.current.length === 0) {
          toast({
            variant: 'destructive',
            title: 'No Audio Captured',
            description:
              'Try again and speak after you see the recording icon.',
          });
          return;
        }

        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          let base64Audio = reader.result as string;
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
              }),
            });

            let data;
            try {
              data = await response.json();
            } catch (parseError) {
              console.error(
                '[VoiceControl] JSON parse error:',
                parseError,
                'Response status:',
                response.status
              );
              toast({
                variant: 'destructive',
                title: 'Voice Processing Error',
                description:
                  'Failed to parse voice response. Please try again.',
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
          setIsProcessing(false);
        };
      };
      recorder.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description:
          'Please enable microphone permissions in your browser settings.',
      });
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const isLoading = isRecording || isProcessing;

  return (
    <Button
      variant={isRecording ? 'destructive' : 'outline'}
      size="icon"
      onClick={isRecording ? handleStopRecording : handleStartRecording}
      disabled={isProcessing}
      title={isRecording ? 'Stop Recording' : 'Start Recording'}
    >
      {isProcessing ? (
        <div className="animate-pulse h-2 w-2 bg-primary rounded-full"></div>
      ) : isRecording ? (
        <Square className="h-4 w-4 fill-current text-white" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      <span className="sr-only">
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </span>
    </Button>
  );
}
