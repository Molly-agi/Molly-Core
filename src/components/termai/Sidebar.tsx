'use client';

import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarHeader, SidebarContent } from '@/components/ui/sidebar';
import {
  Search,
  HeartPulse,
  BrainCircuit,
  Library,
  Activity,
} from 'lucide-react';

// ── Lazy-loaded panels ────────────────────────────────────────

const loadingPlaceholder = (label: string) => {
  const Placeholder = () => (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Loading {label}...
    </div>
  );
  Placeholder.displayName = `LoadingPlaceholder(${label})`;
  return Placeholder;
};

const AIGuidance = dynamic(
  () => import('./AIGuidance').then((mod) => mod.AIGuidance),
  { ssr: false, loading: loadingPlaceholder('research') }
);

const ToolLibrary = dynamic(
  () => import('./ToolLibrary').then((mod) => mod.ToolLibrary),
  { ssr: false, loading: loadingPlaceholder('tools') }
);

const VisionaryCoachTab = dynamic(
  () => import('./VisionaryCoachTab').then((mod) => mod.VisionaryCoachTab),
  { ssr: false, loading: loadingPlaceholder('partner') }
);

const MemoryViewer = dynamic(
  () => import('./MemoryViewer').then((mod) => mod.MemoryViewer),
  { ssr: false, loading: loadingPlaceholder('memories') }
);

const DiagnosticPanel = dynamic(
  () =>
    import('@/components/DiagnosticPanel').then((mod) => mod.DiagnosticPanel),
  { ssr: false, loading: loadingPlaceholder('diagnostics') }
);

// ── Shared Error Boundary ─────────────────────────────────────

class PanelErrorBoundary extends React.Component<
  { label: string; onRetry: () => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[${this.props.label}] Load failed`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>{this.props.label} failed to load.</span>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="rounded border border-muted-foreground/40 px-3 py-1 text-[10px] uppercase tracking-widest"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── On-demand loader ──────────────────────────────────────────

function OnDemandPanel({
  label,
  ready,
  onLoad,
  onRetry,
  children,
}: {
  label: string;
  ready: boolean;
  onLoad: () => void;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
        <span>{label} loads on demand to keep startup fast.</span>
        <button
          type="button"
          onClick={onLoad}
          className="rounded border border-muted-foreground/40 px-3 py-1 text-[10px] uppercase tracking-widest"
        >
          Load {label}
        </button>
      </div>
    );
  }

  return (
    <PanelErrorBoundary label={label} onRetry={onRetry}>
      {children}
    </PanelErrorBoundary>
  );
}

// ── Sidebar ───────────────────────────────────────────────────

export function TermAISidebar() {
  const [activeTab, setActiveTab] = useState('research');
  const [memoryReady, setMemoryReady] = useState(false);
  const [memoryKey, setMemoryKey] = useState(0);
  const [diagnosticsReady, setDiagnosticsReady] = useState(false);
  const [diagnosticsKey, setDiagnosticsKey] = useState(0);

  const tabs = [
    { value: 'research', icon: Search, label: 'Research' },
    { value: 'tools', icon: Library, label: 'Tools' },
    { value: 'partner', icon: HeartPulse, label: 'Partner' },
    { value: 'memory', icon: BrainCircuit, label: 'Memory' },
    { value: 'diagnostics', icon: Activity, label: 'System' },
  ] as const;

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full flex-col"
      >
        <SidebarHeader className="p-0">
          <TabsList className="sticky top-0 z-10 grid grid-cols-5 bg-sidebar/95 backdrop-blur border-b border-sidebar-border rounded-none h-12">
            {tabs.map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="gap-2 data-[state=active]:bg-background px-1"
              >
                <Icon className="size-3" />
                <span className="hidden lg:inline text-[10px]">{label}</span>
              </TabsTrigger>
            ))}
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
              <OnDemandPanel
                label="Memories"
                ready={memoryReady}
                onLoad={() => setMemoryReady(true)}
                onRetry={() => setMemoryKey((k) => k + 1)}
              >
                <div key={memoryKey} className="h-full">
                  <MemoryViewer />
                </div>
              </OnDemandPanel>
            </TabsContent>
          )}

          {activeTab === 'diagnostics' && (
            <TabsContent
              value="diagnostics"
              className="flex-1 m-0 overflow-hidden p-4"
            >
              <OnDemandPanel
                label="Diagnostics"
                ready={diagnosticsReady}
                onLoad={() => setDiagnosticsReady(true)}
                onRetry={() => {
                  setDiagnosticsReady(false);
                  setDiagnosticsKey((k) => k + 1);
                }}
              >
                <div key={diagnosticsKey} className="h-full">
                  <DiagnosticPanel />
                </div>
              </OnDemandPanel>
            </TabsContent>
          )}
        </SidebarContent>
      </Tabs>
    </div>
  );
}
