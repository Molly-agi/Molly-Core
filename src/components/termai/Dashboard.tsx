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
