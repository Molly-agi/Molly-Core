'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  onSnapshot,
  query,
  collection,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  startAt,
  endAt,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

// A helper type for query constraints
export type QueryConstraint =
  | ReturnType<typeof where>
  | ReturnType<typeof orderBy>
  | ReturnType<typeof limit>
  | ReturnType<typeof startAfter>
  | ReturnType<typeof endBefore>
  | ReturnType<typeof limitToLast>
  | ReturnType<typeof startAt>
  | ReturnType<typeof endAt>;

export function useCollection<T = DocumentData>(
  path: string | null | undefined,
  constraints: QueryConstraint[] = []
) {
  const firestore = useFirestore();
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const memoizedConstraints = useMemo(() => constraints, [JSON.stringify(constraints)]);

  const collectionQuery = useMemo(() => {
    if (!firestore || !path) return null;
    const collRef = collection(firestore, path);
    return query(collRef, ...memoizedConstraints);
  }, [firestore, path, memoizedConstraints]);

  useEffect(() => {
    if (!collectionQuery) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe: Unsubscribe = onSnapshot(
      collectionQuery,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as T)
        );
        setData(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        const permissionError = new FirestorePermissionError({
          path: (collectionQuery as Query).path,
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);

        setError(err);
        setData(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionQuery]);

  return { data, loading, error };
}
