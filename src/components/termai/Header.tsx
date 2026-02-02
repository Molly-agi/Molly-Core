'use client';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { VoiceControl, type VoiceCommandResult } from './VoiceControl';

export function Header({
  onVoiceCommand,
}: {
  onVoiceCommand: (result: VoiceCommandResult) => void;
}) {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
      <SidebarTrigger />
      <div className="flex-1">
        <h1 className="font-semibold text-lg">Molly</h1>
      </div>
      <VoiceControl onVoiceCommand={onVoiceCommand} />
    </header>
  );
}
