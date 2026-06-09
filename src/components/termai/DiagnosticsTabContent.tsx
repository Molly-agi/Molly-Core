'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function retryImport<T>(factory: () => Promise<T>, retries = 1): Promise<T> {
  return factory().catch((err) => {
    if (retries > 0 && err?.name === 'ChunkLoadError') {
      return new Promise<T>((resolve) =>
        setTimeout(() => resolve(retryImport(factory, retries - 1)), 1500)
      );
    }
    throw err;
  });
}

const loadingPlaceholder = (label: string) => {
  const Placeholder = () => (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Loading {label}...
    </div>
  );
  Placeholder.displayName = `LoadingPlaceholder(${label})`;
  return Placeholder;
};

const DiagnosticPanel = dynamic(
  () =>
    retryImport(() =>
      import('@/components/DiagnosticPanel').then((mod) => mod.DiagnosticPanel)
    ),
  { ssr: false, loading: loadingPlaceholder('system diagnostics') }
);

const AgencyAdminWindow = dynamic(
  () =>
    retryImport(() =>
      import('@/components/agency/AgencyAdminWindow').then((mod) => mod.default)
    ),
  { ssr: false, loading: loadingPlaceholder('agency registry') }
);

export function DiagnosticsTabContent() {
  const [sub, setSub] = useState('system');

  return (
    <Tabs value={sub} onValueChange={setSub} className="flex h-full flex-col">
      <TabsList className="grid grid-cols-2 h-9 mb-2">
        <TabsTrigger value="system" className="text-[10px]">
          System
        </TabsTrigger>
        <TabsTrigger value="registry" className="text-[10px]">
          Registry
        </TabsTrigger>
      </TabsList>

      <TabsContent value="system" className="flex-1 m-0 overflow-y-auto">
        <DiagnosticPanel />
      </TabsContent>

      <TabsContent value="registry" className="flex-1 m-0 overflow-y-auto">
        <AgencyAdminWindow compact />
      </TabsContent>
    </Tabs>
  );
}
