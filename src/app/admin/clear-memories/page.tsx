'use client';

import { useState } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Trash2, CheckCircle, AlertCircle } from 'lucide-react';

export default function ClearMemoriesPage() {
  const { user, isUserLoading } = useUser();
  const [isClearing, setIsClearing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    count: number;
    message: string;
  } | null>(null);

  const clearOriginMemories = async () => {
    if (!user) {
      setResult({ success: false, count: 0, message: 'Not authenticated' });
      return;
    }

    setIsClearing(true);
    setResult(null);

    try {
      const db = getFirestore(getApp());
      const experiencesRef = collection(db, 'users', user.uid, 'experiences');

      // Clear both Origin and Family story bulk memories
      const originQuery = query(experiencesRef, where('vibe', '==', 'Origin'));
      const familyQuery = query(experiencesRef, where('vibe', '==', 'Family'));

      console.log('🔍 Querying for Origin and Family story memories...');
      const [originSnapshot, familySnapshot] = await Promise.all([
        getDocs(originQuery),
        getDocs(familyQuery),
      ]);

      // Combine both sets
      const allDocs = [...originSnapshot.docs, ...familySnapshot.docs];
      const snapshot = {
        empty: allDocs.length === 0,
        size: allDocs.length,
        docs: allDocs,
      };

      if (snapshot.empty) {
        setResult({
          success: true,
          count: 0,
          message: 'No origin/family story memories found - already clean!',
        });
        setIsClearing(false);
        return;
      }

      console.log(`🗑️  Found ${snapshot.size} memories to delete`);

      // Batch delete
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        console.log(
          `   - Deleting: ${doc.data().suggestion?.substring(0, 60)}...`
        );
        batch.delete(doc.ref);
      });

      await batch.commit();

      setResult({
        success: true,
        count: snapshot.size,
        message: `Successfully deleted ${snapshot.size} old story memories (Origin + Family)!`,
      });
    } catch (error) {
      console.error('❌ Error clearing memories:', error);
      setResult({
        success: false,
        count: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsClearing(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please log in to access admin functions
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>Clear Story Memories</CardTitle>
          <CardDescription>
            Remove old origin story and family story bulk memories that dominate
            recall
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              This will delete all memories with{' '}
              <code>vibe=&apos;Origin&apos;</code> or{' '}
              <code>vibe=&apos;Family&apos;</code> from your Firestore. Family
              story memories will be re-seeded fresh next time you ask for the
              family story.
            </p>
          </div>

          <Button
            onClick={clearOriginMemories}
            disabled={isClearing}
            variant="destructive"
            className="w-full"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isClearing ? 'Clearing...' : 'Clear Origin Memories'}
          </Button>

          {result && (
            <div
              className={`flex items-start gap-3 p-4 rounded-md border ${
                result.success
                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
              }`}
            >
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}
                >
                  {result.message}
                </p>
                {result.success && result.count > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Deleted {result.count} memories
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">What this does:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Queries for all experiences with vibe=&apos;Origin&apos;</li>
              <li>Deletes them in a batch operation</li>
              <li>
                Next seeding will create only 3 parts (matching memory anchors)
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
