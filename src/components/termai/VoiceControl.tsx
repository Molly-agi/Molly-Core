'use client';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { useState, useRef } from 'react';
import { getVoiceCommand } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

export type VoiceCommandResult = { prompt: string; command: string };

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

  const handleStartRecording = async () => {
    if (isRecording || isProcessing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        if (audioChunksRef.current.length === 0) return;

        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          try {
            const result = await getVoiceCommand(base64Audio);
            if (result.command && !result.command.startsWith('Error:')) {
              onVoiceCommand(result);
            } else {
              toast({
                variant: 'destructive',
                title: 'Voice Command Error',
                description: result.command || 'Could not understand audio.',
              });
            }
          } catch (error) {
            console.error('Transcription error:', error);
            toast({
              variant: 'destructive',
              title: 'Transcription Failed',
              description: 'Could not process the voice command.',
            });
          } finally {
            setIsProcessing(false);
          }
        };
      };
      recorder.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description: 'Please enable microphone permissions in your browser settings.',
      });
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
