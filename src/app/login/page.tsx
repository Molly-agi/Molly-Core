'use client';

import { useAuth, useUser } from '@/firebase';
import { signInAnonymously } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoginPage() {
  const auth = useAuth();
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  const handleSignIn = async () => {
    if (!auth) return;
    try {
      await signInAnonymously(auth);
      router.push('/');
    } catch (error) {
      console.error('Error signing in anonymously', error);
    }
  };

  if (loading || user) {
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Molly</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <p className="text-center text-muted-foreground">
              Continue anonymously to begin your session.
            </p>
            <Button onClick={handleSignIn} className="w-full">
              <UserIcon className="mr-2" />
              Enter Anonymously
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
