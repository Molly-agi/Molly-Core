'use client';

import { useAuth, useUser } from '@/firebase';
import { signInAnonymously } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoginPage() {
  const auth = useAuth();
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptedAutoSignIn = useRef(false);

  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/');
    }
  }, [user, isUserLoading, router]);

  const handleSignIn = useCallback(async () => {
    if (!auth) {
      setError('Authentication service not available');
      return;
    }

    if (signingIn) return; // Prevent double-clicking

    setSigningIn(true);
    setError(null);

    try {
      console.log('[Login] Initiating anonymous sign-in...');
      await signInAnonymously(auth);
      console.log('[Login] Sign-in successful');
      router.push('/');
    } catch (error) {
      console.error('[Login] Error signing in anonymously:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to sign in';
      setError(errorMessage);
      setSigningIn(false);
    }
  }, [auth, signingIn, router]);

  // Auto-signin on mount if no user is present
  useEffect(() => {
    if (!attemptedAutoSignIn.current && !isUserLoading && !user && auth) {
      attemptedAutoSignIn.current = true;
      console.log('[Login] Auto-attempting anonymous sign-in');
      // Defer to next microtask to avoid synchronous setState cascade
      queueMicrotask(() => {
        handleSignIn();
      });
    }
  }, [isUserLoading, user, auth, handleSignIn]);

  if (isUserLoading || user || signingIn) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-64 space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {signingIn ? 'Signing in...' : 'Loading...'}
            </p>
          </div>
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
            {error && (
              <div className="p-3 rounded bg-destructive/10 border border-destructive/50">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            {userError && (
              <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/50">
                <p className="text-xs text-yellow-600">
                  Auth service issue: {userError.message}
                </p>
              </div>
            )}
            <p className="text-center text-muted-foreground">
              Continue anonymously to begin your session.
            </p>
            <Button
              onClick={handleSignIn}
              className="w-full"
              disabled={signingIn}
            >
              <UserIcon className="mr-2" />
              {signingIn ? 'Signing in...' : 'Enter Anonymously'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
