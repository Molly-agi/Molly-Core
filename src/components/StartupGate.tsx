'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            Staggered startup: preparing core systems...
          </p>
          <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return <Dashboard />;
}
