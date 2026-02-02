'use client';
import { Button } from '@/components/ui/button';
import { Mic } from 'lucide-react';
import { useState } from 'react';

export function VoiceControl() {
  const [isRecording, setIsRecording] = useState(false);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };
  
  return (
    <Button
      variant={isRecording ? 'destructive' : 'outline'}
      size="icon"
      onClick={toggleRecording}
    >
      <Mic className="h-4 w-4" />
      <span className="sr-only">{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
    </Button>
  );
}
