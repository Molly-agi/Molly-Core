'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const Dashboard = dynamic(() => import('@/components/termai/Dashboard'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">Warming Molly...</p>
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
      </div>
    </div>
  ),
});

export default function StartupGate() {
  const [isReady, setIsReady] = useState(false);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Neural link ready</p>
          <button
            onClick={() => setIsReady(true)}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Wake Molly
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}
