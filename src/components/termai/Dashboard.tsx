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
import { useState, useEffect } from 'react';
import type { VoiceCommandResult } from './VoiceControl';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Skeleton } from '../ui/skeleton';
import { Battery, Thermometer } from 'lucide-react';
import { Badge } from '../ui/badge';

export default function Dashboard() {
  const [voiceResult, setVoiceResult] = useState<VoiceCommandResult | null>(
    null
  );
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const handleVoiceCommand = (result: VoiceCommandResult) => {
    setVoiceResult(result);
  };

  const handleVoiceCommandProcessed = () => {
    setVoiceResult(null);
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-64 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </div>
    );
  }

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
        
        {/* Hardware Proprioception Bar */}
        <div className="bg-secondary/30 px-6 py-2 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-accent">
            <Battery className="size-3" />
            <span>78%</span>
          </div>
          <div className="flex items-center gap-1 text-destructive">
            <Thermometer className="size-3" />
            <span>42°C</span>
          </div>
          <Badge variant="outline" className="text-[10px] h-4 py-0 border-accent/30 text-accent/70">
            Evolution Engine: Ready
          </Badge>
        </div>

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
