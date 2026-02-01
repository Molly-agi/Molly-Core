
'use client';

import { useState, useRef, useTransition } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type RecordingStatus = 'idle' | 'recording';

export function VoiceControl({ voiceAction }: { voiceAction: (payload: FormData) => void }) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const { pending } = useFormStatus();
  const { toast } = useToast();
  const [isVoicePending, startTransition] = useTransition();

  const startRecording = async () => {
    if (status === 'recording') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };
      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'command.webm');
        startTransition(() => {
          voiceAction(formData);
        });
        audioChunks.current = [];
        stream.getTracks().forEach(track => track.stop());
        setStatus('idle');
      };
      mediaRecorder.current.start();
      setStatus('recording');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Error',
        description: 'Could not access microphone. Please check permissions.',
      });
    }
  };

  const stopRecording = () => {
    if (status === 'recording' && mediaRecorder.current) {
      mediaRecorder.current.stop();
    }
  };

  const handleMicClick = () => {
    if (status === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={handleMicClick}
      disabled={pending || isVoicePending}
      className={cn(
        'transition-colors',
        status === 'recording' && !isVoicePending && 'text-red-500 bg-red-500/10 hover:bg-red-500/20 hover:text-red-500',
      )}
    >
      {pending || isVoicePending ? (
        <Loader2 className="animate-spin" />
      ) : status === 'recording' ? (
        <Mic className="animate-pulse" />
      ) : (
        <Mic />
      )}
      <span className="sr-only">{status === 'recording' ? 'Stop recording' : 'Start recording'}</span>
    </Button>
  );
}
