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
import { HiddenAdminPanel } from './HiddenAdminPanel';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { VoiceCommandResult } from './VoiceControl';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Skeleton } from '../ui/skeleton';
import { Battery, Thermometer, Radio, Activity, Brain } from 'lucide-react';
import { Badge } from '../ui/badge';

export default function Dashboard() {
  const [voiceResult, setVoiceResult] = useState<VoiceCommandResult | null>(
    null
  );
  const lastResponseRef = useRef<string | null>(null);
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();
  const [authRetryAttempt, setAuthRetryAttempt] = useState(0);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [sleepState, setSleepState] = useState<{
    isSleeping: boolean;
    safeword: string;
  } | null>(null);
  const [authStalled, setAuthStalled] = useState(false);
  const [forceContinue, setForceContinue] = useState(false);

  // Dynamic Proprioception (Nervous System)
  const [battery, setBattery] = useState(78);
  const [temp, setTemp] = useState(42);
  const [cpu, setCpu] = useState(15);
  const hardwareState = useMemo(
    () => ({
      batteryLevel: Math.floor(battery),
      temperature: temp,
      cpuUsage: cpu,
    }),
    [battery, temp, cpu]
  );

  // Redirect to login if not authenticated (but allow in dev mode)
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    if (!isUserLoading && !user && !isDev) {
      // Add a small delay to prevent rapid redirects
      const timeout = setTimeout(() => {
        router.replace('/login');
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [user, isUserLoading, router]);

  // Auth stall detection - only runs timeout when loading
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';

    // Only set up stall timeout if we're actually loading (in dev)
    if (!isUserLoading || !isDev) {
      return;
    }

    const timeout = setTimeout(() => {
      setAuthStalled(true);
    }, 12000);

    return () => {
      clearTimeout(timeout);
      // Reset stalled state when loading completes (cleanup runs on re-render)
      setAuthStalled(false);
    };
  }, [isUserLoading]);

  // Handle authentication errors with retry
  useEffect(() => {
    if (userError && authRetryAttempt < 3) {
      console.warn('[Dashboard] Auth error detected, will retry:', userError);
      const timeout = setTimeout(() => {
        setAuthRetryAttempt((prev) => prev + 1);
        window.location.reload();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [userError, authRetryAttempt]);

  // Simulate real-time nervous system fluctuations
  // THERMAL FIX: Reduced frequency to prevent cascade (30s intervals)
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let mounted = true;

    const updateMetrics = () => {
      // Safety check: only update if component is still mounted
      if (!mounted) return;

      setBattery((prev) => Math.max(0, prev - 0.05));
      setTemp((prev) => {
        const change = (Math.random() - 0.5) * 1;
        return Number(Math.min(50, Math.max(38, prev + change)).toFixed(1));
      });
      setCpu(() => Math.floor(Math.random() * 20) + 5);
    };

    // Update every 60 seconds — cosmetic only, doesn't need to be frequent
    intervalId = setInterval(updateMetrics, 60000);

    return () => {
      mounted = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchSleepState = async () => {
      try {
        const response = await fetch('/api/safety/sleep-state');
        if (!response.ok) return;
        const data = await response.json();
        if (mounted) {
          setSleepState({
            isSleeping: !!data.isSleeping,
            safeword: data.safeword || 'pineapple van',
          });
        }
      } catch {
        // Ignore polling errors.
      }
    };

    fetchSleepState();
    // 30s poll — 5s was excessive for an in-memory state check
    const intervalId = setInterval(fetchSleepState, 30000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const handleVoiceCommand = useCallback((result: VoiceCommandResult) => {
    setVoiceResult(result);
  }, []);

  const handleVoiceCommandProcessed = useCallback(() => {
    setVoiceResult(null);
  }, []);

  const adminUids = (process.env.NEXT_PUBLIC_ADMIN_UIDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const isDev = process.env.NODE_ENV === 'development';
  const isAdmin = isDev || (!!user && adminUids.includes(user.uid));

  if (isUserLoading && !forceContinue) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-64 space-y-4">
          <div className="text-center mb-4">
            <p className="text-sm text-muted-foreground">
              Initializing Molly...
            </p>
            {authStalled && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-yellow-500">
                  Auth is taking longer than expected.
                </p>
                <button
                  onClick={() => setForceContinue(true)}
                  className="px-3 py-1 text-[10px] uppercase tracking-widest border border-yellow-500/50 text-yellow-500 rounded"
                >
                  Continue without auth
                </button>
              </div>
            )}
            {authRetryAttempt > 0 && (
              <p className="text-xs text-yellow-500 mt-2">
                Retry attempt {authRetryAttempt}/3
              </p>
            )}
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </div>
    );
  }

  // Show error state if authentication failed after retries
  if (userError && authRetryAttempt >= 3) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-96 space-y-4 p-6 border border-destructive/50 rounded-lg">
          <h2 className="text-lg font-semibold text-destructive">
            Authentication Error
          </h2>
          <p className="text-sm text-muted-foreground">
            Unable to authenticate after multiple attempts. Please check your
            Firebase configuration.
          </p>
          <p className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded">
            {userError.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Allow access in development mode even without auth
  if (!isDev && !user) {
    return null; // Will redirect via useEffect
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
        <Header
          onVoiceCommand={handleVoiceCommand}
          onAdminUnlock={() => setIsAdminPanelOpen(true)}
          lastResponseRef={lastResponseRef}
          hardwareState={hardwareState}
        />

        {sleepState?.isSleeping && (
          <div className="bg-destructive/20 text-destructive border-b border-destructive/30 px-6 py-2 text-xs">
            Sleep mode active. Say {sleepState.safeword} to wake Molly.
          </div>
        )}

        <HiddenAdminPanel
          open={isAdminPanelOpen}
          onOpenChange={setIsAdminPanelOpen}
          isAdmin={isAdmin}
          userId={user?.uid ?? null}
        />

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
            lastResponseRef={lastResponseRef}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
