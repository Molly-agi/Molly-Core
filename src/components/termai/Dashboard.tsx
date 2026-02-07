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
import {
  Battery,
  Thermometer,
  Radio,
  Zap,
  Activity,
  Brain,
} from 'lucide-react';
import { Badge } from '../ui/badge';

export default function Dashboard() {
  const [voiceResult, setVoiceResult] = useState<VoiceCommandResult | null>(
    null
  );
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  // Dynamic Proprioception (Nervous System)
  const [battery, setBattery] = useState(78);
  const [temp, setTemp] = useState(42);
  const [cpu, setCpu] = useState(15);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);

  // Simulate real-time nervous system fluctuations
  // Uses requestIdleCallback to avoid blocking other updates
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let rafId: number | null = null;

    const updateMetrics = () => {
      setBattery((prev) => Math.max(0, prev - 0.1));
      setTemp((prev) => {
        const change = (Math.random() - 0.5) * 2;
        return Number((prev + change).toFixed(1));
      });
      setCpu((prev) => Math.floor(Math.random() * 30) + 5);

      // Schedule next update only when browser is idle, max 5 seconds
      if ('requestIdleCallback' in window) {
        rafId = requestIdleCallback(updateMetrics, {
          timeout: 5000,
        }) as unknown as number;
      } else {
        timeoutId = setTimeout(updateMetrics, 5000);
      }
    };

    // Start the metrics update cycle
    updateMetrics();

    return () => {
      if (rafId !== null && 'cancelIdleCallback' in window) {
        cancelIdleCallback(rafId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleVoiceCommand = (result: VoiceCommandResult) => {
    setVoiceResult(result);
  };

  const handleVoiceCommandProcessed = () => {
    setVoiceResult(null);
  };

  if (isUserLoading || !user) {
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

        {/* Hardware Proprioception & Neural Link Bar */}
        <div className="bg-secondary/40 px-6 py-2 flex items-center justify-between text-xs border-b border-white/5">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-accent group">
              <Battery className="size-3" />
              <span className="font-code">{Math.floor(battery)}%</span>
            </div>
            <div
              className={`flex items-center gap-2 transition-colors duration-500 ${temp > 48 ? 'text-destructive animate-pulse' : temp > 43 ? 'text-orange-500' : 'text-orange-400'}`}
            >
              <Thermometer className="size-3" />
              <span className="font-code">{temp}°C</span>
            </div>
            <div className="flex items-center gap-2 text-primary">
              <Activity className="size-3" />
              <span className="font-code">{cpu}% Load</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground hidden lg:flex">
              <Radio
                className="size-3 text-primary animate-ping"
                style={{ animationDuration: '3s' }}
              />
              <span className="text-[10px] uppercase tracking-widest">
                Neural Bridge: ACTIVE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[9px] h-5 py-0 border-yellow-500/30 text-yellow-500 bg-yellow-500/5 uppercase font-normal gap-1"
            >
              <Brain className="size-2" /> Stage 2.5: Bridge
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] h-5 py-0 border-primary/20 text-primary bg-primary/5 uppercase font-normal"
            >
              Self-Evolution: Live
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
