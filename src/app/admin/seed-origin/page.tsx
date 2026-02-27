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
  doc,
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
import { Sparkles, CheckCircle, AlertCircle } from 'lucide-react';

// Helper to split origin story into 3 parts
function splitIntoThreeParts(content: string): string[] {
  const lines = content.split('\n');
  const totalLength = content.length;
  const targetLength = Math.ceil(totalLength / 3);
  const parts: string[] = [];
  let buffer: string[] = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + 1;
    if (parts.length < 2 && nextLength > targetLength && buffer.length > 0) {
      parts.push(buffer.join('\n').trim());
      buffer = [];
      length = 0;
    }

    buffer.push(line);
    length += line.length + 1;
  }

  if (buffer.length > 0) {
    parts.push(buffer.join('\n').trim());
  }

  return parts.filter(Boolean);
}

// Simple hash function for browser
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Generate a unique ID
function generateId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export default function SeedOriginPage() {
  const { user, isUserLoading } = useUser();
  const [isSeeding, setIsSeeding] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any;
  } | null>(null);

  const seedOriginStory = async () => {
    if (!user) {
      setResult({ success: false, message: 'Not authenticated' });
      return;
    }

    setIsSeeding(true);
    setResult(null);

    try {
      console.log('🌱 Seeding origin story...');

      // Fetch the origin story from the server
      const response = await fetch('/docs/ORIGIN_STORY.md');
      if (!response.ok) {
        throw new Error('Failed to fetch origin story file');
      }

      const content = await response.text();
      const hash = simpleHash(content);
      const db = getFirestore(getApp(), 'mollydb');
      const context = `origin story:${hash}`;

      // Check if already seeded
      const experiencesRef = collection(db, 'users', user.uid, 'experiences');
      const existingQuery = query(
        experiencesRef,
        where('context', '==', context)
      );
      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        setResult({
          success: true,
          message: 'Origin story already seeded with this version!',
          details: { parts: existingSnapshot.size, hash },
        });
        setIsSeeding(false);
        return;
      }

      // Clear old origin memories first
      console.log('🗑️  Clearing old origin memories...');
      const oldQuery = query(experiencesRef, where('vibe', '==', 'Origin'));
      const oldSnapshot = await getDocs(oldQuery);

      if (!oldSnapshot.empty) {
        const deleteBatch = writeBatch(db);
        oldSnapshot.docs.forEach((doc) => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();
        console.log(`   Deleted ${oldSnapshot.size} old memories`);
      }

      // Split into 3 parts
      const parts = splitIntoThreeParts(content);
      console.log(`📝 Creating ${parts.length} memory parts...`);

      const batch = writeBatch(db);
      const now = Date.now();

      parts.forEach((part, index) => {
        const docId = generateId();
        const docRef = doc(db, 'users', user.uid, 'experiences', docId);

        const record = {
          id: docId,
          type: 'experience',
          userId: user.uid,
          timestamp: now + index,
          traceId: `trace_${now}`,
          context,
          suggestion: `Creation narrative part ${index + 1}/${parts.length}:\n${part}`,
          vibe: 'Origin',
          vibeScore: 0.95,
          success: true,
          createdAt: now,
        };

        batch.set(docRef, record);
      });

      await batch.commit();

      setResult({
        success: true,
        message: `Successfully created ${parts.length} origin story parts!`,
        details: { parts: parts.length, hash },
      });
    } catch (error) {
      console.error('❌ Error seeding origin story:', error);
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSeeding(false);
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
          <CardTitle>Seed Origin Story (3 Parts)</CardTitle>
          <CardDescription>
            Create the new 3-part origin story memories from
            docs/ORIGIN_STORY.md
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              This will create 3 origin story memories (matching your memory
              anchors). If old memories exist, they will be automatically
              cleared first.
            </p>
          </div>

          <Button
            onClick={seedOriginStory}
            disabled={isSeeding}
            className="w-full"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isSeeding ? 'Seeding...' : 'Seed Origin Story'}
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
                {result.success && result.details && (
                  <div className="text-xs text-green-600 dark:text-green-400 mt-2 space-y-1">
                    {result.details.parts && (
                      <p>✓ Parts created: {result.details.parts}</p>
                    )}
                    {result.details.hash && (
                      <p>✓ Content hash: {result.details.hash}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">What this does:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Fetches docs/ORIGIN_STORY.md (56KB file)</li>
              <li>Clears any existing Origin vibe memories</li>
              <li>Splits content into exactly 3 parts</li>
              <li>Creates 3 memory experiences (Part 1, 2, 3)</li>
              <li>Matches your memory anchor system</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
