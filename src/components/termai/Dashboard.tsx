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
import { Battery, Thermometer, Radio, Zap } from 'lucide-react';
import { Badge } from '../ui/badge';

export default function Dashboard() {
  const [voiceResult, setVoiceResult] = useState<VoiceCommandResult | null>(
    null
  );
  const { user, loading } = useUser();
  const router = useRouter();

  // Proprioception Senses (Live Hardware State)
  const [battery, setBattery] = useState(78);
  const [temp, setTemp] = useState(42);

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
        <div className="bg-secondary/40 px-6 py-2 flex items-center justify-between text-xs border-b border-white/5">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-accent group">
              <Battery className="size-3 group-hover:scale-110 transition-transform" />
              <span className="font-code">{battery}%</span>
            </div>
            <div className={`flex items-center gap-2 transition-colors ${temp > 45 ? 'text-destructive animate-pulse' : 'text-orange-400'}`}>
              <Thermometer className="size-3" />
              <span className="font-code">{temp}°C</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground hidden md:flex">
              <Radio className="size-3 text-primary animate-ping" style={{ animationDuration: '3s' }} />
              <span className="text-[10px] uppercase tracking-widest">Neural Bridge Active</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] h-5 py-0 border-yellow-500/30 text-yellow-500 bg-yellow-500/5 uppercase font-normal gap-1">
              <Zap className="size-2" /> Evolution: Stage 2
            </Badge>
            <Badge variant="outline" className="text-[9px] h-5 py-0 border-primary/20 text-primary bg-primary/5 uppercase font-normal">
              Self-Correction: Online
            </Badge>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-secondary/20 via-background to-background">
          <Terminal
            voiceResult={voiceResult}
            onVoiceCommandProcessed={handleVoiceCommandProcessed}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
