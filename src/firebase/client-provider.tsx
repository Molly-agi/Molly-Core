'use client';

import { useEffect, useState } from 'react';
import { initializeFirebase, FirebaseProvider } from '@/firebase';
import type { FirebaseServices } from '@/firebase/provider';
import { Skeleton } from '@/components/ui/skeleton';

export default function FirebaseClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [services, setServices] = useState<FirebaseServices | null>(null);

  useEffect(() => {
    const services = initializeFirebase();
    setServices(services);
  }, []);

  if (!services) {
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

  return <FirebaseProvider {...services}>{children}</FirebaseProvider>;
}
