'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVoiceSettings } from '@/contexts/voice-settings';
import { Music } from 'lucide-react';

export function VoiceSelector() {
  const { selectedVoice, setSelectedVoice, availableVoices } =
    useVoiceSettings();

  return (
    <div className="flex items-center gap-2">
      <Music className="h-4 w-4 text-muted-foreground" />
      <Select value={selectedVoice} onValueChange={setSelectedVoice}>
        <SelectTrigger className="w-24 h-8 text-xs">
          <SelectValue placeholder="Voice" />
        </SelectTrigger>
        <SelectContent>
          {availableVoices.map((voice) => (
            <SelectItem key={voice} value={voice} className="text-xs">
              {voice}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
