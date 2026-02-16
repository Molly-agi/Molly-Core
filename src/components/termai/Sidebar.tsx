'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarHeader, SidebarContent } from '@/components/ui/sidebar';
import {
  Search,
  HeartPulse,
  BrainCircuit,
  Library,
  Activity,
} from 'lucide-react';
import { DiagnosticPanel } from '@/components/DiagnosticPanel';

const AIGuidance = dynamic(
  () => import('./AIGuidance').then((mod) => mod.AIGuidance),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading research...
      </div>
    ),
  }
);

const ToolLibrary = dynamic(
  () => import('./ToolLibrary').then((mod) => mod.ToolLibrary),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading tools...
      </div>
    ),
  }
);

const VisionaryCoachTab = dynamic(
  () => import('./VisionaryCoachTab').then((mod) => mod.VisionaryCoachTab),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading partner...
      </div>
    ),
  }
);

const MemoryViewer = dynamic(
  () => import('./MemoryViewer').then((mod) => mod.MemoryViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading memories...
      </div>
    ),
  }
);

class DiagnosticsErrorBoundary extends React.Component<
  {
    onRetry: () => void;
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[Diagnostics] Load failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>Diagnostics failed to load. Try again.</span>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="rounded border border-muted-foreground/40 px-3 py-1 text-[10px] uppercase tracking-widest"
          >
            Retry Diagnostics
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

class MemoryErrorBoundary extends React.Component<
  {
    onRetry: () => void;
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[MemoryViewer] Load failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>Memory viewer failed to load. Try again.</span>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="rounded border border-muted-foreground/40 px-3 py-1 text-[10px] uppercase tracking-widest"
          >
            Retry Memory
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function TermAISidebar() {
  const [activeTab, setActiveTab] = useState('research');
  const [diagnosticsReady, setDiagnosticsReady] = useState(false);
  const [diagnosticsKey, setDiagnosticsKey] = useState(0);
  const [memoryKey, setMemoryKey] = useState(0);
  const [memoryReady, setMemoryReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDiagnosticsReady(true);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  const handleDiagnosticsRetry = () => {
    setDiagnosticsReady(false);
    setDiagnosticsKey((prev) => prev + 1);
  };

  const handleMemoryRetry = () => {
    setMemoryKey((prev) => prev + 1);
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full flex-col"
      >
        <SidebarHeader className="p-0">
          <TabsList className="sticky top-0 z-10 grid grid-cols-5 bg-sidebar/95 backdrop-blur border-b border-sidebar-border rounded-none h-12">
            <TabsTrigger
              value="research"
              className="gap-2 data-[state=active]:bg-background px-1"
            >
              <Search className="size-3" />
              <span className="hidden lg:inline text-[10px]">Research</span>
            </TabsTrigger>
            <TabsTrigger
              value="tools"
              className="gap-2 data-[state=active]:bg-background px-1"
            >
              <Library className="size-3" />
              <span className="hidden lg:inline text-[10px]">Tools</span>
            </TabsTrigger>
            <TabsTrigger
              value="partner"
              className="gap-2 data-[state=active]:bg-background px-1"
            >
              <HeartPulse className="size-3" />
              <span className="hidden lg:inline text-[10px]">Partner</span>
            </TabsTrigger>
            <TabsTrigger
              value="memory"
              className="gap-2 data-[state=active]:bg-background px-1"
            >
              <BrainCircuit className="size-3" />
              <span className="hidden lg:inline text-[10px]">Memory</span>
            </TabsTrigger>
            <TabsTrigger
              value="diagnostics"
              className="gap-2 data-[state=active]:bg-background px-1"
            >
              <Activity className="size-3" />
              <span className="hidden lg:inline text-[10px]">System</span>
            </TabsTrigger>
          </TabsList>
        </SidebarHeader>
        <SidebarContent className="p-0">
          {activeTab === 'research' && (
            <TabsContent
              value="research"
              className="flex-1 m-0 overflow-hidden"
            >
              <AIGuidance />
            </TabsContent>
          )}
          {activeTab === 'tools' && (
            <TabsContent
              value="tools"
              className="flex-1 m-0 overflow-hidden p-4"
            >
              <ToolLibrary />
            </TabsContent>
          )}
          {activeTab === 'partner' && (
            <TabsContent value="partner" className="flex-1 m-0 overflow-hidden">
              <VisionaryCoachTab />
            </TabsContent>
          )}
          {activeTab === 'memory' && (
            <TabsContent value="memory" className="flex-1 m-0 overflow-hidden">
              {!memoryReady ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
                  <span>Memories load on demand to keep startup fast.</span>
                  <button
                    type="button"
                    onClick={() => setMemoryReady(true)}
                    className="rounded border border-muted-foreground/40 px-3 py-1 text-[10px] uppercase tracking-widest"
                  >
                    Load Memories
                  </button>
                </div>
              ) : (
                <MemoryErrorBoundary onRetry={handleMemoryRetry}>
                  <div key={memoryKey} className="h-full">
                    <MemoryViewer />
                  </div>
                </MemoryErrorBoundary>
              )}
            </TabsContent>
          )}
          {activeTab === 'diagnostics' && (
            <TabsContent
              value="diagnostics"
              className="flex-1 m-0 overflow-hidden p-4"
            >
              {!diagnosticsReady ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
                  <span>Diagnostics are loaded on demand.</span>
                  <button
                    type="button"
                    onClick={() => setDiagnosticsReady(true)}
                    className="rounded border border-muted-foreground/40 px-3 py-1 text-[10px] uppercase tracking-widest"
                  >
                    Load Diagnostics
                  </button>
                </div>
              ) : (
                <DiagnosticsErrorBoundary onRetry={handleDiagnosticsRetry}>
                  <div key={diagnosticsKey} className="h-full">
                    <DiagnosticPanel />
                  </div>
                </DiagnosticsErrorBoundary>
              )}
            </TabsContent>
          )}
        </SidebarContent>
      </Tabs>
    </div>
  );
}
