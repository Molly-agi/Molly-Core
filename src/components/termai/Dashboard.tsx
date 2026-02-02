'use client';
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { TermAISidebar } from './Sidebar';
import { Header } from './Header';
import Terminal from './Terminal';
import { useState } from 'react';
import type { VoiceCommandResult } from './VoiceControl';

export default function Dashboard() {
  const [voiceResult, setVoiceResult] = useState<VoiceCommandResult | null>(
    null
  );

  const handleVoiceCommand = (result: VoiceCommandResult) => {
    setVoiceResult(result);
  };

  const handleVoiceCommandProcessed = () => {
    setVoiceResult(null);
  };

  return (
    <SidebarProvider>
      <Sidebar
        side="left"
        collapsible="icon"
        className="border-r border-sidebar-border"
      >
        <SidebarContent>
          <TermAISidebar />
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="flex flex-col">
        <Header onVoiceCommand={handleVoiceCommand} />
        <div className="flex-1 p-4 overflow-y-auto">
          <Terminal
            voiceResult={voiceResult}
            onVoiceCommandProcessed={handleVoiceCommandProcessed}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
