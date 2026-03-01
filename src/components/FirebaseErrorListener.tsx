'use client';

import { useState, useEffect, useCallback } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { signInAnonymously } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * On first permission error, attempts to re-authenticate before crashing.
 * Only throws (crashing the React tree) if re-auth also fails.
 */
export function FirebaseErrorListener() {
  const [error, setError] = useState<FirestorePermissionError | null>(null);
  const [recoveryAttempted, setRecoveryAttempted] = useState(false);

  const attemptRecovery = useCallback(async () => {
    try {
      console.warn(
        '[FirebaseErrorListener] Permission error detected — attempting auth recovery'
      );
      const { auth } = initializeFirebase();
      const result = await signInAnonymously(auth);
      console.log(
        '[FirebaseErrorListener] Auth recovery successful:',
        result.user.uid
      );
      // Recovery succeeded — clear the error, don't crash
      setError(null);
      setRecoveryAttempted(false);
    } catch (recoveryError) {
      console.error(
        '[FirebaseErrorListener] Auth recovery failed — crashing:',
        recoveryError
      );
      // Recovery failed — let the error propagate to crash the tree
      setRecoveryAttempted(true);
    }
  }, []);

  useEffect(() => {
    const handleError = (err: FirestorePermissionError) => {
      setError(err);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  // When a permission error arrives, attempt recovery first
  useEffect(() => {
    if (error && !recoveryAttempted) {
      attemptRecovery();
    }
  }, [error, recoveryAttempted, attemptRecovery]);

  // Only throw if recovery was attempted and failed
  if (error && recoveryAttempted) {
    throw error;
  }

  return null;
}
